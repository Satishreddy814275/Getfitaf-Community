import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ExerciseLibrary from '@/components/ExerciseLibrary'
import ExercisesGuestBar from '@/components/ExercisesGuestBar'

export const metadata: Metadata = {
  title: 'Exercise Library — GetFit AF',
  description:
    "Browse GetFit AF's exercise library - real coach-shot form videos for every movement.",
}

// Reads real per-request data (which exercises currently have real
// footage - changes as Satish shoots more), and this page is reachable
// with no session at all (see middleware.ts), so nothing here can be
// statically optimized at build time regardless.
export const dynamic = 'force-dynamic'

interface ExerciseVideoRow {
  exercise_id: string
  video_url: string
  coach_notes: string | null
  video_type: 'tutorial' | 'demo'
  exercises: { id: string; name: string; muscle_groups: string[] | null } | null
}

// Reachable with no login at all (see middleware.ts) as well as by any
// logged-in member, free or paid - the content is identical either
// way, there's no tier gating within the library itself (Satish's
// explicit call 2026-08-03). Logged-in members get the normal app
// chrome (AppNav) around this same page automatically via the root
// layout; AppNav never renders for a signed-out visitor at all (see
// layout.tsx), so this page renders its own small ExercisesGuestBar
// instead when there's no user - otherwise a logged-out visitor would
// have no way to join or leave an email from here at all.
export default async function ExerciseLibraryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Queried from exercise_videos (not exercises) so the is_placeholder
  // filter applies directly at the root of the query rather than
  // through an embedded-table filter - same pattern already used
  // elsewhere in this codebase (see AdminExerciseVideosList's data
  // loading). exercises is nested purely for the display name; the FK
  // (exercise_videos.exercise_id -> exercises.id, see the "Has video"
  // badge work) guarantees it's always present.
  const { data } = await supabase
    .from('exercise_videos')
    .select('exercise_id, video_url, coach_notes, video_type, exercises ( id, name, muscle_groups )')
    .eq('is_placeholder', false)

  const rows = (data as unknown as ExerciseVideoRow[] | null) || []

  // One card per exercise. An exercise could in principle have more
  // than one real video (e.g. a 'tutorial' and a 'demo') - prefers
  // 'tutorial' since that's the library members already see inside
  // real workouts, so the two experiences show the same clip for the
  // same exercise. Today's real dataset is 100% 'tutorial' anyway (no
  // 'demo' videos added yet), so this mostly just picks the only one.
  const byExercise = new Map<
    string,
    { id: string; name: string; videoUrl: string; coachNotes: string | null; muscleGroups: string[] }
  >()
  for (const row of rows) {
    if (!row.exercises) continue
    const existing = byExercise.get(row.exercise_id)
    if (!existing || row.video_type === 'tutorial') {
      byExercise.set(row.exercise_id, {
        id: row.exercise_id,
        name: row.exercises.name,
        videoUrl: row.video_url,
        coachNotes: row.coach_notes,
        muscleGroups: row.exercises.muscle_groups || [],
      })
    }
  }
  const exercises = Array.from(byExercise.values()).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-5xl mx-auto w-full py-8 px-4 sm:px-6">
      {!user && <ExercisesGuestBar />}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Exercise Library</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Real form videos, shot by your coaches - search for any exercise to see how it&apos;s
          done.
        </p>
      </div>
      <ExerciseLibrary exercises={exercises} />
    </div>
  )
}
