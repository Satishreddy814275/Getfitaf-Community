'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import LessonPreviewCapture from './LessonPreviewCapture'

// Shared modal chrome around LessonPreviewCapture - used both by
// ExercisesGuestBar's top-bar "Daily Lessons" button and
// ExerciseLibrary's soft nudge banner (after someone's opened a few
// videos), so the email-capture experience is identical no matter
// which trigger got them there, and the body-scroll-lock/Escape
// handling only needs to live in one place.
export default function LessonPreviewModal({
  onClose,
  variant = 'default',
}: {
  onClose: () => void
  variant?: 'default' | 'lessonList'
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Get the free lessons"
    >
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 text-zinc-400 hover:text-white transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <LessonPreviewCapture variant={variant} />
      </div>
    </div>
  )
}
