'use client'

import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { MentionCandidate } from '@/lib/mentions'

// Shared @mention suggestion list - same look wherever
// useMentionAutocomplete is wired up (PostComposer, PostCard's comment
// form, CommentThread's reply form).
//
// Portal-rendered into document.body instead of positioned by a
// `relative` wrapper around the caller's input (Satish 2026-08-13:
// reported mentions "not autofilling" in comments/replies - it was
// actually rendering, just invisibly clipped. PostCard's own root has
// overflow-hidden (for the post image's rounded corners), and
// globals.css's `.comments-collapse > div` also sets overflow: hidden
// (required for the comment section's collapse animation) - both sit
// between a comment/reply input and this dropdown, and CSS
// overflow:hidden clips absolutely-positioned descendants too, not
// just normal-flow content, regardless of nesting depth. The plain
// "new post" composer at the top of the feed isn't inside either
// wrapper, so it was unaffected - only comments/replies were broken.
// A portal is the standard escape hatch: render outside the DOM
// subtree entirely, and compute screen position from the anchor
// input's own getBoundingClientRect() so it still visually tracks it.
// Heading stays neutral on purpose - not "Premium members" / "Low-ticket
// members" (Satish 2026-08-13: this dropdown is the one place in the
// whole app where that internal tier language reached every regular
// paying member, not just admins - everywhere else "Low-ticket" as
// visible text is admin-only, e.g. the merged-feed badge and space
// filter in FeedTabs). The audience is still correctly scoped to the
// caller's own space (see useMentionAutocomplete/getMentionableMembers)
// - a member never sees the other space's names either way - so the
// heading doesn't need to describe the split at all.
export default function MentionDropdown({
  loading,
  hasCandidates,
  matches,
  onSelect,
  anchorRef,
}: {
  loading: boolean
  hasCandidates: boolean
  matches: MentionCandidate[]
  onSelect: (member: MentionCandidate) => void
  // The input/textarea this dropdown should appear directly below -
  // every caller already has this ref for cursor-position handling in
  // useMentionAutocomplete, so nothing new to create, just to pass
  // through.
  anchorRef: RefObject<HTMLElement | null>
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  // Recomputed on scroll/resize while open, not just once on mount -
  // the feed itself scrolls, and a comment box can sit anywhere down a
  // long post list. Capture-phase scroll listener so this also catches
  // scrolling on an inner scroll container (e.g. an overlay), not just
  // the window.
  useLayoutEffect(() => {
    function update() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef])

  if (!rect) return null

  return createPortal(
    <div
      style={{ position: 'fixed', top: rect.top + 4, left: rect.left, width: rect.width }}
      className="z-50 rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-lg"
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 px-3 pt-2 pb-1">
        Members
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
    </div>,
    document.body
  )
}
