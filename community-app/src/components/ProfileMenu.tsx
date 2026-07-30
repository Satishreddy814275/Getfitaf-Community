'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Avatar from './Avatar'
import { signOut } from '@/app/login/actions'

// Everything that used to be loose text links in the top nav (Choose
// Your Program, Guidelines, Edit Profile, Admin, Sign out) now lives
// here instead - mirrors what the mobile "More" sheet already treats
// as secondary, just as a dropdown instead of a bottom sheet. Same
// outside-click-to-close pattern as NotificationBell.
export default function ProfileMenu({
  fullName,
  avatarUrl,
  isAdmin,
  showPrograms,
}: {
  fullName: string | null
  avatarUrl: string | null
  isAdmin: boolean
  showPrograms: boolean
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded-full hover:opacity-80 transition"
        aria-label="Account menu"
      >
        <Avatar avatarUrl={avatarUrl} name={fullName} size={28} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 glass-menu rounded-xl shadow-xl z-50 overflow-hidden">
          {fullName && (
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-sm font-semibold text-white truncate">{fullName}</p>
            </div>
          )}
          <div className="py-1">
            {showPrograms && (
              <Link
                href="/programs"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition"
              >
                Choose Your Program
              </Link>
            )}
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition"
            >
              Help
            </Link>
            <Link
              href="/guidelines"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition"
            >
              Guidelines
            </Link>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition"
            >
              Edit Profile
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition"
              >
                Admin
              </Link>
            )}
          </div>
          <form action={signOut} className="border-t border-zinc-800">
            <button className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
