'use server'

import { createClient } from '@/lib/supabase/server'
import { getSiblingGenerationIds } from '@/lib/workoutPlan'
import { revalidatePath } from 'next/cache'

interface LoggedSetInput {
  exerciseName: string
  setNumber: number
  weight: number | null
  reps: number | null
}

// Logs an entire completed session in one write, rather than one
// round-trip per set - simpler than syncing every keystroke, and
// nothing is saved at all until someone actually finishes a workout.
// workout_sessions/workout_logged_sets use the normal (non-admin)
// client on purpose: unlike workout_intakes/workout_generations, these
// two tables DO have RLS policies scoping rows to profile_id =
// auth.uid(), since they belong to a real logged-in community-app
// member (see migration-workout-logging.sql).
export async function logWorkoutSession(input: {
  generationId: string
  day: number
  dayLabel: string
  sets: LoggedSetInput[]
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // The week number is never picked manually or copied from the
  // template (which only ever describes one week, since the AI only
  // generates one week per response) - it's however many times this
  // member has already completed this exact day before, plus one.
  // First time doing "Day 1" is Week 1, the next time (whenever they
  // get to it) is Week 2, and so on. Counts across any regeneration of
  // the same intake, not just this specific generation - see
  // getSiblingGenerationIds for why.
  const siblingGenerationIds = await getSiblingGenerationIds(input.generationId)
  const { count } = await supabase
    .from('workout_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .eq('day_number', input.day)
    .in('generation_id', siblingGenerationIds)
    .not('completed_at', 'is', null)

  const weekNumber = (count || 0) + 1

  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .insert({
      profile_id: user.id,
      generation_id: input.generationId,
      week_number: weekNumber,
      day_number: input.day,
      day_label: input.dayLabel,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(sessionError?.message || 'Failed to save workout session')
  }

  // Skip rows where nothing was actually entered - someone might start
  // logging an exercise, add a row, then leave it blank.
  const rows = input.sets
    .filter((s) => s.weight !== null || s.reps !== null)
    .map((s) => ({
      session_id: session.id,
      profile_id: user.id,
      exercise_name: s.exerciseName,
      set_number: s.setNumber,
      weight: s.weight,
      reps: s.reps,
    }))

  if (rows.length > 0) {
    const { error: setsError } = await supabase.from('workout_logged_sets').insert(rows)
    if (setsError) throw new Error(setsError.message)
  }

  revalidatePath('/workouts')
}
