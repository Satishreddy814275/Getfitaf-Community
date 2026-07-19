import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminExerciseVideosList from '@/components/AdminExerciseVideosList'
import { findExerciseVideo } from '@/lib/exerciseVideos'
import { baseExerciseName } from '@/lib/workoutBlocks'
import type { WorkoutPlanDay, ExerciseCatalogEntry } from '@/types'

// See admin/page.tsx for why this is forced dynamic.
export const dynamic = 'force-dynamic'

export default async function AdminVideosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/feed')

  // videosData/exercisesData are independent of generationsData/
  // templatesData below, so all four are fetched together in one
  // Promise.all rather than running as separate round-trips.
  // exercisesData feeds the "Catalog" tab (see AdminExercisesList) -
  // folded in here rather than kept as its own /admin/exercises page,
  // per Satish's call to put everything about an exercise in one place.
  const [{ data: videosData }, { data: generationsData }, { data: templatesData }, { data: exercisesData }] =
    await Promise.all([
      supabase
        .from('exercise_videos')
        .select(
          'id, exercise_name, video_url, coach_notes, created_at, added_by, video_type, is_placeholder, profiles ( full_name )'
        )
        .order('exercise_name'),
      createAdminClient()
        .from('workout_generations')
        .select('structured_plan')
        .not('structured_plan', 'is', null),
      supabase.from('program_templates').select('structured_plan'),
      supabase
        .from('exercises')
        .select('id, name, muscle_groups, equipment_tags, type_tags, other_tags')
        .order('name'),
    ])

  const exercises: ExerciseCatalogEntry[] = (exercisesData || []).map((e) => ({
    id: e.id,
    name: e.name,
    muscleGroups: e.muscle_groups || [],
    equipmentTags: e.equipment_tags || [],
    typeTags: e.type_tags || [],
    otherTags: e.other_tags || [],
  }))

  const videos = (videosData || []).map((v) => ({
    id: v.id,
    exercise_name: v.exercise_name,
    video_url: v.video_url,
    coach_notes: v.coach_notes,
    created_at: v.created_at,
    added_by_name: (v.profiles as unknown as { full_name: string | null } | null)?.full_name || null,
    video_type: (v.video_type as 'tutorial' | 'demo') || 'tutorial',
    is_placeholder: !!v.is_placeholder,
  }))

  // Computed fresh on every page load, not cached - counts how often
  // each exercise name has actually shown up. Same matching logic as
  // the member-facing /workouts view, so "needs a video" here always
  // agrees with what members actually see as missing. Fine to
  // recompute live at the current scale - see project memory for the
  // scaling plan if this ever needs to move to a precomputed/cached
  // table.
  //
  // Counts from TWO sources: workout_generations (the AI builder's
  // past output - still relevant, it still serves the free funnel) and
  // program_templates (the admin-authored programs - Upper Body A,
  // Foundations, etc., which is where actual paying members' content
  // has lived since the pivot off AI-generated plans). Originally this
  // only scanned workout_generations, which meant it silently stopped
  // reflecting reality once program_templates became the real content
  // - it could show zero "needs a video" entries even while an
  // admin-authored program had gaps, since that content was never
  // counted at all.
  //
  // Admin (service-role) client required for workout_generations -
  // that table has no RLS policies at all (the workout builder has no
  // login of its own, see project memory), so the regular authenticated
  // client silently gets zero rows back instead of an error. program_templates
  // has real RLS letting admins read it directly, same as /admin/programs.

  // Keyed by base exercise name (round/set suffix stripped), not the
  // raw stored name - structured_plan unrolls a 3-round circuit into
  // "Squats (Round 1)", "Squats (Round 2)", "Squats (Round 3)" as
  // separate rows, which used to mean each round showed up as its own
  // "needs a video" entry even though they're all the same exercise.
  // Same helper the admin day editor uses to collapse those rows back
  // into one block.
  const frequency = new Map<string, number>()
  function countDays(days: WorkoutPlanDay[]) {
    for (const day of days) {
      for (const ex of day.exercises || []) {
        if (!ex?.name) continue
        const base = baseExerciseName(ex.name)
        if (!base) continue
        frequency.set(base, (frequency.get(base) || 0) + 1)
      }
    }
  }
  for (const gen of generationsData || []) {
    countDays(((gen.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days || []) as WorkoutPlanDay[])
  }
  for (const tpl of templatesData || []) {
    countDays(((tpl.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days || []) as WorkoutPlanDay[])
  }

  // Full lists, no top-N cap - AdminExerciseVideosList turns these into
  // a searchable/sortable table instead, so a long tail past whatever
  // used to be the top 15 is still reachable. Computed once per type
  // (tutorial/demo), the client component switches between them with
  // the Tutorial/Demo tab.
  function needsVideoFor(type: 'tutorial' | 'demo') {
    const matchable = videos
      .filter((v) => v.video_type === type)
      .map((v) => ({ exerciseName: v.exercise_name, videoUrl: v.video_url }))
    return Array.from(frequency.entries())
      .filter(([name]) => !findExerciseVideo(name, matchable))
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Moderation
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Exercise Videos</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Add a video and it&apos;ll automatically show up in the workout logging view for any
          exercise with a matching name - past plans included, no regeneration needed.
        </p>
      </div>

      <AdminExerciseVideosList
        videos={videos || []}
        needsVideoByType={{ tutorial: needsVideoFor('tutorial'), demo: needsVideoFor('demo') }}
        exercises={exercises}
      />
    </div>
  )
}
