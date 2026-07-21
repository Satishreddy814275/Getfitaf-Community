'use client'

import { useSyncExternalStore } from 'react'

// Ticking days/hours/minutes countdown to launch, shown in the
// pre-launch CTA card alongside the static "Opens Aug 1" line - a
// moving countdown reads as more urgent than a fixed date, especially
// for something someone might bookmark and forget about. Client-only
// (needs the clock); computes off launchAt passed down from the
// server component so there's one source of truth for the launch
// moment (see LAUNCH_AT in beta/page.tsx).
//
// Uses useSyncExternalStore instead of a setState-in-effect tick loop:
// the server snapshot is null (nothing rendered), the client snapshot
// is the real clock, and the subscription re-renders every 60s - no
// synchronous setState inside an effect, and no hydration mismatch.
function subscribe(callback: () => void) {
  const id = setInterval(callback, 60_000)
  return () => clearInterval(id)
}

function getSnapshot() {
  return Date.now()
}

function getServerSnapshot() {
  return null
}

export default function BetaCountdown({ launchAt }: { launchAt: number }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (now === null) return null

  const remainingMs = Math.max(0, launchAt - now)
  const totalMinutes = Math.floor(remainingMs / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  if (remainingMs === 0) return null

  return (
    <p className="text-zinc-400 text-xs mt-2 text-center tabular-nums">
      <span className="text-orange-400 font-semibold">
        {days}d {hours}h {minutes}m
      </span>{' '}
      until doors open
    </p>
  )
}
