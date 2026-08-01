import { notFound } from 'next/navigation'
import ReadingProgressBar from '@/components/ReadingProgressBar'
import HeadphoneIcon from '@/components/HeadphoneIcon'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lesson } from '@/types'

// The free 7-lesson preview offered to email leads on /beta who aren't
// ready to pay yet (see the 2026-08-01 conversation about replacing
// the stale pre-launch drip with something of actual value). These
// slugs are a deliberate, hand-picked set - mindset/nutrition
// education, not the tiered training programs or logging/community
// features people are actually paying for - so the preview builds
// trust without giving away the paid product. Hardcoded per Satish's
// call rather than an admin-editable flag; simplest thing that works
// today, revisit if the list needs to change often.
const PREVIEW_SLUGS = [
  'day1-lesson',
  'day2-lesson',
  'day3-lesson',
  'day4-lesson',
  'day5-lesson',
  'day6-lesson',
  'day7-lesson',
]

export default async function LessonPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!PREVIEW_SLUGS.includes(slug)) notFound()

  // Admin client, not the session-bound server client - this route has
  // no logged-in user at all, that's the whole point of a preview link
  // for someone who's only given an email. The `lessons` table's RLS
  // policy requires an active premium/low_ticket membership to read
  // any row at all, so a normal client would return nothing here. The
  // PREVIEW_SLUGS whitelist above (both here and in the query itself)
  // is what makes it safe to read with the admin client - only these 7
  // rows are ever reachable through this route, never an arbitrary
  // lesson id someone might guess or enumerate.
  //
  // Fetched standalone, deliberately no prev/next between preview
  // lessons (see 2026-08-01 conversation) - each one only reaches
  // someone through its own dedicated email in the 7-lesson sequence,
  // so letting someone click straight through to the next one on-page
  // would undercut that pacing and dilute "Join now" as the one thing
  // to do here.
  const supabase = createAdminClient()
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, url, duration_mins, order, tag, audio_url, content, content_css')
    .eq('is_published', true)
    .eq('url', `/lessons/${slug}.html`)
    .maybeSingle<Lesson>()

  if (!lesson) notFound()

  return (
    <div style={{ background: '#f2f2f2', minHeight: '100vh' }}>
      <ReadingProgressBar />

      <div className="max-w-[780px] w-full mx-auto py-10 px-5 pb-16">
        <div className="mb-6 rounded-lg bg-orange-500/10 border border-orange-500/25 px-4 py-2.5">
          <p className="text-[#e8552e] text-sm font-medium">🎁 Free preview - lesson {lesson.order} of 7</p>
        </div>

        <p className="text-xs font-bold text-[#e8552e] uppercase tracking-wider mb-2.5">
          Lesson {lesson.order}
          {lesson.tag ? ` · ${lesson.tag}` : ''}
        </p>

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

        <div className="bg-white rounded-lg p-7 sm:p-9 shadow-sm mb-6">
          {lesson.content ? (
            <>
              {lesson.content_css && <style dangerouslySetInnerHTML={{ __html: lesson.content_css }} />}
              <div className="lesson-content" dangerouslySetInnerHTML={{ __html: lesson.content }} />
            </>
          ) : (
            <p className="text-sm text-[#888]">This lesson isn&apos;t available right now.</p>
          )}
        </div>

        <div className="rounded-lg p-6 bg-white shadow-sm text-center">
          <p className="text-[#1a1a1a] text-sm font-semibold mb-1">Like what you&apos;re reading?</p>
          <p className="text-[#777] text-[13px] mb-4">
            This is a taste of what&apos;s inside. The full program - all lessons, the actual
            training plan for your tier, progress tracking, and the community - is ₹249 for your
            first month.
          </p>
          <a
            href="/beta"
            className="inline-block bg-[#e8552e] hover:opacity-90 text-white text-sm font-bold px-6 py-3 rounded-md transition"
          >
            Join now - ₹249 first month
          </a>
        </div>
      </div>
    </div>
  )
}
