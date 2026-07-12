'use client'

import { useEffect, useState } from 'react'
import ExternalNavLink from './ExternalNavLink'

// Once-a-day popup for low-ticket members who haven't built a workout
// yet — reappears on every calendar day (localStorage, scoped by
// storageKey passed in by the caller, storing the last-dismissed date)
// until they actually build one. WorkoutBuilderCard (rendered
// unconditionally alongside this on the feed) is what's always sitting
// there in the meantime, so dismissing the popup never leaves the
// reminder completely gone — it's just quieter for the rest of today.
//
// The exit animation (fade + scale-down + slide up) is deliberately
// styled to feel like this is retreating back up into that card at the
// top of the page, even though it's a simple CSS transition rather
// than a literal position-matched morph between the two elements.
export default function WorkoutBuilderPromptModal({
  href,
  storageKey,
}: {
  href: string
  storageKey: string
}) {
  // Two separate flags on purpose. `mounted` controls whether this is
  // in the DOM at all; `visible` controls the transition's end state.
  // Mounting first at the "hidden" transform, then flipping to visible
  // a frame later, is what makes the browser actually animate the
  // entrance instead of just popping straight into place. Same idea in
  // reverse for dismissal — flip visible off, then only unmount once
  // the transition has had time to finish.
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Stored value is a calendar-day string (e.g. "Sun Jul 12 2026"),
    // not a boolean — dismissing only snoozes it through the end of
    // that local day, not forever.
    if (window.localStorage.getItem(storageKey) === new Date().toDateString()) return
    setMounted(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
  }, [storageKey])

  if (!mounted) return null

  const dismiss = () => {
    window.localStorage.setItem(storageKey, new Date().toDateString())
    setVisible(false)
    setTimeout(() => setMounted(false), 250)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 transition-opacity duration-[250ms] ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`relative w-full max-w-sm rounded-2xl border border-orange-500/30 bg-[#111111] p-6 text-center shadow-xl transition-all duration-[250ms] ease-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 -translate-y-20'
        }`}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 text-zinc-500 hover:text-white transition text-lg leading-none"
        >
          ✕
        </button>

        <p className="text-white text-lg font-bold mb-2">Build Your Workout</p>
        <p className="text-zinc-400 text-sm mb-5">
          Answer a few quick questions about your goals and equipment, and get a full plan
          built for you in minutes.
        </p>

        <ExternalNavLink
          href={href}
          className="block w-full text-center bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-3 rounded-xl transition"
          loadingLabel="Taking you to the workout builder..."
          onClick={dismiss}
        >
          Build My Workout
        </ExternalNavLink>

        <button
          onClick={dismiss}
          className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
