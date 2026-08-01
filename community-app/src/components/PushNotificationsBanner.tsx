'use client'

import { useEffect, useState } from 'react'
import { getExistingSubscription, pushSupported, subscribeToPush } from '@/lib/push-client'
import { savePushSubscription } from '@/app/profile/actions'

// Same snooze mechanism as InstallAppBanner right above this on the
// feed - storageKey holds a calendar-day string, so dismissing only
// quiets it through the end of that local day, not forever. Hides
// entirely (never mounts) once already subscribed, blocked, or
// unsupported (e.g. iOS before being added to the home screen) -
// same "worse than no banner" reasoning as InstallAppRow for a prompt
// with nothing useful to do.
export default function PushNotificationsBanner({ storageKey }: { storageKey: string }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    async function check() {
      if (!pushSupported()) return
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return
      if (window.localStorage.getItem(storageKey) === new Date().toDateString()) return
      const existing = await getExistingSubscription()
      if (existing) return

      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    }
    check()
  }, [storageKey])

  if (!mounted) return null

  const dismiss = () => {
    window.localStorage.setItem(storageKey, new Date().toDateString())
    setVisible(false)
    setTimeout(() => setMounted(false), 250)
  }

  async function handleEnable() {
    setWorking(true)
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      setWorking(false)
      return
    }
    // Same fix as PushNotificationsRow (2026-08-01) - this whole chain
    // was unwrapped, so any rejection (most likely pushManager.subscribe
    // failing) left `working` stuck true forever with the button showing
    // "Enabling..." indefinitely. On failure this now just resets
    // `working` without dismissing, so the banner stays put and they can
    // hit Enable again instead of being silently stuck.
    try {
      const sub = await subscribeToPush(vapidKey)
      if (!sub) {
        setWorking(false)
        dismiss()
        return
      }
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      await savePushSubscription({ endpoint: json.endpoint, keys: json.keys })
      dismiss()
    } catch (err) {
      console.error('push: failed to enable notifications', err)
      setWorking(false)
    }
  }

  return (
    <div
      className={`glass rounded-2xl p-4 mb-4 transition-all duration-[250ms] ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Turn on notifications</p>
          <p className="text-xs text-zinc-400 mt-1">
            A nudge when today&apos;s lesson is ready, or if it&apos;s been a few days since your last workout.
          </p>
          <div className="flex items-center gap-4 mt-2.5">
            <button
              onClick={handleEnable}
              disabled={working}
              className="text-sm font-semibold text-orange-400 hover:text-orange-300 disabled:opacity-50 transition"
            >
              {working ? 'Enabling...' : 'Enable'}
            </button>
            <button onClick={dismiss} className="text-sm text-zinc-500 hover:text-zinc-300 transition">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
