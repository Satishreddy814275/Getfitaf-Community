import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FeedTabs from '@/components/FeedTabs'
import LeaderboardList from '@/components/LeaderboardList'
import WorkoutBuilderCard from '@/components/WorkoutBuilderCard'
import WorkoutBuilderPromptModal from '@/components/WorkoutBuilderPromptModal'
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

  const [profileRes, membershipRes, postsRes, streakRes, leaderboardRes, enrollmentRes] =
    await Promise.all([
      supabase.from('profiles').select('is_admin, approved').eq('id', user.id).single(),
      supabase
        .from('space_memberships')
        .select('space')
        .eq('profile_id', user.id)
        .eq('space', 'low_ticket')
        .maybeSingle(),
      supabase
        .from('posts')
        .select(
          `
      id, content, media_url, media_type, is_announcement, pinned, space, created_at,
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
      // program_enrollments has proper RLS (owner-scoped), unlike the
      // old workout_intakes check this replaced - no admin client
      // needed here anymore.
      supabase.from('program_enrollments').select('id').eq('profile_id', user.id).limit(1).maybeSingle(),
    ])

  const isAdmin = !!profileRes.data?.is_admin
  const isApproved = !!profileRes.data?.approved
  const hasLowTicket = !!membershipRes.data
  const hasSelectedProgram = !!enrollmentRes.data

  // Nobody should ever land on a blank, empty-looking feed with no
  // explanation — that's a dead end, not an experience. If someone's
  // logged in but has no active membership in either space (most
  // commonly: signed up but never actually paid), send them to /join
  // instead, which explains the situation and gives them a way to
  // pay. /join itself detects that they're already logged in and
  // adjusts its messaging accordingly (see src/app/join/page.tsx).
  if (!isAdmin && !isApproved && !hasLowTicket) {
    redirect('/join')
  }

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

      {/* Two-tier reminder for low-ticket members who haven't picked a
          program yet, both gated on the same condition. The card is
          unconditional page content - no dismiss state, just quietly
          sits above the feed on every visit. The popup only shows once
          a day (localStorage) - dismissing it slides it away to reveal
          the card that was already there underneath. Once a program's
          actually picked, both disappear for good and only the "Choose
          Your Program" nav link remains. */}
      {hasLowTicket && !hasSelectedProgram && (
        <>
          <WorkoutBuilderCard href="/programs" />
          <WorkoutBuilderPromptModal
            href="/programs"
            storageKey={`program-prompt-dismissed-${user.id}`}
          />
        </>
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
