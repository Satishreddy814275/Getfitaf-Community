'use client'

import { useState } from 'react'
import Link from 'next/link'
import WorkoutDayPicker from './WorkoutDayPicker'
import WorkoutHistoryList from './WorkoutHistoryList'
import type { ExerciseVideo } from '@/lib/exerciseVideos'
import type { WorkoutPlanDay, LastLoggedSet, WorkoutHistoryGroup, WorkoutExerciseSwap } from '@/types'

type Tab = 'current' | 'history'

export default function WorkoutsTabs({
  generationId,
  days,
  completedCells,
  lastByExercise,
  history,
  videos,
  swaps,
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedCells: string[]
  lastByExercise: Record<string, LastLoggedSet>
  history: WorkoutHistoryGroup[]
  videos: ExerciseVideo[]
  swaps: WorkoutExerciseSwap[]
}) {
  const [tab, setTab] = useState<Tab>('current')
  // True while WorkoutDayPicker has a day open for logging - reported
  // up via its onSessionActiveChange callback. Drives hiding the page
  // header and tab switcher below, so an active session gets the whole
  // screen instead of competing with "Your Workouts" / the program
  // description / the Completed Workouts tab for attention. Discard
  // (on WorkoutDayPicker's own sticky bar) is the only way out of an
  // active session now - no Back to Community link shown here either
  // while one's running, per Satish's explicit call.
  const [sessionActive, setSessionActive] = useState(false)

  return (
    <div>
      {!sessionActive && (
        <>
          <Link
            href="/feed"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
          >
            ← Back to Community
          </Link>
          <h1 className="text-white text-xl font-bold mb-1">Your Workouts</h1>
          <p className="text-zinc-400 text-sm mb-6">
            Your 4-week program. Same split each week - tap whatever&apos;s next, or pick any
            session out of order if you&apos;d rather.
          </p>
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
        </>
      )}

      {tab === 'current' ? (
        <WorkoutDayPicker
          generationId={generationId}
          days={days}
          completedCells={completedCells}
          lastByExercise={lastByExercise}
          history={history}
          videos={videos}
          swaps={swaps}
          onSessionActiveChange={setSessionActive}
        />
      ) : (
        <WorkoutHistoryList groups={history} />
      )}
    </div>
  )
}
