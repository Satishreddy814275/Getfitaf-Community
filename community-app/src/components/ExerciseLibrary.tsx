'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

interface ExerciseEntry {
  id: string
  name: string
  videoUrl: string
  coachNotes: string | null
}

// Handles youtube.com/watch?v=, youtu.be/, and youtube.com/embed/ - the
// shapes actually seen across the real video library (coaches paste
// whatever URL YouTube gives them when sharing, not one consistent
// format). Returns null rather than guessing for anything else, same
// "no video is better than a wrong one" principle as
// lib/exerciseVideos.ts's findExerciseVideo.
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      if (u.pathname.startsWith('/embed/')) return u.pathname.replace('/embed/', '')
    }
    return null
  } catch {
    return null
  }
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="black" className="ml-0.5">
      <path d="M4 2.5v11l10-5.5-10-5.5z" />
    </svg>
  )
}

function ExerciseCard({ exercise, onOpen }: { exercise: ExerciseEntry; onOpen: () => void }) {
  const videoId = extractYouTubeId(exercise.videoUrl)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950/60 hover:border-orange-500/40 transition group"
    >
      <div className="aspect-video bg-zinc-900 relative overflow-hidden">
        {videoId && (
          // eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail, not a local/optimizable asset
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
            <PlayIcon />
          </div>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-white truncate">{exercise.name}</p>
      </div>
    </button>
  )
}

function VideoModal({ exercise, onClose }: { exercise: ExerciseEntry; onClose: () => void }) {
  const videoId = extractYouTubeId(exercise.videoUrl)

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
      aria-label={exercise.name}
    >
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
          <p className="text-sm font-semibold text-white truncate">{exercise.name}</p>
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
              title={exercise.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            // Only hit if a video URL doesn't match any known YouTube
            // shape - falls back to just opening it directly rather
            // than showing a dead modal.
            <a
              href={exercise.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center h-full text-orange-400 text-sm"
            >
              Open video ↗
            </a>
          )}
        </div>
        {exercise.coachNotes && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <p className="text-[11px] text-zinc-500 mb-1">Coach notes</p>
            <p className="text-sm text-zinc-300 whitespace-pre-line">{exercise.coachNotes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Name search only for now - most exercises don't have muscle/
// equipment/type tags populated yet (see the admin Catalog tab), so a
// filter UI would mostly have nothing to filter by. Straightforward to
// layer filter chips in later once that data exists, same pattern the
// admin tools already use.
export default function ExerciseLibrary({ exercises }: { exercises: ExerciseEntry[] }) {
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return exercises
    return exercises.filter((e) => e.name.toLowerCase().includes(q))
  }, [exercises, search])

  const openExercise = exercises.find((e) => e.id === openId) || null

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises..."
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 mb-2"
      />
      <p className="text-zinc-500 text-xs mb-4">
        {exercises.length} exercise{exercises.length === 1 ? '' : 's'} with video
      </p>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-16">
          {exercises.length === 0
            ? 'No videos yet - check back soon.'
            : `No exercises match "${search}".`}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} onOpen={() => setOpenId(exercise.id)} />
          ))}
        </div>
      )}

      {openExercise && <VideoModal exercise={openExercise} onClose={() => setOpenId(null)} />}
    </div>
  )
}
