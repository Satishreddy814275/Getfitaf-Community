'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { track } from '@vercel/analytics'
import LessonPreviewModal from './LessonPreviewModal'

// Logged-out-only top bar for the public /exercises page. AppNav never
// renders for a signed-out visitor (see layout.tsx - it's wrapped in
// `{user && ...}`), so without this there was no way from here to join,
// explore coaching, or leave an email at all (Satish caught this
// 2026-08-03).
//
// Logo left, all three CTAs right. Filled zinc-800 pills with a
// trailing arrow, not outline - Satish's call 2026-08-03: outline
// pills (same treatment as the muscle filter chips further down the
// page) read as inert labels rather than clickable buttons. Confirmed
// with a side-by-side mockup before building - the fill + arrow
// combination was the one that actually read as "click me," and it
// also reads clearly distinct from the muscle chips' outline/pill-full
// style below, so the two control types don't blur together anymore.
//
// - "Daily Lessons" opens the shared LessonPreviewModal (email capture
//   -> free 7-lesson series, same card already live on /beta). Labeled
//   this way rather than anything that reads as "more videos like
//   these" - Satish flagged 2026-08-03 that the exercise clips and the
//   7-lesson email series are different content (mindset/nutrition
//   education vs. form demos). Deliberately gated behind email rather
//   than linking straight to Lesson 1 - the 7 preview lessons have no
//   index or next-lesson link between them by design (see
//   lessons/preview/[slug]/page.tsx's comment on pacing), so without
//   the email drip there'd be no way to reach lesson 2 anyway.
// - "Know more about the community" -> /beta, softer than the original
//   "Join GetFit AF" - Satish's call 2026-08-03: "Join" reads as an
//   immediate commitment/charge, which suppresses clicks from people
//   who just want to understand the offer first. Same destination,
//   /beta already leads with explanation before any payment step.
// - "Explore 1-on-1 coaching" -> getfitaf.fitness, Satish's separate
//   personal-coaching site (Book a free call / DM on Instagram, no
//   pricing or payment ask anywhere on it) - a genuinely different
//   product line from the community program, so it gets its own CTA
//   rather than being folded into the community one. Opens in a new
//   tab since it's a different domain/site entirely.
const PILL_CLASS =
  'inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition whitespace-nowrap'

export default function ExercisesGuestBar() {
  const [showLessons, setShowLessons] = useState(false)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-800">
        <p className="text-base font-black text-white tracking-tight">
          GET<span className="text-orange-500">FIT</span> AF
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              track('exercises_guest_bar_click', { target: 'daily_lessons' })
              setShowLessons(true)
            }}
            className={PILL_CLASS}
          >
            Daily Lessons
            <ArrowRight size={13} />
          </button>
          <Link
            href="/beta"
            onClick={() => track('exercises_guest_bar_click', { target: 'community' })}
            className={PILL_CLASS}
          >
            Know more about the community
            <ArrowRight size={13} />
          </Link>
          <a
            href="https://getfitaf.fitness"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('exercises_guest_bar_click', { target: 'coaching' })}
            className={PILL_CLASS}
          >
            Explore 1-on-1 coaching
            <ArrowRight size={13} />
          </a>
        </div>
      </div>

      {showLessons && (
        <LessonPreviewModal onClose={() => setShowLessons(false)} variant="lessonList" />
      )}
    </>
  )
}
