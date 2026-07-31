'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Step = { target: string; title: string; body: string; cta?: string; href?: string }

// Steps are matched against live data-tour="..." elements at start
// time, not computed server-side - deliberately, since it's the
// simplest single mechanism that handles two different problems at
// once: (1) someone who's already picked a program shouldn't see the
// "choose your program" stop, and (2) desktop and mobile tag
// completely different elements for the same stop (e.g. the avatar
// dropdown on desktop vs. the "More" bottom-sheet button on mobile) -
// as long as both carry the same data-tour value, one static step list
// works everywhere without the caller having to compute anything.
const STEPS: Step[] = [
  {
    target: 'lessons',
    title: 'Your daily lessons',
    body: "Bite-sized lessons on training and nutrition, a few minutes each - worth going through at your own pace.",
  },
  {
    target: 'workouts',
    title: 'Your workouts',
    body: "Once you've picked a program, today's session lives here - log your sets and get rolling.",
  },
  {
    target: 'avatar-menu',
    title: 'Everything else',
    body: 'Guidelines, help, your profile, and more all live here.',
  },
  {
    target: 'program',
    title: 'Choose your program',
    body: "Last stop - pick the program that fits your goals and equipment to unlock your workouts.",
    cta: 'Choose Your Program',
    href: '/programs',
  },
]

// Once-ever tour of the feed page, auto-starting right after Community
// Guidelines are acknowledged (see RulesGate in feed/page.tsx) -
// replaces what used to be a separate "choose your program" popup plus
// a separate "read the help page" banner showing up in the same
// breath. This ends by pointing at the program picker instead, so
// picking a program becomes the tour's natural last step rather than a
// second interruption stacked right behind it. forceStart (via
// /feed?tour=1, see the "Take the tour" link on /help) re-runs it on
// demand regardless of the seen flag, for anyone who dismissed it the
// first time or just wants to look again.
export default function Tour({
  storageKey,
  forceStart,
}: {
  storageKey: string
  forceStart: boolean
}) {
  const router = useRouter()
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const seen = window.localStorage.getItem(storageKey) === 'true'
    if (!forceStart && seen) return
    const applicable = STEPS.filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
    if (applicable.length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSteps(applicable)
    setIndex(0)
  }, [storageKey, forceStart])

  // Re-measures on every step change (and window resize) - scrolling
  // the target into view first since some stops (the program card
  // especially, on a short viewport) can start off-screen. The short
  // delay before reading getBoundingClientRect gives the smooth scroll
  // time to mostly settle, same reasoning as the workout celebration
  // modal's entrance-effect delay elsewhere in this app - measuring
  // mid-scroll would spotlight the wrong position. Kept as one effect
  // (rather than a useCallback other effects call into) so the actual
  // setRect calls only ever happen inside a timeout/event callback,
  // never synchronously in the effect body itself.
  useEffect(() => {
    if (!steps) return
    const el = document.querySelector(`[data-tour="${steps[index].target}"]`)
    if (!el) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const doMeasure = () => setRect(el.getBoundingClientRect())
    const id = setTimeout(doMeasure, 300)
    window.addEventListener('resize', doMeasure)
    return () => {
      clearTimeout(id)
      window.removeEventListener('resize', doMeasure)
    }
  }, [steps, index])

  if (!steps) return null

  const finish = () => {
    window.localStorage.setItem(storageKey, 'true')
    setSteps(null)
    // Only clears the ?tour=1 query param - forceStart came from a
    // deliberate link, not something that should linger in the URL
    // once the tour it triggered is done.
    if (forceStart) router.replace('/feed')
  }

  const step = steps[index]
  const isLast = index === steps.length - 1
  const pad = 8

  return (
    <div className="fixed inset-0 z-[60]">
      {rect && (
        <div
          className="fixed rounded-2xl border-2 border-orange-500 pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
          }}
        />
      )}

      <div
        className="fixed z-[61] w-[calc(100%-2rem)] max-w-xs bg-[#111111] border border-zinc-700 rounded-2xl p-4 shadow-xl transition-all duration-300 ease-out"
        style={
          rect
            ? {
                top: Math.min(rect.bottom + pad + 12, window.innerHeight - 200),
                left: Math.max(16, Math.min(rect.left, window.innerWidth - 320 - 16)),
              }
            : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
        }
      >
        <p className="text-xs text-zinc-500 mb-1">
          {index + 1} of {steps.length}
        </p>
        <p className="text-white text-sm font-semibold mb-1">{step.title}</p>
        <p className="text-zinc-400 text-xs leading-relaxed mb-3">{step.body}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs text-zinc-500 hover:text-zinc-300 transition">
            Skip
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={() => setIndex((i) => i - 1)}
                className="text-xs text-zinc-400 hover:text-white transition px-2 py-1.5"
              >
                Back
              </button>
            )}
            {isLast ? (
              step.href ? (
                <Link
                  href={step.href}
                  onClick={finish}
                  className="text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-black px-3 py-1.5 rounded-lg transition"
                >
                  {step.cta}
                </Link>
              ) : (
                <button
                  onClick={finish}
                  className="text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-black px-3 py-1.5 rounded-lg transition"
                >
                  Got it
                </button>
              )
            ) : (
              <button
                onClick={() => setIndex((i) => i + 1)}
                className="text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-black px-3 py-1.5 rounded-lg transition"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
