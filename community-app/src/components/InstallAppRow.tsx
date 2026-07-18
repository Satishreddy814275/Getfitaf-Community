'use client'

import { useEffect, useState } from 'react'
import { isIOS, isStandalone, type BeforeInstallPromptEvent } from '@/lib/pwa'

// Permanent, non-dismissible counterpart to InstallAppBanner on the
// feed - for anyone who snoozed that banner but wants to install
// later, since Android/Chrome's install prompt event is a one-time-per-
// session kind of thing and won't necessarily fire again on a later
// visit. Renders nothing once already installed - there's nothing left
// to offer at that point.
export default function InstallAppRow() {
  // Bundled into one state object (rather than three separate useState
  // calls) so the client-only checks below only need one
  // set-state-in-effect suppression instead of three.
  const [state, setState] = useState({ ready: false, standalone: false, ios: false })
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Reading display-mode/platform (browser-only checks) has to happen
    // post-mount, not via a lazy initializer, or the client's first
    // render would disagree with the server-rendered markup - same
    // hydration-mismatch reasoning as everywhere else this pattern
    // shows up in this app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ ready: true, standalone: isStandalone(), ios: isIOS() })

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  if (!state.ready || state.standalone) return null

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
  }

  // Note on the heading below: there's no reliable, cross-browser way
  // to detect "already installed but currently viewing in a regular
  // browser tab" - the standalone check above only catches "currently
  // running as the installed app," which is a different thing. Someone
  // who installed the app and later opens this page in a normal
  // browser tab (not the home-screen icon) would otherwise see this
  // row every time as if they'd never installed. The "(if you haven't
  // already)" qualifier is the honest fix - Satish's call - rather
  // than a detection heuristic that would be wrong often enough to be
  // more confusing than the caveat itself.
  return (
    <div className="glass rounded-2xl p-5 mt-4">
      <p className="text-sm font-semibold text-white mb-2">Install app (if you haven&apos;t already)</p>
      {state.ios ? (
        <p className="text-xs text-zinc-400">
          Tap <span className="text-zinc-300 font-medium">Share</span>, then{' '}
          <span className="text-zinc-300 font-medium">Add to Home Screen</span> to install GetFit AF.
        </p>
      ) : deferredPrompt ? (
        <>
          <p className="text-xs text-zinc-400 mb-3">Quicker access, no browser bar, works like an app.</p>
          <button
            onClick={handleInstall}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition"
          >
            Install
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-zinc-400">
            Look for &quot;Install app&quot; or &quot;Add to Home Screen&quot; in your browser&apos;s menu.
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            Already installed? You can ignore this - it shows here because this page doesn&apos;t know
            whether the app is on your home screen unless you&apos;re currently using it from there.
          </p>
        </>
      )}
    </div>
  )
}
