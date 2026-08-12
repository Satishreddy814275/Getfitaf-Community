import Link from 'next/link'
import type { WorkoutLeaderboardRow } from '@/types'

// Mobile-only compact leaderboard line above the feed (see FeedTabs) -
// mirrors LeaderboardTeaser's layout exactly, but shows workout
// leaders instead of community activity. Satish 2026-08-12: with only
// room for one line on mobile, wanted it to be the workout board, not
// the community one (the desktop sidebar shows both, workouts first -
// see feed/page.tsx).
export default function WorkoutLeaderboardTeaser({ rows }: { rows: WorkoutLeaderboardRow[] }) {
  const top3 = rows.slice(0, 3)

  return (
    <Link
      href="/leaderboard"
      className="flex items-center justify-between gap-2 glass rounded-xl px-3 py-2.5 mb-4 hover:bg-white/[0.06] transition"
    >
      <p className="text-xs text-zinc-300 truncate">
        <span className="mr-1.5">💪</span>
        {top3.length > 0 ? (
          <>
            This month:{' '}
            {top3.map((r, i) => (
              <span key={r.user_id}>
                <span className="text-white font-medium">{r.first_name}</span> ({r.workout_count})
                {i < top3.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </>
        ) : (
          'No workouts logged yet this month - be the first on the board.'
        )}
      </p>
      <span className="text-orange-500 text-xs font-medium shrink-0">View full →</span>
    </Link>
  )
}
