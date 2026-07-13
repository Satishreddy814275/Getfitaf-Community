'use client'

import { useState, useTransition } from 'react'
import { logWorkoutSession } from '@/app/workouts/actions'
import { parseTargetSetCount } from '@/lib/workoutPlan'
import type { WorkoutPlanDay, LastLoggedSet } from '@/types'

interface SetRow {
  weight: string
  reps: string
}

interface Cell {
  key: string
  week: number
  day: number
  label: string
  exercises: WorkoutPlanDay['exercises']
}

// Same weekly split repeated across a fixed 4-week program - the AI
// only ever generates one week's worth of days per response, so this
// is what lays that out into the full program length. Matches the
// methodology's own guidance that a program runs 3-4 weeks before
// changing things up.
const TOTAL_WEEKS = 4

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
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedCells: string[]
  lastByExercise: Record<string, LastLoggedSet>
}) {
  const [activeCell, setActiveCell] = useState<Cell | null>(null)
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({})
  const [isPending, startTransition] = useTransition()
  const [justFinished, setJustFinished] = useState(false)

  const completedSet = new Set(completedCells)

  const allCells: Cell[] = []
  for (let week = 1; week <= TOTAL_WEEKS; week++) {
    for (const day of days) {
      allCells.push({
        key: `${week}-${day.day}`,
        week,
        day: day.day,
        label: day.label,
        exercises: day.exercises,
      })
    }
  }

  const nextDueKey = allCells.find((c) => !completedSet.has(c.key))?.key
  const programComplete = !nextDueKey

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
      setActiveCell(null)
      setJustFinished(true)
    })
  }

  if (activeCell) {
    return (
      <div>
        <button
          onClick={() => setActiveCell(null)}
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
            return (
              <div key={ex.name} className="glass rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-1 gap-2">
                  <p className="text-white font-semibold">{ex.name}</p>
                  <p className="text-zinc-500 text-xs whitespace-nowrap">
                    Target: {ex.sets} x {ex.reps}
                  </p>
                </div>
                {last && (
                  <p className="text-zinc-500 text-xs mb-3">
                    Last time: {last.weight ?? '-'} x {last.reps ?? '-'}
                  </p>
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

  return (
    <div className="space-y-6">
      {justFinished && (
        <p className="text-sm text-orange-400">Nice work - that session&apos;s logged.</p>
      )}

      {programComplete && (
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-white font-semibold mb-1">You&apos;ve completed your 4-week program 🎉</p>
          <p className="text-zinc-400 text-sm">Build a fresh plan whenever you&apos;re ready for what&apos;s next.</p>
        </div>
      )}

      {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => (
        <div key={week}>
          <h3 className="text-white text-sm font-bold mb-2">Week {week}</h3>
          <div className="space-y-2">
            {allCells
              .filter((c) => c.week === week)
              .map((cell) => {
                const isDone = completedSet.has(cell.key)
                const isNextDue = cell.key === nextDueKey
                return (
                  <button
                    key={cell.key}
                    onClick={() => startCell(cell)}
                    className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition ${
                      isNextDue
                        ? 'bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/15'
                        : 'glass hover:bg-zinc-900/60'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${isDone ? 'text-zinc-500' : 'text-white'}`}
                    >
                      Day {cell.day}: {cell.label}
                    </span>
                    {isDone ? (
                      <span className="text-zinc-500 text-xs whitespace-nowrap">✓ Done</span>
                    ) : isNextDue ? (
                      <span className="text-orange-500 text-xs font-semibold whitespace-nowrap">
                        Up next
                      </span>
                    ) : null}
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
