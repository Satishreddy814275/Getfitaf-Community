'use client'

import { useState } from 'react'

// Shared like button for both posts and comments. It doesn't know or
// care which kind — the parent passes in the current liked/count
// state and an onToggle callback that calls the right server action
// (toggleLike vs toggleCommentLike).
//
// The whole point of this component is the optimistic update: the
// heart flips and the count changes the instant you click, before the
// server responds. Previously the like button waited for a full
// server round-trip (server action + revalidatePath) before anything
// visibly changed, which is what made likes feel slow.
//
// Once clicked, this component's own local state becomes the source
// of truth — it deliberately does NOT resync from the `liked`/`count`
// props afterward. An earlier version did resync the moment the
// server call finished, which caused a visible flicker back to the
// stale pre-click state: the server call resolving and the page's
// props actually refreshing are two separate moments (revalidatePath
// takes a beat to propagate), so resyncing right when the call
// finished meant briefly showing data that was already out of date,
// before the real refresh arrived a moment later and corrected it
// again. Trusting the optimistic state avoids that entirely — the
// only trade-off is that the same post open in a second browser tab
// won't reflect a like made in this tab without a full reload, which
// is a fine trade for something this low-stakes.
export default function LikeButton({
  liked,
  count,
  onToggle,
  compact = false,
}: {
  liked: boolean
  count: number
  onToggle: () => Promise<void>
  compact?: boolean
}) {
  const [optimisticLiked, setOptimisticLiked] = useState(liked)
  const [optimisticCount, setOptimisticCount] = useState(count)
  const [pending, setPending] = useState(false)
  const [popping, setPopping] = useState(false)

  async function handleClick() {
    if (pending) return
    const nextLiked = !optimisticLiked

    setPending(true)
    setOptimisticLiked(nextLiked)
    setOptimisticCount((c) => c + (nextLiked ? 1 : -1))

    // Only pop when going unliked -> liked, not on unlike — a little
    // burst on adding a like reads right, the same burst on removing
    // one doesn't.
    if (nextLiked) setPopping(true)

    try {
      await onToggle()
    } catch {
      // Revert silently on failure — a failed like isn't worth
      // interrupting someone with an error over, but the UI shouldn't
      // keep claiming a like that didn't actually save.
      setOptimisticLiked(!nextLiked)
      setOptimisticCount((c) => c + (nextLiked ? -1 : 1))
    } finally {
      setPending(false)
    }
  }

  const iconSize = compact ? 14 : 18

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        optimisticLiked
          ? `flex items-center gap-1 text-orange-500 font-medium ${compact ? 'text-xs' : 'text-sm'}`
          : `flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition ${compact ? 'text-xs' : 'text-sm'}`
      }
    >
      {/* Real heart icon rather than the Unicode ♥ character, which
          renders inconsistently across platforms — this one is a
          single path that goes from outline to solid fill on like, and
          inherits color from the button text classes above via
          currentColor, so it themes automatically. */}
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill={optimisticLiked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={optimisticLiked ? 0 : 1.8}
        style={popping ? { animation: 'like-pop 350ms ease-out' } : undefined}
        onAnimationEnd={() => setPopping(false)}
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
      <span>
        {optimisticCount > 0 ? optimisticCount : ''} {compact ? '' : 'Like'}
      </span>
    </button>
  )
}
