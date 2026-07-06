'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { markNotificationsRead } from '@/app/feed/actions'
import Avatar from './Avatar'
import type { Notification, NotificationType } from '@/types'

const LABELS: Record<NotificationType, string> = {
  post_like: 'liked your post',
  post_comment: 'commented on your post',
  comment_reply: 'replied to your comment',
  comment_like: 'liked your comment',
}

export default function NotificationBell({
  initialNotifications,
}: {
  initialNotifications: Notification[]
}) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  // Close on outside click — standard dropdown behavior.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleOpen() {
    const wasOpen = open
    setOpen(!wasOpen)
    if (!wasOpen && unreadCount > 0) {
      // Mark read the moment the panel opens, not on a later action —
      // matches how most apps treat "seen" vs "clicked." Optimistic
      // locally; the server call runs in the background.
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      await markNotificationsRead()
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* inline-flex + items-center centers the SVG within the
          button's own box — without it, an inline SVG aligns to the
          text baseline like an image would, which sits a few px
          higher than the flex-centered text links next to it. */}
      <button
        type="button"
        onClick={handleOpen}
        className={
          unreadCount > 0
            ? 'relative inline-flex items-center text-orange-500 hover:text-orange-400 transition'
            : 'relative inline-flex items-center text-zinc-400 hover:text-white transition'
        }
        aria-label="Notifications"
      >
        {/* Real bell icon rather than the 🔔 emoji, which renders as a
            cartoonish yellow bell on most platforms and clashes with
            the dark/orange theme — this one inherits color via
            currentColor from the button classes above. */}
        <svg
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="currentColor"
          className="relative top-[4px]"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto glass rounded-xl shadow-xl z-50">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-white">Notifications</p>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8 px-4">No notifications yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={
                    n.comment_id
                      ? `/feed?post=${n.post_id}&comment=${n.comment_id}`
                      : `/feed?post=${n.post_id}`
                  }
                  onClick={() => setOpen(false)}
                  className={
                    n.read
                      ? 'flex items-start gap-2.5 px-4 py-3 hover:bg-zinc-800/50 transition'
                      : 'flex items-start gap-2.5 px-4 py-3 bg-orange-500/5 hover:bg-orange-500/10 transition'
                  }
                >
                  <Avatar avatarUrl={n.actor?.avatar_url} name={n.actor?.full_name} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">
                      <span className="font-semibold text-white">
                        {n.actor?.full_name || 'Someone'}
                      </span>{' '}
                      {LABELS[n.type]}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
