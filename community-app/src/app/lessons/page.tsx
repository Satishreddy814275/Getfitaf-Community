import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LessonsTabs from '@/components/LessonsTabs'
import type { Lesson, LeaderboardRow } from '@/types'

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
      supabase
        .from('lessons')
        .select('id, title, description, thumbnail_url, video_url, duration_mins, order, is_published, url, tag, audio_url, content, content_css')
        .eq('is_published', true)
        .order('order'),
      supabase.from('user_progress').select('lesson_id, completed').eq('user_id', targetId),
      supabase.rpc('get_community_leaderboard'),
    ])

  const isAdmin = !!profile?.is_admin
  const isApproved = !!profile?.approved
  const hasLowTicket = !!membership
  if (!isAdmin && !isApproved && !hasLowTicket) redirect('/beta')

  const isLowTicketOnly = hasLowTicket && !isApproved && !isAdmin

  let unlockedDay: number | null = null
  if (isLowTicketOnly && membership) {
    const joined = new Date(membership.created_at)
    const joinedMidnight = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate())
    const now = new Date()
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysSince = Math.floor((nowMidnight.getTime() - joinedMidnight.getTime()) / 86400000)
    unlockedDay = Math.max(1, daysSince + 1)
  }

  const lessons = (lessonsData as Lesson[] | null) || []
  if (unlockedDay !== null) unlockedDay = Math.min(unlockedDay, lessons.length || 1)

  const completedIds = (progressData || []).filter((p) => p.completed).map((p) => p.lesson_id)

  // Submissions tab is hidden for low-ticket members (see
  // LessonsTabs), so this query is skipped for them entirely rather
  // than fetched and unused.
  let submissions: { form_title: string; submitted_at: string }[] = []
  if (!isLowTicketOnly) {
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

      <LessonsTabs
        lessons={lessons}
        completedIds={completedIds}
        isLowTicketOnly={isLowTicketOnly}
        unlockedDay={unlockedDay}
        leaderboardRows={leaderboardRows}
        currentUserId={user.id}
        submissions={submissions}
        viewAsId={viewingAs ? viewAsId : undefined}
      />
    </div>
  )
}
