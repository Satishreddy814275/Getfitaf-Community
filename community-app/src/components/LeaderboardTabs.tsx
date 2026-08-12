import { formatDistanceToNow } from 'date-fns'
import LeaderboardList from './LeaderboardList'
import type { LeaderboardRow, WorkoutLeaderboardRow } from '@/types'

// Satish 2026-08-12: wanted a second leaderboard scored by workouts
// completed, not just community activity. First shipped as a two-tab
// toggle, but that meant clicking into /leaderboard (or the Lessons
// tab) AND THEN clicking again to see workouts - Satish flagged this
// as too many clicks to reach something meant to be motivating to
// glance at. Mocked up two fixes (side-by-side columns vs. stacked
// full-width) and stacked won - both boards always visible, one
// straight after the other, no toggle/state needed at all anymore
// (this went from a client component back to a plain server-renderable
// one). Community section keeps using the existing LeaderboardList
// as-is; Workouts gets its own lighter row (no streak - see
// WorkoutLeaderboardRow's own comment for why reusing the posting
// streak here would be misleading).
export default function LeaderboardTabs({
  communityRows,
  workoutRows,
  currentUserId,
}: {
  communityRows: LeaderboardRow[]
  workoutRows: WorkoutLeaderboardRow[]
  currentUserId?: string
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm font-semibold text-orange-400 mb-2">🏆 Community</p>
      <LeaderboardList rows={communityRows} currentUserId={currentUserId} />

      <p className="text-sm font-semibold text-orange-400 mt-5 mb-2">💪 Workouts</p>
      <WorkoutLeaderboardList rows={workoutRows} currentUserId={currentUserId} />
    </div>
  )
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function WorkoutLeaderboardList({
  rows,
  currentUserId,
}: {
  rows: WorkoutLeaderboardRow[]
  currentUserId?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500 py-8">
        No workouts logged yet this month - be the first to show up on the board.
      </p>
    )
  }

  return (
    <div className="divide-y divide-zinc-800">
      {rows.map((row) => {
        const isMe = row.user_id === currentUserId
        return (
          <div
            key={row.user_id}
            className={
              isMe
                ? 'flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg bg-orange-500/10'
                : 'flex items-center gap-3 py-3'
            }
          >
            <span className="w-7 text-center text-sm font-bold text-zinc-500 shrink-0">
              {MEDALS[row.rank] || row.rank}
            </span>
            <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm font-semibold shrink-0">
              {row.first_name[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {row.first_name}
                {isMe && <span className="text-orange-400 font-normal"> (you)</span>}
              </p>
              <p className="text-zinc-500 text-xs">
                {row.workout_count} workout{row.workout_count === 1 ? '' : 's'} completed
              </p>
            </div>
            {row.last_completed && (
              <span className="text-xs text-zinc-500 shrink-0">
                {formatDistanceToNow(new Date(row.last_completed), { addSuffix: true })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
