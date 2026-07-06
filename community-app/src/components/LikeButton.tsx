'use client'

import { useEffect, useState } from 'react'

// Shared like button for both posts and comments. It doesn't know or
// care which kind — the parent passes in the current liked/count
// state and an onToggle callback that calls the right server action
// (toggleLike vs toggleCommentLike).
//
// The whole point of this component is the optimistic update: the
// heart flips and the count changes the instant you click, before the
// server responds. Previously the like button waited for a full
// server round-trip (server action + revalidatePath) before anything
// visibly changed, which is what made likes feel slow. If the server
// call actually fails, it reverts — but the common case (success) now
// feels instant.
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

  // Reconcile with the server's real state once fresh props arrive
  // (e.g. after revalidatePath) — but only when we're not mid-click,
  // so a slow response can't stomp on a newer click.
  useEffect(() => {
    if (!pending) {
      setOptimisticLiked(liked)
      setOptimisticCount(count)
    }
  }, [liked, count, pending])

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

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        optimisticLiked
          ? `text-orange-500 font-medium ${compact ? 'text-xs' : 'text-sm'}`
          : `text-zinc-400 hover:text-zinc-200 transition ${compact ? 'text-xs' : 'text-sm'}`
      }
    >
      <span
        className="inline-block"
        style={popping ? { animation: 'like-pop 350ms ease-out' } : undefined}
        onAnimationEnd={() => setPopping(false)}
      >
        ♥
      </span>{' '}
      {optimisticCount > 0 ? optimisticCount : ''} {compact ? '' : 'Like'}
    </button>
  )
}
