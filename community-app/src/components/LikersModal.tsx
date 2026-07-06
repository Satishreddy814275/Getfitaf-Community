'use client'

import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import type { Profile } from '@/types'

// Shared "who liked this" popup for both posts and comments — either
// one is really just a list of {user_id, profiles}, so one component
// covers both call sites. Fades and scales in/out the same way the
// post-detail overlay does, for consistency; owns its own close
// animation internally (onClose only actually fires once the fade-out
// transition finishes, not the instant you click away).
export default function LikersModal({
  likers,
  onClose,
}: {
  likers: { user_id: string; profiles?: Profile | null }[]
  onClose: () => void
}) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  function handleClose() {
    setEntered(false)
  }

  return (
    <div
      className={
        'fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 transition-opacity duration-200' +
        (entered ? ' opacity-100' : ' opacity-0')
      }
      onClick={handleClose}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'opacity' && !entered) onClose()
      }}
    >
      <div
        className={
          'glass rounded-2xl w-full max-w-xs max-h-96 overflow-y-auto transition-all duration-200 ease-out' +
          (entered ? ' opacity-100 scale-100' : ' opacity-0 scale-95')
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-[#0a0a0a]/95">
          <p className="text-sm font-semibold text-white">
            {likers.length} {likers.length === 1 ? 'like' : 'likes'}
          </p>
          <button onClick={handleClose} className="text-zinc-500 hover:text-white transition">
            ✕
          </button>
        </div>
        <div className="divide-y divide-zinc-800">
          {likers.map((l) => (
            <div key={l.user_id} className="flex items-center gap-2.5 px-4 py-2.5">
              <Avatar avatarUrl={l.profiles?.avatar_url} name={l.profiles?.full_name} size={32} />
              <p className="text-sm text-zinc-200">{l.profiles?.full_name || 'Member'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
