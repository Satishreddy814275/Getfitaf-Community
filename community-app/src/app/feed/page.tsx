import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FeedTabs from '@/components/FeedTabs'
import InstallAppBanner from '@/components/InstallAppBanner'
import PushNotificationsBanner from '@/components/PushNotificationsBanner'
import LeaderboardList from '@/components/LeaderboardList'
import WorkoutBuilderCard from '@/components/WorkoutBuilderCard'
import Tour from '@/components/Tour'
import RulesGate from '@/components/RulesGate'
import { getCommunityGuidelines } from '@/lib/communityGuidelines'
import { FEED_PAGE_SIZE, FEED_POST_SELECT } from '@/lib/feedPosts'
import type { Post, LeaderboardRow, Space } from '@/types'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    lesson?: string
    title?: string
    post?: string
    comment?: string
    prefill?: string
    tour?: string
  }>
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
  // Set when arriving from the workout finish-celebration modal's
  // "Post a win in the community" button (?prefill=<text>) - a plain
  // starting draft for the composer, unrelated to the lesson-
  // completion pair above (see PostComposer's own comment on why they
  // stay separate).
  const initialContent = params.prefill || null
  // Set by the "Take the tour" link on /help (?tour=1) - forces the
  // tour to re-run for anyone who dismissed it originally or just
  // wants to look again, independent of its own "seen" flag.
  const forceTour = params.tour === '1'

  // Kicked off alongside the queries below rather than awaited inline -
  // it's a separate admin-client read (see communityGuidelines.ts), not
  // part of this page's own supabase client / RLS-scoped batch, but
  // there's no reason to block one on the other.
  const guidelinesPromise = getCommunityGuidelines()

  const [profileRes, membershipRes, postsRes, streakRes, leaderboardRes, enrollmentRes] =
    await Promise.all([
      supabase.from('profiles').select('is_admin, approved').eq('id', user.id).single(),
      supabase
        .from('space_memberships')
        .select('space')
        .eq('profile_id', user.id)
        .eq('space', 'low_ticket')
        .maybeSingle(),
      // First page only now (see loadMorePosts in feed/actions.ts for
      // the rest) - this query used to pull every post ever made, plus
      // every comment/like on each, unbounded. Fine at low post counts,
      // but it only grows from here and would eventually make every
      // single feed visit slower. Same three-key order as before
      // (pinned, then announcements, then newest), which is also why
      // plain offset pagination is safe here without a compound
      // cursor: a post's position in that order never changes once
      // it's been fetched, so `.range()` can't reshuffle something a
      // later page already showed. The one real edge case - a new post
      // getting pinned or created while someone's mid-scroll - just
      // means an occasional repeat or one-post gap until they refresh,
      // acceptable at this community's size.
      supabase
        .from('posts')
        .select(FEED_POST_SELECT)
        .order('pinned', { ascending: false })
        .order('is_announcement', { ascending: false })
        .order('created_at', { ascending: false })
        .range(0, FEED_PAGE_SIZE - 1),
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

  // Which spaces this person actually has access to - drives whether
  // FeedTabs shows a space switcher at all, and which spaces it offers.
  // Admins get both regardless of their own approved/membership state
  // (matches the is_admin() bypass in has_space_access()). Everyone
  // else: premium via the existing `approved` flag, low_ticket via the
  // membership row already fetched above - either, neither, or both.
  // Order is fixed (premium first) so a dual-access member's default
  // tab matches what a premium-only member already sees today.
  const availableSpaces: Space[] = isAdmin
    ? ['premium', 'low_ticket']
    : [...(isApproved ? (['premium'] as const) : []), ...(hasLowTicket ? (['low_ticket'] as const) : [])]

  // Nobody should ever land on a blank, empty-looking feed with no
  // explanation — that's a dead end, not an experience. If someone's
  // logged in but has no active membership in either space (most
  // commonly: signed up but never actually paid), send them straight
  // to /beta, which explains the situation and gives them a way to
  // pay. Used to bounce through /join first, but /join is now just a
  // permanent redirect to /beta (see src/app/join/page.tsx) - going
  // there directly skips the pointless extra hop.
  if (!isAdmin && !isApproved && !hasLowTicket) {
    redirect('/beta')
  }

  const guidelines = await guidelinesPromise
  let posts = (postsRes.data as unknown as Post[] | null) || []
  // First page fetched exactly FEED_PAGE_SIZE rows means there's
  // probably more to scroll to - the same "did this page fill up"
  // heuristic .range() pagination normally uses instead of a separate
  // count query.
  const hasMorePosts = posts.length === FEED_PAGE_SIZE

  // Notification links (?post=<id>) used to always work because every
  // post was loaded - now that only the first page is, an old post a
  // notification points at might not be in it. FeedTabs' own lookup
  // (posts.find) is unchanged; this just makes sure the target post is
  // actually present in the array it's searching, one extra query only
  // when it's needed.
  if (initialPostId && !posts.some((p) => p.id === initialPostId)) {
    const { data: linkedPost } = await supabase
      .from('posts')
      .select(FEED_POST_SELECT)
      .eq('id', initialPostId)
      .maybeSingle()
    if (linkedPost) posts = [linkedPost as unknown as Post, ...posts]
  }

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

      {/* Unconditional (everyone benefits from installing, not just
          low-ticket members) - self-hides once already installed or
          snoozed for the day, see InstallAppBanner's own logic. */}
      <InstallAppBanner storageKey={`install-prompt-dismissed-${user.id}`} />

      {/* Same daily-snooze pattern as InstallAppBanner just above -
          self-hides once subscribed, blocked, or unsupported. */}
      <PushNotificationsBanner storageKey={`push-prompt-dismissed-${user.id}`} />

      {/* Two-tier reminder for low-ticket members who haven't picked a
          program yet, both gated on the same condition. The card is
          unconditional page content - no dismiss state, just quietly
          sits above the feed on every visit. The popup only shows once
          a day (localStorage) - dismissing it slides it away to reveal
          the card that was already there underneath. Once a program's
          actually picked, both disappear for good and only the "Choose
          Your Program" nav link remains. */}
      {hasLowTicket && !hasSelectedProgram && <WorkoutBuilderCard href="/programs" />}

      {/* Gates the onboarding tour behind a one-time Community
          Guidelines acknowledgment - see RulesGate. Applies to every
          member, not just low-ticket, since the guidelines govern the
          whole group. Replaces what used to be two separate things
          landing right after the guidelines close (a "choose your
          program" popup and a "read the help page" banner) with one
          guided tour that ends by pointing at the program picker
          itself - see Tour.tsx for why a single static step list
          handles both "already has a program" and desktop-vs-mobile
          targeting without any extra logic here. */}
      <RulesGate userId={user.id} intro={guidelines.intro} rules={guidelines.rules}>
        <Tour storageKey={`tour-seen-${user.id}`} forceStart={forceTour} />
      </RulesGate>

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Tabs, mobile leaderboard teaser, composer, and feed — FeedTabs
            supplies its own lg:col-span-3 (tab bar) and lg:col-span-2
            (everything else) grid-item children directly, so it must be
            rendered as a direct grid child here, not wrapped in a div. */}
        <FeedTabs
          posts={posts}
          hasMorePosts={hasMorePosts}
          currentUserId={user.id}
          isAdmin={isAdmin}
          availableSpaces={availableSpaces}
          initialLessonId={lessonId}
          initialLessonTitle={lessonTitle}
          initialContent={initialContent}
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
