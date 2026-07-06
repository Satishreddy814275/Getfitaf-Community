import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PostComposer from '@/components/PostComposer'
import FeedTabs from '@/components/FeedTabs'
import LeaderboardList from '@/components/LeaderboardList'
import type { Post, LeaderboardRow } from '@/types'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string; title?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const lessonId = params.lesson || null
  const lessonTitle = params.title || null

  const [profileRes, postsRes, streakRes, leaderboardRes] = await Promise.all([
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    supabase
      .from('posts')
      .select(
        `
      id, content, media_url, media_type, is_announcement, created_at,
      profiles ( id, full_name, avatar_url ),
      comments ( id, content, created_at, profiles ( id, full_name, avatar_url ) ),
      likes ( id, user_id )
    `
      )
      .order('is_announcement', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('get_user_streak', { uid: user.id }),
    supabase.rpc('get_community_leaderboard'),
  ])

  const isAdmin = !!profileRes.data?.is_admin
  const posts = postsRes.data
  const streak = typeof streakRes.data === 'number' ? streakRes.data : 0
  const topFive = ((leaderboardRes.data as LeaderboardRow[] | null) || []).slice(0, 5)

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      {streak > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-orange-400">
          <span>🔥</span>
          <span>
            {streak} day{streak === 1 ? '' : 's'} active streak
          </span>
        </div>
      )}
      {topFive.length > 0 && (
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-white text-sm font-semibold">🏆 Community Leaderboard</p>
            <Link
              href="/leaderboard"
              className="text-orange-500 hover:text-orange-400 text-xs font-medium transition"
            >
              View full →
            </Link>
          </div>
          <p className="text-zinc-500 text-xs mb-2">Most active this month</p>
          <LeaderboardList rows={topFive} />
        </div>
      )}
      <PostComposer isAdmin={isAdmin} initialLessonId={lessonId} initialLessonTitle={lessonTitle} />
      <div className="mt-8">
        <FeedTabs posts={(posts as unknown as Post[] | null) || []} currentUserId={user.id} />
      </div>
    </div>
  )
}
