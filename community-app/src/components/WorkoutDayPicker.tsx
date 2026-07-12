'use client'

import { useState, useTransition } from 'react'
import { logWorkoutSession } from '@/app/workouts/actions'
import { parseTargetSetCount } from '@/lib/workoutPlan'
import type { WorkoutPlanDay, LastLoggedSet } from '@/types'

interface SetRow {
  weight: string
  reps: string
}

// The actual logging UI. Two views in one component rather than
// separate routes per day - simpler state management, and nothing
// here needs to be a shareable/bookmarkable URL. `activeDay` being set
// switches from the day list into that day's logging form.
export default function WorkoutDayPicker({
  generationId,
  days,
  completedDayKeys,
  lastByExercise,
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedDayKeys: string[]
  lastByExercise: Record<string, LastLoggedSet>
}) {
  const [activeDay, setActiveDay] = useState<WorkoutPlanDay | null>(null)
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({})
  const [isPending, startTransition] = useTransition()
  const [justFinished, setJustFinished] = useState(false)
  const completedSet = new Set(completedDayKeys)

  function startDay(day: WorkoutPlanDay) {
    // Pre-fill one row per target set (e.g. "3-5" -> 3 rows) - just a
    // starting point, the +/- controls below let them adjust freely.
    const initial: Record<string, SetRow[]> = {}
    for (const ex of day.exercises) {
      const count = parseTargetSetCount(ex.sets)
      initial[ex.name] = Array.from({ length: count }, () => ({ weight: '', reps: '' }))
    }
    setSetsByExercise(initial)
    setActiveDay(day)
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
    if (!activeDay) return
    const sets = activeDay.exercises.flatMap((ex) =>
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
        week: activeDay.week,
        day: activeDay.day,
        dayLabel: activeDay.label,
        sets,
      })
      setActiveDay(null)
      setJustFinished(true)
    })
  }

  if (activeDay) {
    return (
      <div>
        <button
          onClick={() => setActiveDay(null)}
          className="text-sm text-zinc-400 hover:text-white transition mb-4"
        >
          ← Back to all days
        </button>
        <h2 className="text-white text-lg font-bold mb-4">
          Week {activeDay.week}, Day {activeDay.day}: {activeDay.label}
        </h2>

        <div className="space-y-4">
          {activeDay.exercises.map((ex) => {
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
    <div className="space-y-2">
      {justFinished && (
        <p className="text-sm text-orange-400 mb-2">Nice work - that session&apos;s logged.</p>
      )}
      {days.map((day) => {
        const key = `${day.week}-${day.day}`
        const isCompleted = completedSet.has(key)
        return (
          <button
            key={key}
            onClick={() => startDay(day)}
            className="w-full flex items-center justify-between glass rounded-xl px-4 py-3 text-left hover:bg-zinc-900/60 transition"
          >
            <span className="text-white text-sm font-medium">
              Week {day.week}, Day {day.day}: {day.label}
            </span>
            {isCompleted && <span className="text-orange-500 text-xs font-semibold">Done</span>}
          </button>
        )
      })}
    </div>
  )
}
