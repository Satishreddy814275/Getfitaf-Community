import type { MentionCandidate } from '@/lib/mentions'
import type { Space } from '@/types'

const SPACE_LABEL: Record<Space, string> = {
  premium: 'Premium members',
  low_ticket: 'Low-ticket members',
}

// Shared @mention suggestion list - same look wherever
// useMentionAutocomplete is wired up (PostComposer, PostCard's comment
// form, CommentThread's reply form). Positioned by the caller (each
// caller wraps its own input in a `relative` container and renders
// this directly below it) rather than owning its own positioning here,
// since the three call sites sit inside different-sized containers.
export default function MentionDropdown({
  space,
  loading,
  hasCandidates,
  matches,
  onSelect,
}: {
  space: Space
  loading: boolean
  hasCandidates: boolean
  matches: MentionCandidate[]
  onSelect: (member: MentionCandidate) => void
}) {
  return (
    <div className="absolute z-10 top-full left-2 right-2 -mt-1 rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 px-3 pt-2 pb-1">
        {SPACE_LABEL[space]}
      </p>
      {loading && !hasCandidates ? (
        <p className="text-xs text-zinc-500 px-3 pb-3">Loading members...</p>
      ) : matches.length === 0 ? (
        <p className="text-xs text-zinc-500 px-3 pb-3">No matches.</p>
      ) : (
        matches.map((m) => (
          <button
            key={m.id}
            type="button"
            onMouseDown={(e) => {
              // mousedown (not click) fires before the input's own
              // blur, so the caller can still read/restore the cursor
              // position reliably.
              e.preventDefault()
              onSelect(m)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-zinc-800 transition border-t border-zinc-800 first:border-t-0"
          >
            <span className="w-6 h-6 rounded-full bg-zinc-700 text-zinc-200 flex items-center justify-center text-[10px] font-bold shrink-0">
              {m.fullName
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="text-xs text-white truncate">{m.fullName}</span>
          </button>
        ))
      )}
    </div>
  )
}
