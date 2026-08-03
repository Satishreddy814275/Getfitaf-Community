'use client'

import { useState } from 'react'
import Link from 'next/link'
import LessonPreviewModal from './LessonPreviewModal'

// Logged-out-only top bar for the public /exercises page. AppNav never
// renders for a signed-out visitor (see layout.tsx - it's wrapped in
// `{user && ...}`), so without this there was no way from here to join
// or leave an email at all (Satish caught this 2026-08-03).
//
// Two CTAs: straight to /beta, or the shared LessonPreviewModal (email
// capture -> free 7-lesson series, same card already live on /beta).
// Labeled "Daily Lessons" rather than anything that reads as "more
// videos like these" - Satish flagged 2026-08-03 that the exercise
// clips and the 7-lesson email series are completely different content
// (mindset/nutrition education vs. form demos), so the copy shouldn't
// blur the two. Deliberately gated behind email rather than linking
// straight to Lesson 1 - not just for lead-gen, the 7 preview lessons
// have no index or next-lesson link between them by design (see
// lessons/preview/[slug]/page.tsx's comment on pacing), so without the
// email drip there'd be no way to reach lesson 2 anyway.
export default function ExercisesGuestBar() {
  const [showLessons, setShowLessons] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-800">
        <p className="text-base font-black text-white tracking-tight">
          GET<span className="text-orange-500">FIT</span> AF
        </p>
        <div className="flex items-center gap-2">
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
            Join GetFit AF
          </Link>
        </div>
      </div>

      {showLessons && <LessonPreviewModal onClose={() => setShowLessons(false)} />}
    </>
  )
}
