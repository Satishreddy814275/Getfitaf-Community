'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import LessonPreviewCapture from './LessonPreviewCapture'

// Logged-out-only top bar for the public /exercises page. AppNav never
// renders for a signed-out visitor (see layout.tsx - it's wrapped in
// `{user && ...}`), so without this there was no way from here to join
// or leave an email at all (Satish caught this 2026-08-03).
//
// Two CTAs: straight to /beta, or a modal reusing the exact
// email-capture card already live there (LessonPreviewCapture).
// Deliberately gated behind email rather than linking straight to
// Lesson 1 - not just for lead-gen, the 7 preview lessons it unlocks
// have no index or next-lesson link between them by design (see
// lessons/preview/[slug]/page.tsx's comment on pacing), so without the
// email drip there'd be no way to reach lesson 2 anyway.
export default function ExercisesGuestBar() {
  const [showLessons, setShowLessons] = useState(false)

  // Same body-scroll-lock + Escape-to-close pattern as
  // ExerciseLibrary's VideoModal.
  useEffect(() => {
    if (!showLessons) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showLessons])

  useEffect(() => {
    if (!showLessons) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowLessons(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showLessons])

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
            Learn these lessons
          </button>
          <Link
            href="/beta"
            className="text-xs font-bold text-black bg-orange-500 hover:bg-orange-400 px-3 py-2 rounded-lg transition whitespace-nowrap"
          >
            Join GetFit AF
          </Link>
        </div>
      </div>

      {showLessons && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Get the free lessons"
        >
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowLessons(false)} />
          <div className="relative w-full max-w-md">
            <button
              type="button"
              onClick={() => setShowLessons(false)}
              className="absolute -top-10 right-0 text-zinc-400 hover:text-white transition"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <LessonPreviewCapture />
          </div>
        </div>
      )}
    </>
  )
}
