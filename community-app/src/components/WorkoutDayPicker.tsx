'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { logWorkoutSession, requestExerciseVideo, swapExercise } from '@/app/workouts/actions'
import { parseTargetSetCount } from '@/lib/workoutPlan'
import { findExerciseVideo, youtubeSearchUrl, type ExerciseVideo } from '@/lib/exerciseVideos'
import type { WorkoutPlanDay, LastLoggedSet, WorkoutExerciseSwap } from '@/types'

interface SetRow {
  weight: string
  reps: string
}

// name/sets/reps reflect whatever should currently be displayed
// (possibly swapped); originalName is the untouched template name,
// kept stable across swaps so it can be used as the swap "key" - both
// for looking up an existing swap row and for re-swapping the same
// slot without accumulating duplicates.
interface CellExercise {
  originalName: string
  name: string
  sets: string
  reps: string
}

interface Cell {
  key: string
  week: number
  day: number
  label: string
  exercises: CellExercise[]
}

// Same weekly split repeated across a fixed 4-week program - the AI
// only ever generates one week's worth of days per response, so this
// is what lays that out into the full program length. Matches the
// methodology's own guidance that a program runs 3-4 weeks before
// changing things up.
const TOTAL_WEEKS = 4

// Applies any swaps for this day/week on top of the template's
// exercises. A week-specific swap (weekNumber === week) wins over an
// all-weeks swap (weekNumber === 0) for the same day/exercise if a
// member somehow has both recorded.
function resolveExercises(
  day: WorkoutPlanDay,
  week: number,
  swaps: WorkoutExerciseSwap[]
): CellExercise[] {
  return day.exercises.map((ex) => {
    const swap =
      swaps.find(
        (s) => s.dayNumber === day.day && s.weekNumber === week && s.originalExerciseName === ex.name
      ) ||
      swaps.find(
        (s) => s.dayNumber === day.day && s.weekNumber === 0 && s.originalExerciseName === ex.name
      )
    return swap
      ? { originalName: ex.name, name: swap.newExerciseName, sets: swap.sets, reps: swap.reps }
      : { originalName: ex.name, name: ex.name, sets: ex.sets, reps: ex.reps }
  })
}

const DRAFT_KEY_PREFIX = 'workout-draft-'

interface Draft {
  cell: Cell
  sets: Record<string, SetRow[]>
}

// A session isn't saved to the server at all until "Finish Workout" -
// without this, closing the tab mid-session silently threw away
// everything typed so far. Scoped to the browser/device only
// (localStorage, not a new table) since that matches the actual ask:
// surviving a refresh or an accidentally-closed tab, not syncing an
// in-progress session across devices.
function loadDraft(generationId: string): Draft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY_PREFIX + generationId)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function saveDraft(generationId: string, cell: Cell, sets: Record<string, SetRow[]>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DRAFT_KEY_PREFIX + generationId, JSON.stringify({ cell, sets }))
  } catch {
    // Storage full/unavailable - worst case the draft just doesn't
    // resume, logging itself still works fine.
  }
}

function clearDraft(generationId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DRAFT_KEY_PREFIX + generationId)
  } catch {
    // no-op
  }
}

