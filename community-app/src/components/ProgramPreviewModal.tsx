'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { DayReadOnlyView } from './AdminProgramsList'
import type { WorkoutPlanDay } from '@/types'

// Read-only "See what's inside" preview, opened from the program
// picker before someone has actually chosen a program - Satish's ask:
// let people look at the full structure (every week, not a collapsed
// "same as week 1" summary - his explicit call, "let them watch
// everything") without any Start Workout action anywhere in it, since
// there's nothing to log against yet. Reuses DayReadOnlyView from the
// admin editor (AdminProgramsList.tsx) for the innermost exercise
// list, rather than building a second read-only exercise renderer -
// same phase-sectioned, round-collapsed visual structure members will
// already recognize from inside a real session.
//
// Three-level progressive disclosure (weeks -> days -> exercises), all
// collapsed by default - Satish's own framing: "first the weeks will
// be visible then they see days and then workouts."
export default function ProgramPreviewModal({
  name,
  days,
  onClose,
}: {
  name: string
  days: WorkoutPlanDay[]
  onClose: () => void
}) {
  const weekNumbers = Array.from(new Set(days.map((d) => d.week))).sort((a, b) => a - b)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set())
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  function toggleWeek(week: number) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }
  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="glass rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-white font-semibold text-sm">{name}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {weekNumbers.length === 0 ? (
          <p className="text-zinc-500 text-sm py-6 text-center">Nothing published for this program yet.</p>
        ) : (
          <div className="space-y-2">
            {weekNumbers.map((week) => {
              const weekDays = days.filter((d) => d.week === week).sort((a, b) => a.day - b.day)
              const weekOpen = expandedWeeks.has(week)
              return (
                <div key={week} className="border border-zinc-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleWeek(week)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-zinc-900"
                  >
                    <span className="text-white text-sm font-medium">Week {week}</span>
                    <span className="text-zinc-500 text-xs">{weekOpen ? '▴' : '▾'}</span>
                  </button>
                  {weekOpen && (
                    <div className="p-2 space-y-2">
                      {weekDays.map((d) => {
                        const dayKey = `${d.week}-${d.day}`
                        const dayOpen = expandedDays.has(dayKey)
                        return (
                          <div key={dayKey} className="border border-zinc-800/60 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleDay(dayKey)}
                              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-zinc-900/40"
                            >
                              <span className="text-zinc-200 text-xs font-medium">
                                Day {d.day}: {d.label}
                              </span>
                              <span className="text-zinc-600 text-[11px]">{dayOpen ? '▴' : '▾'}</span>
                            </button>
                            {dayOpen && (
                              <div className="p-2">
                                <DayReadOnlyView exercises={d.exercises} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
