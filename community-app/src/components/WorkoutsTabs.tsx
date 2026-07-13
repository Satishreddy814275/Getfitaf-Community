'use client'

import { useState } from 'react'
import WorkoutDayPicker from './WorkoutDayPicker'
import WorkoutHistoryList from './WorkoutHistoryList'
import type { ExerciseVideo } from '@/lib/exerciseVideos'
import type { WorkoutPlanDay, LastLoggedSet, WorkoutHistoryGroup } from '@/types'

type Tab = 'current' | 'history'

export default function WorkoutsTabs({
  generationId,
  days,
  completedCells,
  lastByExercise,
  history,
  videos,
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedCells: string[]
  lastByExercise: Record<string, LastLoggedSet>
  history: WorkoutHistoryGroup[]
  videos: ExerciseVideo[]
}) {
  const [tab, setTab] = useState<Tab>('current')

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-zinc-800">
        <button
          onClick={() => setTab('current')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            tab === 'current'
              ? 'text-orange-500 border-orange-500'
              : 'text-zinc-500 border-transparent hover:text-white'
          }`}
        >
          Current Program
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            tab === 'history'
              ? 'text-orange-500 border-orange-500'
              : 'text-zinc-500 border-transparent hover:text-white'
          }`}
        >
          Completed Workouts
        </button>
      </div>

      {tab === 'current' ? (
        <WorkoutDayPicker
          generationId={generationId}
          days={days}
          completedCells={completedCells}
          lastByExercise={lastByExercise}
          videos={videos}
        />
      ) : (
        <WorkoutHistoryList groups={history} />
      )}
    </div>
  )
}
