'use client'

import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from '@/lib/pwa'
import { getExistingSubscription, pushSupported, subscribeToPush } from '@/lib/push-client'
import { savePushSubscription, removePushSubscription } from '@/app/profile/actions'

type Status = 'checking' | 'unsupported' | 'ios-not-installed' | 'denied' | 'off' | 'on' | 'working' | 'error'

// Same "check post-mount, not in a lazy initializer" reasoning as
// InstallAppRow right above this on the profile page - permission
// state and an existing subscription are both browser-only reads that
// would otherwise disagree with the server-rendered markup on first
// paint.
export default function PushNotificationsRow() {
  const [status, setStatus] = useState<Status>('checking')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

  useEffect(() => {
    async function check() {
      if (!pushSupported()) {
        // iOS Safari only exposes the Push API once the app is actually
        // installed to the home screen - in a regular browser tab
        // 'PushManager' in window is false there, which would otherwise
        // read as a generic "not supported" rather than the fixable
        // "install it first" case.
        setStatus(isIOS() && !isStandalone() ? 'ios-not-installed' : 'unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setStatus('denied')
        return
      }
      const existing = await getExistingSubscription()
      setSubscription(existing)
      setStatus(existing ? 'on' : 'off')
    }
    check()
  }, [])

  async function handleEnable() {
    setStatus('working')
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      setStatus('off')
      return
    }
    // Wrapped in try/catch as of the 2026-08-01 fix - a client reported
    // the button stuck on "Enabling..." indefinitely. Root cause: none
    // of subscribeToPush's internals (Notification.requestPermission,
    // pushManager.subscribe) or savePushSubscription were ever wrapped,
    // so a rejected promise anywhere in this chain (most likely
    // pushManager.subscribe throwing - bad key, browser blocking the
    // push service, a network hiccup) left status stuck on 'working'
    // forever with nothing to reset it. Now any failure falls through
    // to a visible, retryable error state instead of hanging silently.
    try {
      const sub = await subscribeToPush(vapidKey)
      if (!sub) {
        // Either the browser prompt was dismissed/denied, or something
        // failed - re-check permission rather than assuming which.
        setStatus(Notification.permission === 'denied' ? 'denied' : 'off')
        return
      }
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      await savePushSubscription({ endpoint: json.endpoint, keys: json.keys })
      setSubscription(sub)
      setStatus('on')
    } catch (err) {
      console.error('push: failed to enable notifications', err)
      setStatus('error')
    }
  }

  async function handleDisable() {
    if (!subscription) return
    setStatus('working')
    try {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await removePushSubscription(endpoint)
      setSubscription(null)
      setStatus('off')
    } catch (err) {
      console.error('push: failed to disable notifications', err)
      setStatus('error')
    }
  }

  if (status === 'checking' || status === 'unsupported') return null

  return (
    <div className="glass rounded-2xl p-5 mt-4">
      <p className="text-sm font-semibold text-white mb-2">Push notifications</p>

      {status === 'ios-not-installed' && (
        <p className="text-xs text-zinc-400">
          Install the app first (see above) - iPhone only supports push notifications once GetFit AF is
          added to your home screen.
        </p>
      )}

      {status === 'denied' && (
        <p className="text-xs text-zinc-400">
          Blocked in your browser. To turn these on, allow notifications for this site in your
          browser&apos;s settings, then reload this page.
        </p>
      )}

      {(status === 'off' || status === 'working' || status === 'error') && (
        <>
          <p className="text-xs text-zinc-400 mb-3">
            Get a reminder when today&apos;s lesson is ready, or if it&apos;s been a few days since your last
            workout.
          </p>
          {status === 'error' && (
            <p className="text-xs text-red-400 mb-3">Something went wrong turning these on. Try again.</p>
          )}
          <button
            onClick={handleEnable}
            disabled={status === 'working'}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
          >
            {status === 'working' ? 'Enabling...' : 'Enable notifications'}
          </button>
        </>
      )}

      {status === 'on' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-green-400 font-medium">Enabled ✓</p>
          <button
            onClick={handleDisable}
            className="text-xs font-medium text-zinc-500 hover:text-white transition border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg"
          >
            Turn off
          </button>
        </div>
      )}
    </div>
  )
}
