import type { LeaderboardRow } from '@/types'

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function LeaderboardList({
  rows,
  currentUserId,
}: {
  rows: LeaderboardRow[]
  currentUserId?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500 py-8">
        No activity yet this month — be the first to show up on the board.
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
                {row.post_count} post{row.post_count === 1 ? '' : 's'} · {row.comment_count} comment
                {row.comment_count === 1 ? '' : 's'}
              </p>
            </div>
            {row.streak > 0 && <span className="text-xs text-orange-400 shrink-0">🔥 {row.streak}</span>}
          </div>
        )
      })}
    </div>
  )
}
