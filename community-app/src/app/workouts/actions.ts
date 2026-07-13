'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
//
// `week` is now an explicit choice, not auto-computed - the picker
// shows the full 4-week grid (same weekly split repeated, since the
// template only ever describes one week) and the member taps a
// specific week/day cell, so we just save exactly what they picked.
// Re-logging an already-completed cell is allowed on purpose (people
// redo/correct a session) - it just adds another row for that same
// week/day rather than being blocked.
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

// "No video yet" fallback action - posts a request into the member's
// own community space (public, not a private admin queue - Satish's
// explicit choice, so any coach or member can jump in and help) so
// coverage grows from real demand rather than Satish guessing what to
// film next. Once he (or anyone) actually adds a matching video via
// /admin/videos, findExerciseVideo() picks it up automatically on
// every plan referencing that exercise name - no extra step needed to
// "resolve" the request.
export async function requestExerciseVideo(exerciseName: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: membership } = await supabase
    .from('space_memberships')
    .select('space')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle()
  const space = membership?.space || 'premium'

  await supabase.from('posts').insert({
    author_id: user.id,
    content: `Does anyone have a good video for "${exerciseName}"? Would love a quick demo if you've got one to share.`,
    space,
  })

  revalidatePath('/feed')
}

// Picking a program from the library (see migration-program-templates.sql)
// creates the enrollment row getActiveWorkoutPlan resolves against -
// replaces what used to be a trip through the external AI builder.
// Goes through the normal authenticated client, not admin - RLS on
// program_enrollments already scopes inserts to profile_id = auth.uid(),
// no need to bypass it here.
export async function selectProgram(programTemplateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('program_enrollments').insert({
    profile_id: user.id,
    program_template_id: programTemplateId,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/workouts')
  revalidatePath('/programs')
  redirect('/workouts')
}

// Records a swap (see migration-exercise-swaps.sql) - never touches
// workout_generations.structured_plan itself, just an overlay row
// that /workouts merges in at render time. weekNumber 0 means "every
// week"; upserted on (generation, profile, day, week, original name)
// so swapping the same slot again updates this row instead of
// stacking duplicates, and typing the true original name back in is
// how a member reverts - no separate "undo" path needed.
export async function swapExercise(input: {
  generationId: string
  day: number
  weekNumber: number
  originalExerciseName: string
  newExerciseName: string
  sets: string
  reps: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const trimmedName = input.newExerciseName.trim()
  if (!trimmedName) return

  await supabase.from('workout_exercise_swaps').upsert(
    {
      profile_id: user.id,
      generation_id: input.generationId,
      day_number: input.day,
      week_number: input.weekNumber,
      original_exercise_name: input.originalExerciseName,
      new_exercise_name: trimmedName,
      sets: input.sets,
      reps: input.reps,
    },
    { onConflict: 'generation_id,profile_id,day_number,week_number,original_exercise_name' }
  )

  revalidatePath('/workouts')
}
