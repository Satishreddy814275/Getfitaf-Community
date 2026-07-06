'use client'

import { useState } from 'react'
import LikersModal from './LikersModal'
import type { Like } from '@/types'

function firstName(l: Like): string {
  return l.profiles?.full_name?.split(' ')[0] || 'Someone'
}

// Facebook-style "so-and-so and 3 others liked this" line, deliberately
// separate from the Like button itself (below in PostCard) — this is
// purely informational and only ever opens the full list, so it must
// never double as a way to accidentally toggle your own like.
export default function LikeSummary({
  likes,
  currentUserId,
}: {
  likes: Like[]
  currentUserId: string
}) {
  const [showModal, setShowModal] = useState(false)

  if (likes.length === 0) return null

  const iLiked = likes.some((l) => l.user_id === currentUserId)
  const others = likes.filter((l) => l.user_id !== currentUserId)

  // Leads with "You" if you're one of the likers, same as Facebook —
  // otherwise names the first liker and counts the rest.
  let text: string
  if (iLiked) {
    text =
      others.length === 0
        ? 'You liked this'
        : others.length === 1
          ? `You and ${firstName(others[0])} liked this`
          : `You and ${others.length} others liked this`
  } else {
    text =
      likes.length === 1
        ? `${firstName(likes[0])} liked this`
        : likes.length === 2
          ? `${firstName(likes[0])} and ${firstName(likes[1])} liked this`
          : `${firstName(likes[0])} and ${likes.length - 1} others liked this`
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 hover:underline transition mb-2"
      >
        ♥ {text}
      </button>
      {showModal && <LikersModal likers={likes} onClose={() => setShowModal(false)} />}
    </>
  )
}
