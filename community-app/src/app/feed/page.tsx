import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FeedTabs from '@/components/FeedTabs'
import LeaderboardList from '@/components/LeaderboardList'
import type { Post, LeaderboardRow } from '@/types'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string; title?: string; post?: string; comment?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const lessonId = params.lesson || null
  const lessonTitle = params.title || null
  // Set when arriving from a notification link (?post=<id>) — FeedTabs
  // opens that exact post in its overlay on load, regardless of which
  // tab it'd normally sit under. No extra fetch needed: posts are
  // loaded unpaginated below, so the target post is already present
  // unless it's been deleted, which FeedTabs handles as a "not found"
  // case.
  const initialPostId = params.post || null
  // Set when the notification was about a specific comment/reply
  // (?comment=<id>) — the opened post auto-expands its comments and
  // scrolls to/highlights this one, instead of landing on the post
  // with comments still collapsed.
  const initialCommentId = params.comment || null

  const [profileRes, postsRes, streakRes, leaderboardRes] = await Promise.all([
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    supabase
      .from('posts')
      .select(
        `
      id, content, media_url, media_type, is_announcement, pinned, created_at,
      profiles ( id, full_name, avatar_url ),
      comments ( id, content, created_at, parent_comment_id, profiles ( id, full_name, avatar_url ), comment_likes ( id, user_id, profiles ( id, full_name, avatar_url ) ) ),
      likes ( id, user_id, profiles ( id, full_name, avatar_url ) )
    `
      )
      .order('pinned', { ascending: false })
      .order('is_announcement', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('get_user_streak', { uid: user.id }),
    supabase.rpc('get_community_leaderboard'),
  ])

  const isAdmin = !!profileRes.data?.is_admin
  const posts = (postsRes.data as unknown as Post[] | null) || []
  const streak = typeof streakRes.data === 'number' ? streakRes.data : 0
  const allRankings = (leaderboardRes.data as LeaderboardRow[] | null) || []
  const topFive = allRankings.slice(0, 5)
  const myRow = allRankings.find((r) => r.user_id === user.id)
  const inTopFive = topFive.some((r) => r.user_id === user.id)
  const fifthPlaceScore = topFive[4]?.score ?? null

  return (
    <div className="max-w-6xl mx-auto w-full py-8 px-4 sm:px-6">
      {streak > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-orange-400">
          <span>🔥</span>
          <span>
            {streak} day{streak === 1 ? '' : 's'} active streak
          </span>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Tabs, mobile leaderboard teaser, composer, and feed — FeedTabs
            supplies its own lg:col-span-3 (tab bar) and lg:col-span-2
            (everything else) grid-item children directly, so it must be
            rendered as a direct grid child here, not wrapped in a div. */}
        <FeedTabs
          posts={posts}
          currentUserId={user.id}
          isAdmin={isAdmin}
          initialLessonId={lessonId}
          initialLessonTitle={lessonTitle}
          initialPostId={initialPostId}
          initialCommentId={initialCommentId}
          leaderboardRows={topFive}
        />

        {/* Sidebar — desktop only, full detailed leaderboard, sticky */}
        <div className="hidden lg:block lg:sticky lg:top-6">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-white text-sm font-semibold">🏆 Leaderboard</p>
              <Link
                href="/leaderboard"
                className="text-orange-500 hover:text-orange-400 text-xs font-medium transition"
              >
                View full →
              </Link>
            </div>
            <p className="text-zinc-500 text-xs mb-2">Most active this month</p>
            <LeaderboardList rows={topFive} currentUserId={user.id} />

            {topFive.length > 0 && !inTopFive && myRow && fifthPlaceScore !== null && (
              <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-800">
                You&apos;re <span className="text-white font-medium">#{myRow.rank}</span> with{' '}
                {myRow.score} this month — {Math.max(fifthPlaceScore - myRow.score, 1)} more to reach
                the top 5.
              </p>
            )}
            {topFive.length > 0 && !myRow && (
              <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-800">
                You haven&apos;t posted or commented this month yet — jump in to get on the board.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
