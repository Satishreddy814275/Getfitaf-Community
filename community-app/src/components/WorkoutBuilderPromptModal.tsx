'use client'

import { useEffect, useState } from 'react'
import ExternalNavLink from './ExternalNavLink'

// Nags-until-built popup for low-ticket members who haven't built a
// workout yet. Rendered centered over the feed on load. The real gate
// is server-side (this only ever renders while hasBuiltWorkout is
// false), so once someone actually builds a plan, it stops appearing
// permanently on its own — nothing here needs to track that.
//
// Dismissing (X, "Maybe later", or clicking through) only snoozes it
// for the rest of today — it reappears on the next calendar day if
// they still haven't built a workout by then. That's intentionally
// more persistent than a "seen once, gone forever" popup: the goal is
// to actually get people to use the feature, not just to be polite
// about asking once. "Build My Workout" in the top nav is always
// present regardless of this popup's state either way.
export default function WorkoutBuilderPromptModal({
  href,
  storageKey,
}: {
  href: string
  storageKey: string
}) {
  // Two separate flags on purpose. `mounted` controls whether this is
  // in the DOM at all; `visible` controls the transition's end state.
  // Mounting first at opacity-0/scale-95, then flipping to visible a
  // frame later, is what makes the browser actually animate the
  // entrance instead of just popping straight into place. Same idea in
  // reverse for dismissal — flip visible off, then only unmount once
  // the fade/scale-out transition has had time to finish.
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Stored value is a calendar-day string (e.g. "Sun Jul 12 2026"),
    // not a boolean — snoozed only through the end of that local day.
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
    setTimeout(() => setMounted(false), 200)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`relative w-full max-w-sm rounded-2xl border border-orange-500/30 bg-[#111111] p-6 text-center shadow-xl transition-all duration-200 ease-out ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
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
