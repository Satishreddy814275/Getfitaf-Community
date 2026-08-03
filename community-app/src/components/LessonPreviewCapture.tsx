'use client'

import { useState } from 'react'

// Standalone "not ready to pay yet" card - sits between FAQ and the
// bottom CTA on the live (post-Aug-1) /beta page. Posts to the same
// /api/beta-waitlist endpoint the old pre-launch WaitlistForm used -
// that route was always generic (email + name -> beta_waitlist table +
// Mailchimp "Community Beta Waitlist" sync), nothing pre-launch
// specific about it. See 2026-08-01 conversation: this is the only
// email-capture path on the live page now that WaitlistForm no longer
// renders once isLive is true.
//
// Sets the same localStorage flag FreeLessonsBanner checks - if
// someone submits here, the banner (which triggers on scroll/time
// separately) shouldn't also nag them later in the same visit.
const BANNER_DISMISS_KEY = 'gfa-free-lessons-banner-dismissed'

// Titles of the 7 free preview lessons (day1-lesson through day7-lesson in
// the `lessons` table), hardcoded here the same way lessons/preview/[slug]/
// page.tsx hardcodes PREVIEW_SLUGS - this is a fixed, rarely-changing
// onboarding sequence, not something worth a live fetch for. If Satish
// retitles any of these 7 rows in the admin editor, this list needs a
// manual update too.
const FREE_LESSON_TITLES = [
  'Growth Mindset vs Fixed Mindset',
  'The 3-Workout Rule',
  'Progress Over Perfection',
  'The Balanced Plate and Why Protein Comes First',
  'Protein Sources, How Much to Eat, and What to Look For',
  'The Weight Loss Rate That Actually Works',
  'How to Actually Measure Your Weight',
]

export default function LessonPreviewCapture({
  variant = 'default',
}: {
  // 'lessonList' shows the actual 7 lesson titles as locked rows (same
  // 🔒-badge treatment as the real /lessons list) instead of the
  // "Not sure yet?" headline - Satish's call 2026-08-03: "Not sure yet?"
  // was written for this card's original home on /beta (right after the
  // pricing FAQ, addressing payment hesitation), and reads as a non
  // sequitur when someone arrives via a direct "Daily Lessons" button
  // that never mentioned price at all. Used by LessonPreviewModal's
  // callers (ExercisesGuestBar's Daily Lessons button, ExerciseLibrary's
  // nudge banner); /beta's own inline card keeps the default variant
  // unchanged.
  variant?: 'default' | 'lessonList'
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/beta-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Something went wrong. Try again.')
        setStatus('error')
        return
      }

      window.localStorage.setItem(BANNER_DISMISS_KEY, new Date().toDateString())
      setStatus('done')
    } catch {
      setErrorMessage('Something went wrong. Try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl p-6 bg-zinc-900 border border-zinc-700 text-center">
        <p className="text-white font-semibold text-sm">Check your inbox.</p>
        <p className="text-zinc-300 text-xs mt-1">
          Your first lesson is on its way. If you don&apos;t see it in a few minutes, check
          Promotions or Spam.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-6 bg-zinc-900 border border-zinc-700 text-center">
      {variant === 'lessonList' ? (
        <>
          <p className="text-white text-base font-bold mb-3">Get your first 7 lessons free</p>
          {/* Same 🔒-badge row treatment as the real /lessons list
              (LessonsTabs.tsx) - shown locked here on purpose, so this
              reads as "real content waiting for you" rather than an
              abstract bullet list. Brightened 2026-08-03 - the original
              opacity-70 rows + zinc-800/500 text read as too washed out
              to comfortably read inside the modal. */}
          <div className="rounded-xl border border-zinc-700 overflow-hidden text-left mb-4 max-w-sm mx-auto">
            {FREE_LESSON_TITLES.map((title) => (
              <div
                key={title}
                className="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-700/70 last:border-0"
              >
                <span className="w-6 h-6 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center text-xs font-bold shrink-0">
                  🔒
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-zinc-100">{title}</span>
              </div>
            ))}
          </div>
          <p className="text-zinc-300 text-xs mb-4">No payment needed - just your email.</p>
        </>
      ) : (
        <>
          <p className="text-white text-base font-bold mb-1">Not sure yet?</p>
          <p className="text-zinc-300 text-xs mb-4 leading-relaxed max-w-sm mx-auto">
            Get the first 7 lessons free - mindset, nutrition basics, and how to actually track
            progress. No payment needed.
          </p>
        </>
      )}
      <form onSubmit={handleSubmit} className="space-y-2 max-w-sm mx-auto">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          className="w-full bg-zinc-900 border border-zinc-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500 transition"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 bg-zinc-900 border border-zinc-600 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500 transition"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-xl transition text-sm whitespace-nowrap"
          >
            {status === 'loading' ? 'Sending...' : 'Send me the free lessons'}
          </button>
        </div>
        {status === 'error' && <p className="text-red-400 text-xs">{errorMessage}</p>}
      </form>
    </div>
  )
}
