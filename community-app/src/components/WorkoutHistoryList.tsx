'use client'

import { useState } from 'react'
import { convertWeightForDisplay, type WeightUnit } from '@/lib/weightUnit'
import type { WorkoutHistoryGroup, WorkoutHistorySet } from '@/types'

export default function WorkoutHistoryList({
  groups,
  weightUnit,
}: {
  groups: WorkoutHistoryGroup[]
  // Optional, defaulting to kg (matches every logged value's canonical
  // storage unit) - AdminMembersList passes the viewed member's own
  // preference here, not the admin's, so the numbers a coach sees match
  // what that client actually sees in their own app.
  weightUnit?: WeightUnit
}) {
  const unit = weightUnit ?? 'kg'
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)

  if (groups.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-12">No completed workouts yet.</p>
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.generationId}>
          <h3 className="text-white text-sm font-bold mb-2">
            {group.isCurrent ? 'Current Program' : 'Previous Program'}
          </h3>
          <div className="space-y-1.5">
            {group.sessions.map((session) => {
              const isExpanded = expandedSessionId === session.id
              const byExercise = new Map<string, WorkoutHistorySet[]>()
              for (const s of session.sets) {
                const list = byExercise.get(s.exerciseName) || []
                list.push(s)
                byExercise.set(s.exerciseName, list)
              }

              return (
                <div key={session.id} className="glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-white text-sm font-medium">
                      Week {session.week}, Day {session.day}: {session.label}
                    </span>
                    <span className="text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(session.completedAt).toLocaleDateString()}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-1.5 border-t border-zinc-800 pt-3">
                      {byExercise.size === 0 && (
                        <p className="text-xs text-zinc-500">No sets logged for this session.</p>
                      )}
                      {Array.from(byExercise.entries()).map(([exerciseName, sets]) => (
                        <p key={exerciseName} className="text-xs text-zinc-400">
                          <span className="text-zinc-300 font-medium">{exerciseName}:</span>{' '}
                          {sets
                            .slice()
                            .sort((a, b) => a.setNumber - b.setNumber)
                            .map((s) => {
                              const w = convertWeightForDisplay(s.weight, unit)
                              return `${w != null ? `${w}${unit}` : '-'} x ${s.reps ?? '-'}`
                            })
                            .join(', ')}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
