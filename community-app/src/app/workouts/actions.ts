'use server'

import { createClient } from '@/lib/supabase/server'
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
  week: number
  day: number
  dayLabel: string
  sets: LoggedSetInput[]
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .insert({
      profile_id: user.id,
      generation_id: input.generationId,
      week_number: input.week,
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
