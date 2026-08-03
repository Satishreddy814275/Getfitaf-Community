import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ReadingProgressBar from '@/components/ReadingProgressBar'
import CompleteLessonCard from '@/components/CompleteLessonCard'
import LessonSidebar from '@/components/LessonSidebar'
import HeadphoneIcon from '@/components/HeadphoneIcon'
import type { Lesson } from '@/types'

// Kept in sync with the same constant in lessons/page.tsx - both need
// to agree on exactly how many lessons a free member can open, since
// this page enforces it server-side independent of the grid (see
// unlockedDay below).
const FREE_PREVIEW_LESSON_COUNT = 3

// Same personalised-follow-up forms the dashboard's own WEEK_FORMS
// object lists (see gfa-portal/dashboard.html) - shown inline on the
// specific lesson day they're assigned to, top and bottom, exactly
// like the old day1/day5/day6/day11/day12/day13/day14 lesson pages
// did. Hidden entirely for low-ticket members (see isLowTicketOnly
// below) - those forms promise personalised coach follow-up that
// won't happen for this membership tier, same reasoning as
// low-ticket-adjust.js on the old site.
const LESSON_FORMS: Record<number, { name: string; url: string }> = {
  1: { name: "today's form", url: 'https://forms.getfitaf.fitness/eating-habits' },
  6: { name: "today's form", url: 'https://forms.getfitaf.fitness/weight-history' },
  12: { name: "today's form", url: 'https://forms.getfitaf.fitness/supplement-questionnaire' },
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ view_as?: string }>
}) {
  const { slug } = await params
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

  // Same admin "view as" preview as /lessons (see that page's own
  // comment) - carried through from the grid via the lesson links'
  // own ?view_as passthrough, so an admin can click straight from
  // "viewing as X" into one of X's actual lesson pages and see the
  // same forms/drip-lock behaviour they'd see. The complete button
  // below is disabled in this mode - actually marking a lesson done
  // still only ever writes against whoever is really signed in
  // (markLessonComplete reads auth.getUser() itself, not this
  // targetId), so it can't be allowed to look like it completed the
  // lesson for the person being previewed.
  const { view_as: viewAsId } = await searchParams
  if (viewAsId && !ownProfile?.is_admin) redirect('/lessons')
  const targetId = viewAsId && ownProfile?.is_admin ? viewAsId : user.id
  const viewingAs = !!viewAsId && !!ownProfile?.is_admin

  const [{ data: profile }, { data: membership }, { data: lessonsMetaData }] = await Promise.all([
    supabase.from('profiles').select('is_admin, approved, full_name').eq('id', targetId).single(),
    supabase
      .from('space_memberships')
      .select('created_at')
      .eq('profile_id', targetId)
      .eq('space', 'low_ticket')
      .maybeSingle(),
    // Metadata-only (id/title/order/tag/url/audio_url, no content) via
    // the same get_lessons_list() RPC the grid uses - see its migration
    // comment for why. Needed here for the sidebar's full jump-to list
    // and prev/next, without pulling every other lesson's full HTML
    // body just to render this one. This lesson's own full content is
    // fetched separately below, only once we've confirmed it's
    // actually unlocked.
    supabase.rpc('get_lessons_list'),
  ])

  const isAdmin = !!profile?.is_admin
  const isApproved = !!profile?.approved
  // No longer bounced to /beta - free (not-yet-paid) members now get a
  // real, if capped, look at individual lessons too (see
  // FREE_PREVIEW_LESSON_COUNT above and isFreePreviewOnly's unlockedDay
  // branch below), not just the grid. Confirmed with Satish 2026-08-03.
  const isFreePreviewOnly = !isAdmin && !isApproved && !membership

  const lessonsMeta =
    (lessonsMetaData as
      | { id: string; title: string; order: number; tag: string | null; url: string | null; audio_url: string | null }[]
      | null) || []
  const lessonMeta = lessonsMeta.find((l) => l.url === `/lessons/${slug}.html`)
  if (!lessonMeta) notFound()

  // Cumulative day-drip unlock for low-ticket (self-guided) members, or
  // a fixed preview count for free members - same calendar-day math as
  // the dashboard's own unlockedDay, kept in sync deliberately: this
  // page has to enforce the same lock the grid already visually shows,
  // not just trust that nobody navigates here directly with an old
  // link. Hoisted out of the redirect check (unlike before) so
  // LessonSidebar can also grey out/lock not-yet-unlocked rows in the
  // jump-to list - null for admin/approved members, who have no lock
  // at all.
  const isLowTicketOnly = !!membership && !isApproved && !isAdmin
  let unlockedDay: number | null = null
  if (isLowTicketOnly && membership) {
    const joined = new Date(membership.created_at)
    const joinedMidnight = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate())
    const now = new Date()
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysSince = Math.floor((nowMidnight.getTime() - joinedMidnight.getTime()) / 86400000)
    unlockedDay = Math.max(1, daysSince + 1)
  } else if (isFreePreviewOnly) {
    unlockedDay = FREE_PREVIEW_LESSON_COUNT
  }
  if (unlockedDay !== null && lessonMeta.order > unlockedDay) redirect('/lessons')

  // Full row - content, content_css, video_url, etc. - fetched only
  // now that we know this lesson is actually unlocked. RLS backs this
  // up independently too (see allow_free_preview_lessons_select
  // migration): a free member's own query for this table can only ever
  // return order <= 3 regardless of what this page does, so this isn't
  // the only thing standing between them and locked content.
  const { data: lessonData } = await supabase
    .from('lessons')
    .select(
      'id, title, description, thumbnail_url, video_url, duration_mins, order, is_published, url, tag, audio_url, content, content_css'
    )
    .eq('id', lessonMeta.id)
    .single()
  const lesson = lessonData as Lesson | null
  if (!lesson) notFound()

  // Padded to the full Lesson shape for LessonSidebar's prop type - it
  // only ever reads id/order/title/url from these, same reasoning as
  // the grid (see lessons/page.tsx).
  const lessons: Lesson[] = lessonsMeta.map((l) => ({
    ...l,
    description: null,
    thumbnail_url: null,
    video_url: null,
    duration_mins: null,
    is_published: true,
    content: null,
    content_css: null,
  }))

  const [{ data: progress }, { data: allProgress }] = await Promise.all([
    supabase
      .from('user_progress')
      .select('completed')
      .eq('user_id', targetId)
      .eq('lesson_id', lesson.id)
      .maybeSingle(),
    // Full completed-lesson list for the sidebar's checkmarks/progress
    // bar - separate from the single-lesson `progress` query above,
    // which only needs this lesson's own completed state for the
    // Complete-lesson card.
    supabase.from('user_progress').select('lesson_id').eq('user_id', targetId).eq('completed', true),
  ])
  const completedIds = (allProgress || []).map((p) => p.lesson_id)

  const idx = lessons.findIndex((l) => l.id === lesson.id)
  const prev = idx > 0 ? lessons[idx - 1] : null
  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null
  const slugOf = (l: Lesson) => (l.url || '').replace('/lessons/', '').replace('.html', '')
  const withViewAs = (href: string) => (viewingAs ? `${href}?view_as=${viewAsId}` : href)

  // Same reasoning as low-ticket: these forms promise personalised
  // coach follow-up that isn't part of a free preview either.
  const form = !isLowTicketOnly && !isFreePreviewOnly ? LESSON_FORMS[lesson.order] : null

  return (
    <div style={{ background: '#f2f2f2', minHeight: '100vh' }}>
      <ReadingProgressBar />

      <div className="max-w-[1080px] mx-auto py-10 px-5 pb-16 flex flex-col lg:flex-row lg:items-start gap-6">
        <LessonSidebar
          lessons={lessons}
          completedIds={completedIds}
          currentLessonId={lesson.id}
          unlockedDay={unlockedDay}
          viewAsId={viewingAs ? viewAsId : undefined}
        />

        <div className="max-w-[780px] w-full mx-auto lg:mx-0 min-w-0">
        {viewingAs && (
          <div className="mb-4 rounded-lg bg-orange-500/10 border border-orange-500/25 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
            <p className="text-[#e8552e] text-sm font-medium">
              👀 Viewing as {profile?.full_name || 'client'}
            </p>
            <Link href="/lessons" className="text-[#e8552e] text-xs underline hover:no-underline">
              ← Back to your own view
            </Link>
          </div>
        )}

        <Link
          href={withViewAs('/lessons')}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#e8552e] hover:opacity-80 transition mb-6"
        >
          ← Back to your lessons
        </Link>

        <p className="text-xs font-bold text-[#e8552e] uppercase tracking-wider mb-2.5">
          Lesson {lesson.order}
          {lesson.tag ? ` · ${lesson.tag}` : ''}
        </p>

        {/* Read-time + audio-available pills - present on the old
            learn.getfitaf.fitness lesson pages (lesson-nav.js's
            updateReadTime/updateAudioBadge) but dropped during the
            /lessons/[slug] migration. duration_mins is already fetched
            above for every lesson, this just renders it. */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {lesson.duration_mins ? (
            <span className="inline-flex items-center bg-[#eceae6] text-[#555] text-xs font-medium px-3 py-1 rounded-full">
              {lesson.duration_mins} min read
            </span>
          ) : null}
          {lesson.audio_url && (
            <span className="inline-flex items-center gap-1.5 bg-[#e8552e] text-white text-xs font-medium px-3 py-1 rounded-full">
              <HeadphoneIcon size={12} /> Audio available
            </span>
          )}
        </div>

        <h1 className="text-[28px] font-bold text-[#1a1a1a] leading-tight mb-8">{lesson.title}</h1>

        {lesson.audio_url && (
          // Wrapped in the same tinted-card treatment as the old site's
          // audio block (and matching this page's own "got a takeaway"
          // card further down) - a bare <audio> element with no
          // container is what made the native control read as squeezed
          // into a corner instead of a deliberate full-width block.
          <div
            className="rounded-lg p-4 sm:p-5 mb-6"
            style={{ background: 'rgba(232,85,46,0.08)', border: '1px solid rgba(232,85,46,0.25)' }}
          >
            <p className="text-sm text-[#555] mb-2 flex items-center gap-1.5">
              <HeadphoneIcon size={15} /> Prefer to listen?
            </p>
            <audio controls preload="metadata" src={lesson.audio_url} className="w-full">
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {form && (
          <div className="bg-white rounded-lg p-7 sm:p-9 shadow-sm mb-6 border-l-4 border-[#e8552e]">
            <h3 className="text-xs font-bold text-[#e8552e] uppercase tracking-wide mb-2">
              Form to fill out today
            </h3>
            <p className="text-sm text-[#555] mb-4">
              Before or after reading today&apos;s lesson, please take a few minutes to fill out
              this short form. The more we know about you, the more we can personalise your plan.
            </p>
            <a
              href={form.url}
              target="_blank"
              rel="noopener"
              className="inline-block bg-[#e8552e] hover:opacity-90 text-white text-[15px] font-semibold px-6 py-3 rounded-md transition"
            >
              Fill out {form.name} →
            </a>
          </div>
        )}

        <div className="bg-white rounded-lg p-7 sm:p-9 shadow-sm mb-6">
          {lesson.content ? (
            <>
              {lesson.content_css && <style dangerouslySetInnerHTML={{ __html: lesson.content_css }} />}
              <div
                className={`lesson-content${isLowTicketOnly || isFreePreviewOnly ? ' low-ticket-view' : ''}`}
                dangerouslySetInnerHTML={{ __html: lesson.content }}
              />
            </>
          ) : (
            <p className="text-sm text-[#888]">
              This lesson&apos;s content hasn&apos;t been migrated yet - check back soon.
            </p>
          )}
        </div>

        {form && (
          <div className="bg-white rounded-lg p-7 sm:p-9 shadow-sm mb-6 border-l-4 border-[#e8552e]">
            <h3 className="text-xs font-bold text-[#e8552e] uppercase tracking-wide mb-2">
              Don&apos;t forget today&apos;s form
            </h3>
            <p className="text-sm text-[#555] mb-4">
              If you haven&apos;t filled it out yet, now&apos;s a good time. It only takes a few
              minutes.
            </p>
            <a
              href={form.url}
              target="_blank"
              rel="noopener"
              className="inline-block bg-[#e8552e] hover:opacity-90 text-white text-[15px] font-semibold px-6 py-3 rounded-md transition"
            >
              Fill out {form.name} →
            </a>
          </div>
        )}

        <div
          className="rounded-lg p-5 mb-6 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">💬</span>
            <div>
              <p className="font-bold text-[#1a1a1a] text-sm mb-0.5">Got a takeaway from this lesson?</p>
              <p className="text-[#777] text-[13px] m-0">
                Drop it in the Community and connect with the group.
              </p>
            </div>
          </div>
          <Link
            href="/feed"
            className="bg-[#e8552e] hover:opacity-90 text-white text-sm font-bold px-5 py-2.5 rounded-md transition whitespace-nowrap"
          >
            Go to Community →
          </Link>
        </div>

        {viewingAs ? (
          <div className="bg-white rounded-lg p-6 flex items-center justify-between gap-4 flex-wrap mb-6">
            <div>
              <p className="text-[15px] font-bold text-[#1a1a1a] mb-1">
                {progress?.completed ? '✓ Already completed' : 'Not completed yet'}
              </p>
              <p className="text-[13px] text-[#888]">
                Previewing {profile?.full_name || 'this client'}&apos;s view - marking complete is
                disabled here so it can&apos;t be done on their behalf.
              </p>
            </div>
          </div>
        ) : (
          <CompleteLessonCard
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            initialCompleted={!!progress?.completed}
          />
        )}

        {(prev || next) && (
          <div className="flex items-center justify-between gap-4 mb-6">
            {prev ? (
              <Link
                href={withViewAs(`/lessons/${slugOf(prev)}`)}
                className="flex-1 bg-white rounded-lg px-4 py-3 shadow-sm hover:shadow transition"
              >
                <span className="block text-xs text-[#888] mb-0.5">← Previous</span>
                <span className="block text-sm font-semibold text-[#1a1a1a] truncate">{prev.title}</span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
            {next ? (
              <Link
                href={withViewAs(`/lessons/${slugOf(next)}`)}
                className="flex-1 bg-white rounded-lg px-4 py-3 shadow-sm hover:shadow transition text-right"
              >
                <span className="block text-xs text-[#888] mb-0.5">Next →</span>
                <span className="block text-sm font-semibold text-[#1a1a1a] truncate">{next.title}</span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        )}

        <div className="bg-white rounded-lg p-7 sm:p-9 shadow-sm">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static asset already served from /public, not worth next/image's overhead here. No onError fallback (that needs a client component) - the file is checked into public/ so this doesn't need one. */}
            <img
              src="/satish-photo.jpg"
              alt="Satish"
              className="w-12 h-12 rounded-full object-cover object-top shrink-0"
            />
            <div>
              <p className="text-sm text-[#555] leading-relaxed">I&apos;ll be back tomorrow with your next lesson.</p>
              <p className="text-sm text-[#555] leading-relaxed mt-4">
                Talk soon,
                <br />
                <strong className="text-[#1a1a1a]">Satish</strong>
                <br />
                <span className="text-[#888] text-[13px]">GetFit AF</span>
              </p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
