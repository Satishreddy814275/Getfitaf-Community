import LeaderboardList from './LeaderboardList'
import WorkoutLeaderboardList from './WorkoutLeaderboardList'
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
