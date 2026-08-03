'use client'

import { useState } from 'react'
import Link from 'next/link'
import LessonPreviewModal from './LessonPreviewModal'

// Logged-out-only top bar for the public /exercises page. AppNav never
// renders for a signed-out visitor (see layout.tsx - it's wrapped in
// `{user && ...}`), so without this there was no way from here to join,
// explore coaching, or leave an email at all (Satish caught this
// 2026-08-03).
//
// Three CTAs, stacked below the logo (rather than inline with it) now
// that there are three - matches the muscle-chip row's wrapped-pill
// style further down the page so the two feel like one design system:
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
export default function ExercisesGuestBar() {
  const [showLessons, setShowLessons] = useState(false)

  return (
    <>
      <div className="mb-6 pb-4 border-b border-zinc-800">
        <p className="text-base font-black text-white tracking-tight mb-3">
          GET<span className="text-orange-500">FIT</span> AF
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLessons(true)}
            className="text-xs font-semibold text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-lg transition whitespace-nowrap"
          >
            Daily Lessons
          </button>
          <Link
            href="/beta"
            className="text-xs font-bold text-black bg-orange-500 hover:bg-orange-400 px-3 py-2 rounded-lg transition whitespace-nowrap"
          >
            Know more about the community
          </Link>
          <a
            href="https://getfitaf.fitness"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-lg transition whitespace-nowrap"
          >
            Explore 1-on-1 coaching
          </a>
        </div>
      </div>

      {showLessons && <LessonPreviewModal onClose={() => setShowLessons(false)} />}
    </>
  )
}
