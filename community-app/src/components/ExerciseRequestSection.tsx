'use client'

import { useMemo, useState } from 'react'

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

// "Can't find the video? Request it" section on /exercises (Satish
// 2026-08-03). Dual purpose, per discussion: gives visitors a small
// way to interact with the library instead of just consuming it (top-5
// list is public on purpose, so a request visibly joins a shared
// effort rather than vanishing into a form), and gives Satish a real
// demand signal for what to shoot next.
//
// Every request/+1 is a "vote" - no login or per-user vote tracking,
// just increment-on-submit (see /api/exercise-requests). The only
// anti-spam measure is client-side and low-stakes on purpose: once
// this device has requested a given exercise, its button flips to a
// disabled "Requested" state via localStorage, mirroring the
// dismiss-for-the-day pattern used elsewhere in this codebase
// (FreeLessonsBanner etc.) rather than anything server-enforced.
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
}: {
  unshotExercises: UnshotExercise[]
  initialTopRequests: TopRequest[]
}) {
  const [topRequests, setTopRequests] = useState(initialTopRequests)
  const [submitted, setSubmitted] = useState<Set<string>>(() => loadSubmitted())
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          ? `Added - ${data.requestCount} people have asked for "${data.exerciseName}" now.`
          : `Added "${data.exerciseName}" to the list - you're the first to ask.`
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

  return (
    <div className="mt-10 pt-6 border-t border-zinc-800">
      <p className="text-white font-semibold text-sm">Can&apos;t find the video?</p>
      <p className="text-zinc-500 text-xs mt-1 mb-4">
        Request it below - and see what other people are asking for.
      </p>

      {topRequests.length > 0 && (
        <div className="rounded-xl border border-zinc-700 overflow-hidden mb-4">
          {topRequests.map((r, i) => {
            const key = requestKey(r.exerciseId, r.exerciseName)
            const isSubmitted = submitted.has(key)
            const isPending = pending === key
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 px-3 py-2.5 border-b border-zinc-700/70 last:border-0"
              >
                <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-zinc-100">
                  {r.exerciseName}
                </span>
                <span className="text-xs text-zinc-500 shrink-0">
                  {r.requestCount} {r.requestCount === 1 ? 'request' : 'requests'}
                </span>
                <button
                  type="button"
                  disabled={isSubmitted || isPending}
                  onClick={() => submitRequest(r.exerciseId, r.exerciseName)}
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg transition ${
                    isSubmitted
                      ? 'text-zinc-500 cursor-default'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
                >
                  {isSubmitted ? 'Requested ✓' : isPending ? '...' : '+1'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative max-w-sm">
        <div className="flex gap-2">
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
            className="flex-1 bg-zinc-900 border border-zinc-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500 transition"
          />
          <button
            type="submit"
            disabled={!query.trim() || pending !== null}
            className="shrink-0 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl transition text-sm"
          >
            Request
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg">
            {suggestions.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onMouseDown={() => submitRequest(ex.id, ex.name)}
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-0"
              >
                {ex.name}
              </button>
            ))}
          </div>
        )}
      </form>

      {feedback && <p className="text-orange-400 text-xs mt-2">{feedback}</p>}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
