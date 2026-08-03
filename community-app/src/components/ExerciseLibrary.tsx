'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import LessonPreviewModal from './LessonPreviewModal'

interface ExerciseEntry {
  id: string
  name: string
  videoUrl: string
  coachNotes: string | null
  muscleGroups: string[]
}

// Soft nudge toward the free 7-lesson email series, shown only to
// logged-out visitors after they've actually gotten some value out of
// the library (opened this many distinct videos) - never blocks
// viewing, dismissible, and snoozes for the rest of the calendar day
// once dismissed (same pattern as FreeLessonsBanner on /beta). Copy is
// deliberately NOT "more lessons like these" - Satish flagged
// 2026-08-03 that the exercise clips and the 7-lesson email series are
// different content (form demos vs. mindset/nutrition education), so
// this borrows FreeLessonsBanner's actual wording instead of inventing
// a comparison to what's on screen.
const NUDGE_VIDEO_THRESHOLD = 3
const NUDGE_DISMISS_KEY = 'gfa-exercises-lessons-nudge-dismissed'

// Fixed display order for the muscle chip row - matches the order
// admins see in AdminExercisesList's starter chips (Chest through Full
// body) rather than alphabetical, so the row reads top-to-bottom body
// the way a trainer would group it. Only muscles that actually have at
// least one tagged, videoed exercise show up as a chip (see
// availableMuscles below) - no point offering a filter that always
// empties the grid.
const MUSCLE_ORDER = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full body',
]

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

// Muscle chips (single-select, tap again to clear) plus name search -
// the two combine (AND), same "narrow the grid live" feel search
// already had. Now that 236/242 exercises carry a muscle_groups tag
// (backfilled 2026-08-03 from exercise names, admin-editable per
// exercise afterward), a filter row actually has something to filter.
export default function ExerciseLibrary({
  exercises,
  isGuest = false,
}: {
  exercises: ExerciseEntry[]
  isGuest?: boolean
}) {
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set())
  const [showNudge, setShowNudge] = useState(false)
  const [showLessonsModal, setShowLessonsModal] = useState(false)

  function openExerciseModal(id: string) {
    setOpenId(id)
    if (!isGuest) return

    setOpenedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      if (
        next.size >= NUDGE_VIDEO_THRESHOLD &&
        window.localStorage.getItem(NUDGE_DISMISS_KEY) !== new Date().toDateString()
      ) {
        setShowNudge(true)
      }
      return next
    })
  }

  function dismissNudge() {
    window.localStorage.setItem(NUDGE_DISMISS_KEY, new Date().toDateString())
    setShowNudge(false)
  }

  const availableMuscles = useMemo(() => {
    const present = new Set<string>()
    for (const e of exercises) for (const m of e.muscleGroups) present.add(m)
    return MUSCLE_ORDER.filter((m) => present.has(m))
  }, [exercises])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exercises.filter((e) => {
      if (muscle && !e.muscleGroups.includes(muscle)) return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [exercises, search, muscle])

  const openExercise = exercises.find((e) => e.id === openId) || null

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises..."
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 mb-3"
      />

      {availableMuscles.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
          {availableMuscles.map((m) => {
            const active = muscle === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMuscle(active ? null : m)}
                className={`shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                  active
                    ? 'bg-orange-500 border-orange-500 text-black'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                {m}
              </button>
            )
          })}
        </div>
      )}

      <p className="text-zinc-500 text-xs mb-4">
        {exercises.length} exercise{exercises.length === 1 ? '' : 's'} with video
      </p>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-16">
          {exercises.length === 0
            ? 'No videos yet - check back soon.'
            : search
              ? `No exercises match "${search}".`
              : `No ${muscle} exercises with video yet.`}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} onOpen={() => openExerciseModal(exercise.id)} />
          ))}
        </div>
      )}

      {openExercise && <VideoModal exercise={openExercise} onClose={() => setOpenId(null)} />}

      {showNudge && (
        <div className="fixed bottom-4 inset-x-0 z-40 px-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-2xl shadow-lg shadow-black/40 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold">Liking these?</p>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Get the first 7 lessons free, no payment needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNudge(false)
                  setShowLessonsModal(true)
                }}
                className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition whitespace-nowrap"
              >
                Get free lessons
              </button>
              <button
                onClick={dismissNudge}
                aria-label="Dismiss"
                className="shrink-0 text-zinc-500 hover:text-white transition text-sm px-1"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {showLessonsModal && <LessonPreviewModal onClose={() => setShowLessonsModal(false)} />}
    </div>
  )
}
