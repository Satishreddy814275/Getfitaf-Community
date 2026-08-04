'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { extractYouTubeId } from '@/lib/exerciseVideos'

// Shared exercise-video modal - originally built for the /exercises
// library (Satish 2026-08-03), now reused in the workout logging flow
// too (WorkoutDayPicker's "Watch video" link, Satish 2026-08-04): he
// wanted videos to open in a modal with the coach's instructions
// underneath, instead of popping the video out to a separate browser
// tab with no context alongside it. Same embedded-YouTube-iframe +
// coach-notes-below layout in both places now, extracted here so
// neither copy drifts from the other.
export default function ExerciseVideoModal({
  name,
  videoUrl,
  coachNotes,
  onClose,
}: {
  name: string
  videoUrl: string
  coachNotes?: string | null
  onClose: () => void
}) {
  const videoId = extractYouTubeId(videoUrl)

  // Same reasoning as the More sheet's drag-to-dismiss fix - a fixed
  // overlay alone doesn't stop the page behind it from scrolling on
  // iOS, so lock body scroll for exactly as long as this modal is open.
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
      aria-label={name}
    >
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 bg-[#0a0a0a]">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="aspect-video bg-black">
          {videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              title={name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            // Only hit if a video URL doesn't match any known YouTube
            // shape - falls back to just opening it directly rather
            // than showing a dead modal.
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center h-full text-orange-400 text-sm"
            >
              Open video ↗
            </a>
          )}
        </div>
        {coachNotes && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <p className="text-[11px] text-zinc-500 mb-1">Coach notes</p>
            <p className="text-sm text-zinc-300 whitespace-pre-line">{coachNotes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
