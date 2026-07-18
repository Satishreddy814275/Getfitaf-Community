'use client'

import { useEffect, useState } from 'react'

// Registers the service worker (public/sw.js) and surfaces a small
// "update available" prompt when a new version has finished installing
// but is deliberately sitting in the waiting state (see sw.js's install
// handler - it never calls skipWaiting on its own) - updates only take
// effect once someone taps Refresh here, so the app never silently
// swaps itself out from under someone mid-workout. Renders nothing
// until there's actually an update to offer.
export default function ServiceWorkerRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(registration.waiting)
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          // navigator.serviceWorker.controller is only set once a worker
          // has already taken control once before - its absence means
          // this is the very first install (nothing to "update" from),
          // not a real update.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(installing)
          }
        })
      })
    })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!waitingWorker) return null

  return (
    <div className="fixed bottom-20 sm:bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-[#111111] border border-orange-500/30 rounded-xl px-4 py-3 shadow-xl">
        <p className="text-sm text-white">A new version is ready.</p>
        <button
          onClick={() => waitingWorker.postMessage({ type: 'SKIP_WAITING' })}
          className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
