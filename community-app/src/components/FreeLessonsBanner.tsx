'use client'

import { useEffect, useState } from 'react'

// Must match LessonPreviewCapture's BANNER_DISMISS_KEY - not shared
// via an import since both are small standalone client components and
// the codebase's own pattern (see PushNotificationsBanner) is a plain
// string literal per component rather than a shared constants file.
const STORAGE_KEY = 'gfa-free-lessons-banner-dismissed'
const SCROLL_THRESHOLD = 0.6
const TIME_THRESHOLD_MS = 25_000

// Soft, dismissible nudge for the free 7-lesson offer - deliberately
// NOT a modal (see 2026-08-01 conversation: exit-intent doesn't work
// on mobile, which is most of this traffic, and a hard-blocking modal
// cuts against this page's whole "upfront, not pushy" tone). Surfaces
// once someone's shown real hesitation - scrolled most of the way down
// OR spent a while on the page without clicking Join now - not
// immediately on load. Dismissing hides it for the rest of the
// calendar day (same snooze pattern as PushNotificationsBanner), and
// it re-checks the same flag right before showing (not just on mount)
// so submitting via the LessonPreviewCapture card first - which sets
// this same key - suppresses it even if the scroll/time trigger fires
// afterward in the same visit.
export default function FreeLessonsBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === new Date().toDateString()) return

    let shown = false
    function maybeShow() {
      if (shown) return
      if (window.localStorage.getItem(STORAGE_KEY) === new Date().toDateString()) return
      shown = true
      setVisible(true)
    }

    function onScroll() {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - doc.clientHeight
      const pct = scrollable > 0 ? window.scrollY / scrollable : 0
      if (pct >= SCROLL_THRESHOLD) maybeShow()
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    const timer = setTimeout(maybeShow, TIME_THRESHOLD_MS)

    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, new Date().toDateString())
    setVisible(false)
  }

  if (!visible) return null

  return (
    // BetaStickyCTA (isLive's "Join now" bar) is also fixed bottom-0 and
    // visible at the same time this can appear - bottom-[84px] instead
    // of 0 stacks this one above it instead of directly overlapping.
    <div className="fixed bottom-[84px] inset-x-0 z-30 px-4 pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto">
        <div className="bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-2xl shadow-lg shadow-black/40 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold">Not ready to commit?</p>
            <p className="text-zinc-400 text-[11px] mt-0.5">
              Get the first 7 lessons free, no payment needed.
            </p>
          </div>
          <a
            href="#free-lessons"
            className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition whitespace-nowrap"
          >
            Get free lessons
          </a>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-zinc-500 hover:text-white transition text-sm px-1"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
