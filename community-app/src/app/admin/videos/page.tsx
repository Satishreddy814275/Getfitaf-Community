import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminExerciseVideosList from '@/components/AdminExerciseVideosList'

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

      <AdminExerciseVideosList videos={videos || []} />
    </div>
  )
}
