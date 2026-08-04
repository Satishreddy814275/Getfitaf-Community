'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface UnshotExercise {
  id: string
  name: string
}

interface TopRequest {
  id: string
  exerciseId: string | null
  exerciseName: string
  requestCount: number
}

// "Can't find the video? Request it" panel on /exercises (Satish
// 2026-08-03). Dual purpose: gives visitors a small way to interact
// with the library instead of just consuming it, and gives Satish a
// real demand signal for what to shoot next.
//
// Persistent sidebar on md+, not a toggle/tab - Satish's explicit call
// 2026-08-03 after seeing a slide-out-tab mockup: he wanted it always
// visible next to the grid rather than requiring a tap to reveal.
// Collapses to a compact bar above the grid on narrow screens (see
// exercises/page.tsx's order-first/md:order-last), since there's no
// room for a second column on mobile.
//
// Every request/+1 is a "vote" - no login or per-user vote tracking,
// just increment-on-submit (see /api/exercise-requests). The submit
// button for a brand-new request reads "+1 this exercise" rather than
// "Request" - Satish's call: he wanted the whole feature to read as
// one consistent +1 gesture, not a form-submission on one hand and a
// vote button on the other. The only anti-spam measure is client-side
// and low-stakes on purpose: once this device has requested a given
// exercise, its button flips to a disabled "Requested" state via
// localStorage, mirroring the dismiss-for-the-day pattern used
// elsewhere in this codebase (FreeLessonsBanner etc.) rather than
// anything server-enforced.
const SUBMITTED_KEY = 'gfa-exercise-requests-submitted'
const MAX_SUGGESTIONS = 6

function loadSubmitted(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(SUBMITTED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

// Catalog requests are keyed by exercise id; freeform requests (not in
// the catalog at all) are keyed by their lowercased trimmed name -
// mirrors the same matching /api/exercise-requests uses server-side.
function requestKey(exerciseId: string | null, exerciseName: string) {
  return exerciseId || `freeform:${exerciseName.trim().toLowerCase()}`
}

export default function ExerciseRequestSection({
  unshotExercises,
  initialTopRequests,
  className = '',
}: {
  unshotExercises: UnshotExercise[]
  initialTopRequests: TopRequest[]
  className?: string
}) {
  const [topRequests, setTopRequests] = useState(initialTopRequests)
  const [submitted, setSubmitted] = useState<Set<string>>(() => loadSubmitted())
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mobileExpanded, setMobileExpanded] = useState(false)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return unshotExercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS)
  }, [query, unshotExercises])

  function markSubmitted(key: string) {
    setSubmitted((prev) => {
      const next = new Set(prev)
      next.add(key)
      window.localStorage.setItem(SUBMITTED_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  async function submitRequest(exerciseId: string | null, exerciseName: string) {
    const key = requestKey(exerciseId, exerciseName)
    if (submitted.has(key) || pending) return

    setPending(key)
    setError(null)
    try {
      const res = await fetch('/api/exercise-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, exerciseName }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.')
        return
      }

      setFeedback(
        data.requestCount > 1
          ? `+1 added - ${data.requestCount} people have asked for "${data.exerciseName}" now.`
          : `+1 added for "${data.exerciseName}" - you're the first to ask.`
      )
      markSubmitted(key)

      setTopRequests((prev) => {
        const existingIdx = prev.findIndex((r) => requestKey(r.exerciseId, r.exerciseName) === key)
        const updated =
          existingIdx >= 0
            ? prev.map((r, i) => (i === existingIdx ? { ...r, requestCount: data.requestCount } : r))
            : [
                ...prev,
                {
                  id: key,
                  exerciseId,
                  exerciseName: data.exerciseName,
                  requestCount: data.requestCount,
                },
              ]
        return updated.sort((a, b) => b.requestCount - a.requestCount).slice(0, 5)
      })

      setQuery('')
      setShowSuggestions(false)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setPending(null)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    // If the typed text exactly matches an unshot exercise (case-
    // insensitive), request it as a real catalog match rather than a
    // freeform entry - keeps a manually-typed exact name and a
    // clicked suggestion from splitting into two separate counts.
    const exactMatch = unshotExercises.find((ex) => ex.name.toLowerCase() === trimmed.toLowerCase())
    submitRequest(exactMatch?.id ?? null, exactMatch?.name ?? trimmed)
  }

  function requestRow(r: TopRequest, index: number) {
    const key = requestKey(r.exerciseId, r.exerciseName)
    const isSubmitted = submitted.has(key)
    const isPending = pending === key
    return (
      <div
        key={r.id}
        className="flex items-center gap-2 py-2 border-b border-zinc-700/70 last:border-0"
      >
        <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-bold shrink-0">
          {index + 1}
        </span>
        <span className="flex-1 min-w-0 truncate text-xs text-zinc-100">{r.exerciseName}</span>
        <span className="text-[11px] text-zinc-500 shrink-0">{r.requestCount}</span>
        <button
          type="button"
          disabled={isSubmitted || isPending}
          onClick={(e) => {
            e.stopPropagation()
            submitRequest(r.exerciseId, r.exerciseName)
          }}
          className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg transition ${
            isSubmitted ? 'text-zinc-500 cursor-default' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}
        >
          {isSubmitted ? '✓' : isPending ? '...' : '+1'}
        </button>
      </div>
    )
  }

  const listAndForm = (
    <>
      {topRequests.length > 0 && (
        <div className="mb-3">{topRequests.map((r, i) => requestRow(r, i))}</div>
      )}
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Type an exercise name..."
          className="w-full bg-zinc-900 border border-zinc-600 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500 transition"
        />
        <button
          type="submit"
          disabled={!query.trim() || pending !== null}
          className="mt-2 w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl transition text-xs"
        >
          +1 this exercise
        </button>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg">
            {suggestions.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onMouseDown={() => submitRequest(ex.id, ex.name)}
                className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-0"
              >
                {ex.name}
              </button>
            ))}
          </div>
        )}
      </form>

      {feedback && <p className="text-orange-400 text-[11px] mt-2">{feedback}</p>}
      {error && <p className="text-red-400 text-[11px] mt-2">{error}</p>}
    </>
  )

  return (
    <div className={className}>
      {/* Desktop/tablet: persistent sidebar, always visible next to
          the grid - no toggle. Sticky so it stays in view while
          scrolling through the grid. */}
      <div className="hidden md:block sticky top-6 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <p className="text-white font-semibold text-sm">Most wanted</p>
        <p className="text-zinc-500 text-[11px] mt-0.5 mb-3">Can&apos;t find a video? Ask below.</p>
        {listAndForm}
      </div>

      {/* Mobile: compact bar above the grid (see order-first on the
          wrapper in page.tsx) - no room for a persistent side column
          on narrow screens, so this collapses by default and expands
          inline on tap. Top request still gets a one-tap +1 without
          expanding. */}
      <div className="md:hidden rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setMobileExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5"
        >
          {topRequests[0] ? (
            <>
              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                1
              </span>
              <span className="flex-1 min-w-0 truncate text-xs text-zinc-100 text-left">
                Most wanted: {topRequests[0].exerciseName}
              </span>
              <span className="text-[11px] text-zinc-500 shrink-0">{topRequests[0].requestCount}</span>
            </>
          ) : (
            <span className="flex-1 text-xs text-zinc-300 text-left">Can&apos;t find a video? Request one</span>
          )}
          <ChevronDown
            size={16}
            className={`text-zinc-500 shrink-0 transition-transform ${mobileExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        {mobileExpanded && <div className="px-3 pb-3">{listAndForm}</div>}
      </div>
    </div>
  )
}
