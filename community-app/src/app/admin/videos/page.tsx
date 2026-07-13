import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminExerciseVideosList from '@/components/AdminExerciseVideosList'
import { findExerciseVideo } from '@/lib/exerciseVideos'
import type { WorkoutPlanDay } from '@/types'

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

  const { data: videosData } = await supabase
    .from('exercise_videos')
    .select('id, exercise_name, video_url, created_at, added_by, profiles ( full_name )')
    .order('exercise_name')

  const videos = (videosData || []).map((v) => ({
    id: v.id,
    exercise_name: v.exercise_name,
    video_url: v.video_url,
    created_at: v.created_at,
    added_by_name: (v.profiles as unknown as { full_name: string | null } | null)?.full_name || null,
  }))

  // Computed fresh on every page load, not cached - counts how often
  // each exercise name has actually shown up across every generated
  // plan, then filters to the ones with no matching video yet, ranked
  // most-common first. Same matching logic as the member-facing
  // /workouts view, so "needs a video" here always agrees with what
  // members actually see as missing. Fine to recompute live at the
  // current scale (a few hundred generations at most) - see
  // project memory for the scaling plan if this ever needs to move to
  // a precomputed/cached table.
  //
  // Admin (service-role) client required here - workout_generations
  // has no RLS policies at all (the workout builder has no login of
  // its own, see project memory), so the regular authenticated client
  // silently gets zero rows back instead of an error, which is exactly
  // why this looked like "no data" rather than "wrong client."
  const { data: generationsData } = await createAdminClient()
    .from('workout_generations')
    .select('structured_plan')
    .not('structured_plan', 'is', null)

  const frequency = new Map<string, number>()
  for (const gen of generationsData || []) {
    const days = ((gen.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days || []) as WorkoutPlanDay[]
    for (const day of days) {
      for (const ex of day.exercises || []) {
        if (!ex?.name) continue
        frequency.set(ex.name, (frequency.get(ex.name) || 0) + 1)
      }
    }
  }

  const matchableVideos = videos.map((v) => ({ exerciseName: v.exercise_name, videoUrl: v.video_url }))
  const needsVideo = Array.from(frequency.entries())
    .filter(([name]) => !findExerciseVideo(name, matchableVideos))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }))

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
          Add a video and it'll automatically show up in the workout logging view for any
          exercise with a matching name - past plans included, no regeneration needed.
        </p>
      </div>

      <AdminExerciseVideosList videos={videos || []} needsVideo={needsVideo} />
    </div>
  )
}
