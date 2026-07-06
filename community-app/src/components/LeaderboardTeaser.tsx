import Link from 'next/link'
import type { LeaderboardRow } from '@/types'

// Compact single-line version of the leaderboard for mobile, where
// there's no room for a side column. Deliberately minimal (no
// avatars, no per-person stats) so it doesn't compete with the actual
// feed for attention — the full detailed view lives on /leaderboard
// and in the sidebar widget on desktop.
export default function LeaderboardTeaser({ rows }: { rows: LeaderboardRow[] }) {
  const top3 = rows.slice(0, 3)

  return (
    <Link
      href="/leaderboard"
      className="flex items-center justify-between gap-2 glass rounded-xl px-3 py-2.5 mb-4 hover:bg-white/[0.06] transition"
    >
      <p className="text-xs text-zinc-300 truncate">
        <span className="mr-1.5">🏆</span>
        {top3.length > 0 ? (
          <>
            This month:{' '}
            {top3.map((r, i) => (
              <span key={r.user_id}>
                <span className="text-white font-medium">{r.first_name}</span> ({r.score})
                {i < top3.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </>
        ) : (
          'No activity yet this month - be the first on the board.'
        )}
      </p>
      <span className="text-orange-500 text-xs font-medium shrink-0">View full →</span>
    </Link>
  )
}
