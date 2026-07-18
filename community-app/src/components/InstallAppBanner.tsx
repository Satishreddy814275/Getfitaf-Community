'use client'

import { useEffect, useState } from 'react'
import { isIOS, isStandalone, type BeforeInstallPromptEvent } from '@/lib/pwa'

// Dismissible feed banner nudging people to install the PWA. Same
// snooze mechanism as WorkoutBuilderPromptModal - storageKey holds a
// calendar-day string, not a boolean, so dismissing only quiets it
// through the end of that local day, not forever.
//
// mounted/visible are only set once there's actually something to show
// (see reveal() below), not immediately on mount - Android/Chrome's
// beforeinstallprompt event can take a moment to fire (or may not fire
// at all in a given session), and a banner whose Install button has
// nothing to do yet would be worse than no banner. iOS never fires that
// event at all, so it reveals immediately with manual instructions
// instead of a button.
export default function InstallAppBanner({ storageKey }: { storageKey: string }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [ios, setIos] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return
    if (window.localStorage.getItem(storageKey) === new Date().toDateString()) return

    function reveal() {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    }

    if (isIOS()) {
      // Reading the platform (a browser-only check) has to happen
      // post-mount, not via a lazy initializer, or the client's first
      // render would disagree with the server-rendered markup - same
      // hydration-mismatch reasoning as isStandalone() elsewhere.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIos(true)
      reveal()
      return
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      reveal()
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [storageKey])

  if (!mounted) return null

  const dismiss = () => {
    window.localStorage.setItem(storageKey, new Date().toDateString())
    setVisible(false)
    setTimeout(() => setMounted(false), 250)
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') dismiss()
  }

  return (
    <div
      className={`glass rounded-2xl p-4 mb-4 transition-all duration-[250ms] ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="#0a0a0a" className="w-5 h-5" aria-hidden="true">
            <path d="M16.2 10.7L16.8 8.3C16.9 8 17.3 6.6 16.5 5.4C15.9 4.5 14.7 4 13 4H11C9.3 4 8.1 4.5 7.5 5.4C6.7 6.6 7.1 7.9 7.2 8.3L7.8 10.7C6.7 11.8 6 13.3 6 15C6 17.1 7.1 18.9 8.7 20H15.3C16.9 18.9 18 17.1 18 15C18 13.3 17.3 11.8 16.2 10.7M9.6 9.5L9.1 7.8V7.7C9.1 7.7 8.9 7 9.2 6.6C9.4 6.2 10 6 11 6H13C13.9 6 14.6 6.2 14.9 6.5C15.2 6.9 15 7.6 15 7.6L14.5 9.5C13.7 9.2 12.9 9 12 9C11.1 9 10.3 9.2 9.6 9.5Z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Add GetFit AF to your home screen</p>
          {ios ? (
            <p className="text-xs text-zinc-400 mt-1">
              Tap <span className="text-zinc-300 font-medium">Share</span>, then{' '}
              <span className="text-zinc-300 font-medium">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="text-xs text-zinc-400 mt-1">Quicker access, no browser bar, works like an app.</p>
          )}
          <div className="flex items-center gap-4 mt-2.5">
            {!ios && (
              <button
                onClick={handleInstall}
                className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition"
              >
                Install
              </button>
            )}
            <button onClick={dismiss} className="text-sm text-zinc-500 hover:text-zinc-300 transition">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
