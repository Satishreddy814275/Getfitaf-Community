'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Shown once ever, not once a day - boolean localStorage flag, same
// pattern as RulesGate's own acknowledgment flag, not the calendar-day
// string InstallAppBanner/PushNotificationsBanner use. A RulesGate
// child (see feed/page.tsx), so it only ever appears after the
// guidelines modal, matching help-page-draft.md's "shown once, after
// the rules modal" spec exactly. Dismissing just moves on to the app -
// /help stays reachable from the nav (ProfileMenu) any time after.
export default function HelpBanner({ storageKey }: { storageKey: string }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) === 'true') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
  }, [storageKey])

  if (!mounted) return null

  const dismiss = () => {
    window.localStorage.setItem(storageKey, 'true')
    setVisible(false)
    setTimeout(() => setMounted(false), 250)
  }

  return (
    <div
      className={`glass rounded-2xl p-4 mb-4 transition-all duration-[250ms] ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
          <span className="text-lg leading-none">👋</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">New here? Here&apos;s how everything works.</p>
          <p className="text-xs text-zinc-400 mt-1">
            A quick guide to your daily rhythm and every part of the app.
          </p>
          <div className="flex items-center gap-4 mt-2.5">
            <Link
              href="/help"
              onClick={dismiss}
              className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition"
            >
              Show me around
            </Link>
            <button onClick={dismiss} className="text-sm text-zinc-500 hover:text-zinc-300 transition">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
