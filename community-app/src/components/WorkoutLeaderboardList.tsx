import { formatDistanceToNow } from 'date-fns'
import type { WorkoutLeaderboardRow } from '@/types'

// Extracted out of LeaderboardTabs.tsx (Satish 2026-08-12) so the
// /feed sidebar can render this list on its own, in whatever order it
// wants relative to the community board - LeaderboardTabs always shows
// Community first, but /feed shows Workouts first (Satish's explicit
// ask), so each page composes its own order rather than this list
// baking in a fixed position.
const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function WorkoutLeaderboardList({
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
