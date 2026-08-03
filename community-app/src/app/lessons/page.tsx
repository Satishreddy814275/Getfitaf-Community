import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LessonsTabs from '@/components/LessonsTabs'
import type { Lesson, LeaderboardRow } from '@/types'

// How many lessons a free (not-yet-paid) member can read in full before
// hitting the lock - Satish's call, confirmed 2026-08-03. Free members
// get this fixed count regardless of when they signed up (no join-date
// drip like low-ticket members get - see unlockedDay below), so it
// never decreases and never depends on timing.
const FREE_PREVIEW_LESSON_COUNT = 3

// First real page of the learn.getfitaf.fitness -> community-app
// migration (see project notes on the phased plan) - same data this
// user's dashboard.html grid already showed (same `lessons` and
// `user_progress` tables, same Supabase project), now served as part
// of this app's own installed PWA shell instead of a separate
// uncached static site. The old site keeps running unchanged for now;
// nothing here is wired into the nav yet (see AppNav.tsx's
// showLessons links, still pointing at learn.getfitaf.fitness) until
// the rest of the lesson library is ported over content by content.
export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ view_as?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ownProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  // Same admin "view as" preview the old dashboard.html had - lets an
  // admin see exactly what a specific low-ticket/premium member sees
  // (drip lock, hidden forms/tabs, their own progress) without needing
  // a second real account to log into. Verified server-side against
  // the actual logged-in user's own is_admin, not just trusted from
  // the query string.
  const { view_as: viewAsId } = await searchParams
  if (viewAsId && !ownProfile?.is_admin) redirect('/lessons')
  const viewingAs = !!viewAsId && !!ownProfile?.is_admin
  const targetId = viewingAs ? viewAsId! : user.id

  const [{ data: profile }, { data: membership }, { data: lessonsData }, { data: progressData }, { data: leaderboardData }] =
    await Promise.all([
      supabase.from('profiles').select('is_admin, approved, full_name').eq('id', targetId).single(),
      supabase
        .from('space_memberships')
        .select('created_at')
        .eq('profile_id', targetId)
        .eq('space', 'low_ticket')
        .maybeSingle(),
      // get_lessons_list() (SECURITY DEFINER RPC) instead of a plain
      // table select - the grid needs every lesson's title (so free
      // members see all 42 with locked ones greyed out, not just their
      // unlocked 3), but a direct table select is bound by RLS, which
      // only returns full rows - content included - for lessons a free
      // member has actually unlocked. The RPC sidesteps that by simply
      // never selecting content/content_css/video_url/etc. in the first
      // place, so there's nothing sensitive in what it returns
      // regardless of who's asking. See its own migration comment for
      // the full reasoning. LessonsTabs only ever reads
      // id/title/order/tag/url/audio_url from the grid anyway - this
      // also means the grid stops fetching all 42 lessons' full HTML
      // content on every page load for everyone, unused until now.
      supabase.rpc('get_lessons_list'),
      supabase.from('user_progress').select('lesson_id, completed').eq('user_id', targetId),
      supabase.rpc('get_community_leaderboard'),
    ])

  const isAdmin = !!profile?.is_admin
  const isApproved = !!profile?.approved
  const hasLowTicket = !!membership
  // No longer bounced to /beta - free (not-yet-paid) members now get a
  // real, if capped, look at the library instead (see
  // FREE_PREVIEW_LESSON_COUNT above). Confirmed with Satish 2026-08-03:
  // this was previously an all-or-nothing gate, now it's a preview.
  const isFreePreviewOnly = !isAdmin && !isApproved && !hasLowTicket

  const isLowTicketOnly = hasLowTicket && !isApproved && !isAdmin

  let unlockedDay: number | null = null
  if (isLowTicketOnly && membership) {
    const joined = new Date(membership.created_at)
    const joinedMidnight = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate())
    const now = new Date()
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysSince = Math.floor((nowMidnight.getTime() - joinedMidnight.getTime()) / 86400000)
    unlockedDay = Math.max(1, daysSince + 1)
  } else if (isFreePreviewOnly) {
    // Fixed, not drip'd - every free member sees the same first N
    // lessons open regardless of when they showed up.
    unlockedDay = FREE_PREVIEW_LESSON_COUNT
  }

  // get_lessons_list() only returns the columns LessonsTabs actually
  // reads for the grid (id/title/order/tag/url/audio_url) - padded out
  // to the full Lesson shape here so LessonsTabs' existing prop type
  // doesn't need to change. The nulled fields (content, video_url,
  // etc.) are never read by the grid - only lessons/[slug]/page.tsx
  // reads those, and it fetches its own single lesson row directly.
  const lessons: Lesson[] = (
    (lessonsData as { id: string; title: string; order: number; tag: string | null; url: string | null; audio_url: string | null }[] | null) || []
  ).map((l) => ({
    ...l,
    description: null,
    thumbnail_url: null,
    video_url: null,
    duration_mins: null,
    is_published: true,
    content: null,
    content_css: null,
  }))
  if (unlockedDay !== null) unlockedDay = Math.min(unlockedDay, lessons.length || 1)

  const completedIds = (progressData || []).filter((p) => p.completed).map((p) => p.lesson_id)

  // Submissions tab is hidden for low-ticket and free-preview members
  // (see LessonsTabs), so this query is skipped for them entirely
  // rather than fetched and unused.
  let submissions: { form_title: string; submitted_at: string }[] = []
  if (!isLowTicketOnly && !isFreePreviewOnly) {
    const { data } = await supabase
      .from('form_submissions')
      .select('form_title, submitted_at')
      .eq('user_id', targetId)
      .order('submitted_at', { ascending: false })
    submissions = data || []
  }

  const leaderboardRows = (leaderboardData as LeaderboardRow[] | null) || []

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      {viewingAs && (
        <div className="mb-4 rounded-lg bg-orange-500/10 border border-orange-500/20 px-4 py-2 flex items-center justify-between">
          <p className="text-orange-400 text-sm font-medium">
            👀 Viewing as {profile?.full_name || 'client'}
          </p>
          <Link href="/lessons" className="text-orange-400 text-xs underline hover:no-underline">
            ← Back to your own view
          </Link>
        </div>
      )}

      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Your Lessons</h1>
        <p className="text-sm text-zinc-500 mt-1">
          A short daily lesson on training, nutrition, and mindset - work through them at your own
          pace.
        </p>
      </div>

      {isFreePreviewOnly && (
        <div className="mb-6 rounded-lg bg-orange-500/10 border border-orange-500/20 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-zinc-300">
            You&apos;re previewing the first {FREE_PREVIEW_LESSON_COUNT} lessons - join to unlock
            all {lessons.length}.
          </p>
          <Link
            href="/beta/pay"
            className="bg-orange-500 hover:bg-orange-400 text-black text-xs font-semibold px-3.5 py-2 rounded-lg transition whitespace-nowrap"
          >
            Join now
          </Link>
        </div>
      )}

      <LessonsTabs
        lessons={lessons}
        completedIds={completedIds}
        isLowTicketOnly={isLowTicketOnly}
        isFreePreviewOnly={isFreePreviewOnly}
        unlockedDay={unlockedDay}
        leaderboardRows={leaderboardRows}
        currentUserId={user.id}
        submissions={submissions}
        viewAsId={viewingAs ? viewAsId : undefined}
      />
    </div>
  )
}
