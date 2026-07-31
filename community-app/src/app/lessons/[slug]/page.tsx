import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ReadingProgressBar from '@/components/ReadingProgressBar'
import CompleteLessonCard from '@/components/CompleteLessonCard'
import type { Lesson } from '@/types'

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

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: membership }, { data: allLessons }] = await Promise.all([
    supabase.from('profiles').select('is_admin, approved').eq('id', user.id).single(),
    supabase
      .from('space_memberships')
      .select('created_at')
      .eq('profile_id', user.id)
      .eq('space', 'low_ticket')
      .maybeSingle(),
    supabase
      .from('lessons')
      .select('id, title, description, thumbnail_url, video_url, duration_mins, order, is_published, url, tag, audio_url, content')
      .eq('is_published', true)
      .order('order'),
  ])

  const isAdmin = !!profile?.is_admin
  const isApproved = !!profile?.approved
  if (!isAdmin && !isApproved && !membership) redirect('/beta')

  const lessons = (allLessons as Lesson[] | null) || []
  const lesson = lessons.find((l) => l.url === `/lessons/${slug}.html`)
  if (!lesson) notFound()

  // Cumulative day-drip unlock for low-ticket (self-guided) members -
  // same calendar-day math as the dashboard's own unlockedDay, kept in
  // sync deliberately: this page has to enforce the same lock the grid
  // already visually shows, not just trust that nobody navigates here
  // directly with an old link.
  const isLowTicketOnly = !!membership && !isApproved && !isAdmin
  if (isLowTicketOnly && membership) {
    const joined = new Date(membership.created_at)
    const joinedMidnight = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate())
    const now = new Date()
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysSince = Math.floor((nowMidnight.getTime() - joinedMidnight.getTime()) / 86400000)
    const unlockedDay = Math.max(1, daysSince + 1)
    if (lesson.order > unlockedDay) redirect('/lessons')
  }

  const { data: progress } = await supabase
    .from('user_progress')
    .select('completed')
    .eq('user_id', user.id)
    .eq('lesson_id', lesson.id)
    .maybeSingle()

  const idx = lessons.findIndex((l) => l.id === lesson.id)
  const prev = idx > 0 ? lessons[idx - 1] : null
  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null
  const slugOf = (l: Lesson) => (l.url || '').replace('/lessons/', '').replace('.html', '')

  const form = !isLowTicketOnly ? LESSON_FORMS[lesson.order] : null

  return (
    <div style={{ background: '#f2f2f2', minHeight: '100vh' }}>
      <ReadingProgressBar />

      <div className="max-w-[780px] mx-auto py-10 px-5 pb-16">
        <Link
          href="/lessons"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#e8552e] hover:opacity-80 transition mb-6"
        >
          ← Back to your lessons
        </Link>

        <p className="text-xs font-bold text-[#e8552e] uppercase tracking-wider mb-2.5">
          Lesson {lesson.order}
          {lesson.tag ? ` · ${lesson.tag}` : ''}
        </p>
        <h1 className="text-[28px] font-bold text-[#1a1a1a] leading-tight mb-8">{lesson.title}</h1>

        {lesson.audio_url && (
          <div className="mb-6">
            <p className="text-sm text-[#555] mb-2 flex items-center gap-1.5">
              🎧 Prefer to listen?
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
            <div className="lesson-content" dangerouslySetInnerHTML={{ __html: lesson.content }} />
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

        <CompleteLessonCard
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          initialCompleted={!!progress?.completed}
        />

        {(prev || next) && (
          <div className="flex items-center justify-between gap-4 mb-6">
            {prev ? (
              <Link
                href={`/lessons/${slugOf(prev)}`}
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
                href={`/lessons/${slugOf(next)}`}
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
              className="w-12 h-12 rounded-full object-cover shrink-0"
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
  )
}