// The actual logging UI. Shows the whole 4-week program up front as a
// grid (grouped by week), not just an abstract "logged Nx" counter -
// completed cells are marked done, and the first not-yet-completed
// cell in program order is highlighted as "up next." That highlight
// is just a recommendation, not a gate - every cell stays clickable,
// so someone can still log any session out of order if they want to.
export default function WorkoutDayPicker({
  generationId,
  days,
  completedCells,
  lastByExercise,
  videos,
  swaps,
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedCells: string[]
  lastByExercise: Record<string, LastLoggedSet>
  videos: ExerciseVideo[]
  swaps: WorkoutExerciseSwap[]
}) {
  const [activeCell, setActiveCell] = useState<Cell | null>(null)
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({})
  const [isPending, startTransition] = useTransition()
  const [justFinished, setJustFinished] = useState(false)
  // Which exercise names have had a video request sent this page
  // visit - purely local feedback so the button can say "Requested"
  // right away, not a persisted "don't ask again" flag. A fresh visit
  // showing the request option again is fine; the community post
  // itself is the record that matters, not this bit of UI state.
  const [requestedVideos, setRequestedVideos] = useState<Set<string>>(new Set())
  // Which exercise's swap panel is open, keyed by its stable
  // originalName - and what's currently typed into it.
  const [swapPanelFor, setSwapPanelFor] = useState<string | null>(null)
  const [swapInput, setSwapInput] = useState('')
  const restoredRef = useRef(false)

  function handleRequestVideo(exerciseName: string) {
    setRequestedVideos((prev) => new Set(prev).add(exerciseName))
    startTransition(() => {
      requestExerciseVideo(exerciseName)
    })
  }

  const completedSet = new Set(completedCells)

  const allCells: Cell[] = []
  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    for (const day of days) {
      allCells.push({
        key: `${week}-${day.day}`,
        week,
        day: day.day,
        label: day.label,
        exercises: resolveExercises(day, week, swaps),
      })
    }
  }

  const nextDueKey = allCells.find((c) => !completedSet.has(c.key))?.key
  const programComplete = !nextDueKey

  // Resume a draft left over from a closed tab or refresh - runs once
  // on mount only. Deliberately not re-run on every allCells rebuild
  // (a new array is constructed every render) since that would fight
  // with someone actively picking a fresh cell right after landing.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const draft = loadDraft(generationId)
    if (!draft) return
    if (allCells.some((c) => c.key === draft.cell.key)) {
      setActiveCell(draft.cell)
      setSetsByExercise(draft.sets)
    } else {
      // Stale draft (plan regenerated since, cell no longer exists) -
      // discard rather than resuming into something that's gone.
      clearDraft(generationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keeps the draft in sync with every change while a session's open
  // - this is what actually makes the resume above possible.
  useEffect(() => {
    if (!activeCell) return
    saveDraft(generationId, activeCell, setsByExercise)
  }, [generationId, activeCell, setsByExercise])

  function startCell(cell: Cell) {
    // Pre-fill one row per target set (e.g. "3-5" -> 3 rows) - just a
    // starting point, the +/- controls below let them adjust freely.
    const initial: Record<string, SetRow[]> = {}
    for (const ex of cell.exercises) {
      const count = parseTargetSetCount(ex.sets)
      initial[ex.name] = Array.from({ length: count }, () => ({ weight: '', reps: '' }))
    }
    setSetsByExercise(initial)
    setActiveCell(cell)
    setJustFinished(false)
    setSwapPanelFor(null)
    setSwapInput('')
  }

  function handleBackClick() {
    const hasAnyInput = Object.values(setsByExercise).some((rows) =>
      rows.some((r) => r.weight.trim() !== '' || r.reps.trim() !== '')
    )
    if (hasAnyInput && !confirm('This will close your workout without saving. Continue?')) {
      return
    }
    clearDraft(generationId)
    setActiveCell(null)
  }

  function handleSwap(ex: CellExercise, week: number, applyToAllWeeks: boolean) {
    const newName = swapInput.trim()
    if (!newName || !activeCell) return

    // Migrate any already-entered sets from the old display key to
    // the new one, rather than losing them.
    setSetsByExercise((prev) => {
      const rows = prev[ex.name] || []
      const next = { ...prev }
      delete next[ex.name]
      next[newName] = rows
      return next
    })

    // Update the active cell locally so the swap shows immediately,
    // instead of waiting on the revalidatePath round-trip.
    setActiveCell((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((e) =>
              e.originalName === ex.originalName ? { ...e, name: newName } : e
            ),
          }
        : prev
    )

    setSwapPanelFor(null)
    setSwapInput('')

    startTransition(() => {
      swapExercise({
        generationId,
        day: activeCell.day,
        weekNumber: applyToAllWeeks ? 0 : week,
        originalExerciseName: ex.originalName,
        newExerciseName: newName,
        sets: ex.sets,
        reps: ex.reps,
      })
    })
  }

  function updateSet(exerciseName: string, index: number, field: keyof SetRow, value: string) {
    setSetsByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, [exerciseName]: rows }
    })
  }

  function addSetRow(exerciseName: string) {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseName]: [...(prev[exerciseName] || []), { weight: '', reps: '' }],
    }))
  }

  function removeSetRow(exerciseName: string, index: number) {
    setSetsByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows.splice(index, 1)
      return { ...prev, [exerciseName]: rows }
    })
  }

  function finishWorkout() {
    if (!activeCell) return
    const sets = activeCell.exercises.flatMap((ex) =>
      (setsByExercise[ex.name] || []).map((row, i) => ({
        exerciseName: ex.name,
        setNumber: i + 1,
        weight: row.weight.trim() === '' ? null : Number(row.weight),
        reps: row.reps.trim() === '' ? null : Number(row.reps),
      }))
    )

    startTransition(async () => {
      await logWorkoutSession({
        generationId,
        week: activeCell.week,
        day: activeCell.day,
        dayLabel: activeCell.label,
        sets,
      })
      clearDraft(generationId)
      setActiveCell(null)
      setJustFinished(true)
    })
  }

  if (activeCell) {
    // Suggestions only, not a restriction - the input still accepts
    // free text, this just surfaces exercises we already have videos
    // for so a swap is more likely to land somewhere they can
    // immediately watch a demo.
    const exerciseSuggestions = Array.from(new Set(videos.map((v) => v.exerciseName))).sort()

    return (
      <div>
        <datalist id="exercise-swap-suggestions">
          {exerciseSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          onClick={handleBackClick}
          className="text-sm text-zinc-400 hover:text-white transition mb-4"
        >
          ← Back to your program
        </button>
        <h2 className="text-white text-lg font-bold mb-4">
          Week {activeCell.week}, Day {activeCell.day}: {activeCell.label}
        </h2>

        <div className="space-y-4">
          {activeCell.exercises.map((ex) => {
            const last = lastByExercise[ex.name]
            const video = findExerciseVideo(ex.name, videos)
            const alreadyRequested = requestedVideos.has(ex.name)
            const swapOpen = swapPanelFor === ex.originalName
            return (
              <div key={ex.originalName} className="glass rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-1 gap-2">
                  <p className="text-white font-semibold">{ex.name}</p>
                  <p className="text-zinc-500 text-xs whitespace-nowrap">
                    Target: {ex.sets} x {ex.reps}
                  </p>
                </div>
                {ex.name !== ex.originalName && (
                  <p className="text-zinc-600 text-[11px] mb-1">Swapped from {ex.originalName}</p>
                )}
                {last && (
                  <p className="text-zinc-500 text-xs mb-2">
                    Last time: {last.weight ?? '-'} x {last.reps ?? '-'}
                  </p>
                )}
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  {video ? (
                    <a
                      href={video.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                    >
                      ▶ Watch video
                    </a>
                  ) : (
                    <>
                      <a
                        href={youtubeSearchUrl(ex.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-zinc-400 hover:text-white transition"
                      >
                        Search on YouTube ↗
                      </a>
                      <button
                        onClick={() => handleRequestVideo(ex.name)}
                        disabled={alreadyRequested}
                        className="text-xs font-medium text-zinc-500 hover:text-white disabled:hover:text-zinc-500 transition"
                      >
                        {alreadyRequested ? 'Requested ✓' : 'No video yet - request one'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setSwapPanelFor(swapOpen ? null : ex.originalName)
                      setSwapInput('')
                    }}
                    className="text-xs font-medium text-zinc-500 hover:text-white transition"
                  >
                    {swapOpen ? 'Cancel swap' : '⇄ Swap exercise'}
                  </button>
                </div>

                {swapOpen && (
                  <div className="mb-3 p-3 bg-zinc-900/60 rounded-lg space-y-2">
                    <input
                      type="text"
                      list="exercise-swap-suggestions"
                      value={swapInput}
                      onChange={(e) => setSwapInput(e.target.value)}
                      placeholder="Swap in which exercise?"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleSwap(ex, activeCell.week, false)}
                        disabled={!swapInput.trim() || isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30"
                      >
                        Just this week
                      </button>
                      <button
                        onClick={() => handleSwap(ex, activeCell.week, true)}
                        disabled={!swapInput.trim() || isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition disabled:opacity-30"
                      >
                        All 4 weeks
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {(setsByExercise[ex.name] || []).map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-zinc-500 text-xs w-11 shrink-0">Set {i + 1}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="weight"
                        value={row.weight}
                        onChange={(e) => updateSet(ex.name, i, 'weight', e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="reps"
                        value={row.reps}
                        onChange={(e) => updateSet(ex.name, i, 'reps', e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
                      />
                      <button
                        onClick={() => removeSetRow(ex.name, i)}
                        aria-label="Remove set"
                        className="text-zinc-600 hover:text-red-400 transition text-sm shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addSetRow(ex.name)}
                    className="text-xs text-orange-400 hover:text-orange-300 transition"
                  >
                    + Add set
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={finishWorkout}
          disabled={isPending}
          className="mt-6 w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold py-3 rounded-xl transition"
        >
          {isPending ? 'Saving...' : 'Finish Workout'}
        </button>
      </div>
    )
  }

  // Which week the highlighted "up next" cell falls in - used to give
  // that one week card a slightly brighter treatment than the rest, so
  // the eye lands on the right place first without anything loud.
  const currentWeek = nextDueKey
    ? allCells.find((c) => c.key === nextDueKey)!.week
    : TOTAL_WEEKS

  const totalCells = allCells.length
  const doneCells = completedSet.size

  return (
    <div className="space-y-5">
      {justFinished && (
        <p className="text-sm text-orange-400">Nice work - that session&apos;s logged.</p>
      )}

      {programComplete && (
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-white font-semibold mb-1">You&apos;ve completed your 4-week program 🎉</p>
          <p className="text-zinc-400 text-sm">Build a fresh plan whenever you&apos;re ready for what&apos;s next.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${totalCells > 0 ? (doneCells / totalCells) * 100 : 0}%` }}
          />
        </div>
        <span className="text-zinc-400 text-xs whitespace-nowrap">
          {doneCells} / {totalCells}
        </span>
      </div>

      {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => {
        const weekCells = allCells.filter((c) => c.week === week)
        const weekDone = weekCells.filter((c) => completedSet.has(c.key)).length
        const isCurrentWeek = week === currentWeek && !programComplete

        return (
          <div
            key={week}
            className={`rounded-2xl p-4 transition ${
              isCurrentWeek
                ? 'bg-orange-500/[0.06] border border-orange-500/30'
                : 'bg-zinc-950/60 border border-zinc-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white text-sm font-medium">Week {week}</span>
              <span
                className={`text-xs whitespace-nowrap ${
                  isCurrentWeek ? 'text-orange-400 font-medium' : 'text-zinc-500'
                }`}
              >
                {weekDone} / {weekCells.length}
              </span>
            </div>
            <div className="space-y-2">
              {weekCells.map((cell) => {
                const isDone = completedSet.has(cell.key)
                const isNextDue = cell.key === nextDueKey
                return (
                  <button
                    key={cell.key}
                    onClick={() => startCell(cell)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isNextDue
                        ? 'bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/15'
                        : 'hover:bg-zinc-900/60'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full shrink-0 ${
                        isDone
                          ? 'bg-orange-500'
                          : isNextDue
                            ? 'border-2 border-orange-500'
                            : 'border-2 border-zinc-700'
                      }`}
                    />
                    <span
                      className={`text-sm font-medium flex-1 ${isDone ? 'text-zinc-500' : 'text-white'}`}
                    >
                      Day {cell.day}: {cell.label}
                    </span>
                    {isNextDue && (
                      <span className="text-orange-500 text-xs font-semibold whitespace-nowrap">
                        Up next
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
