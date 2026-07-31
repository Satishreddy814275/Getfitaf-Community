'use client'

import { useEffect, useRef, useState } from 'react'
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

// Desktop and mobile both tag their own element with the same
// data-tour value (see AppNav.tsx) - the two never coexist visually,
// but they DO both exist in the DOM at once (Tailwind's hidden/
// sm:block toggle is display:none, not a real unmount), and desktop's
// markup happens to come first in document order. A plain
// querySelector always found that hidden desktop element first,
// measuring a permanent 0x0 rect on mobile regardless of which step
// was active - this is what collapsed all three mobile steps to the
// same spot. Filtering for an actual non-zero rendered size is what
// picks whichever one the current breakpoint is really showing.
function getVisibleTarget(target: string): HTMLElement | null {
  const els = document.querySelectorAll(`[data-tour="${target}"]`)
  for (const el of els) {
    const r = (el as HTMLElement).getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el as HTMLElement
  }
  return null
}

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const pad = 8

  useEffect(() => {
    const seen = window.localStorage.getItem(storageKey) === 'true'
    if (!forceStart && seen) return
    const applicable = STEPS.filter((s) => getVisibleTarget(s.target))
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
    const el = getVisibleTarget(steps[index].target)
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

  // Decides above-vs-below (and clamps left/right) using the
  // tooltip's own actual rendered size, not a guessed constant - the
  // mobile bottom tab bar is what exposed the need for this: those
  // targets sit right at the bottom edge of the viewport, so "always
  // place the tooltip below the target, clamped to fit on screen" was
  // clamping all three of them to the exact same spot instead of
  // flipping the tooltip above the target when there's no room below.
  useEffect(() => {
    if (!rect || !tooltipRef.current) {
      setPos(null)
      return
    }
    const tw = tooltipRef.current.offsetWidth
    const th = tooltipRef.current.offsetHeight
    const gap = pad + 12
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const top =
      spaceBelow >= th + gap || spaceBelow >= spaceAbove
        ? Math.min(rect.bottom + gap, window.innerHeight - th - 16)
        : Math.max(16, rect.top - gap - th)
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - tw - 16))
    setPos({ top, left })
  }, [rect])

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

  return (
    <div className="fixed inset-0 z-[60]">
      {rect && (() => {
        // Clamped to the actual viewport on every side, not just sized
        // off the target - the mobile bottom tab bar is what exposed
        // this: those targets sit flush against the screen's bottom
        // edge, so rect.bottom + pad landed past window.innerHeight,
        // and that whole edge of the ring (plus its rounded corners)
        // rendered off-screen instead of as a clean closed box. A 4px
        // viewport margin keeps every ring fully visible and evenly
        // bordered regardless of where on screen its target sits.
        const edge = 4
        const boxTop = Math.max(edge, rect.top - pad)
        const boxLeft = Math.max(edge, rect.left - pad)
        const boxBottom = Math.min(window.innerHeight - edge, rect.bottom + pad)
        const boxRight = Math.min(window.innerWidth - edge, rect.right + pad)
        return (
          <div
            className="fixed rounded-2xl border-2 border-orange-500 pointer-events-none transition-all duration-300 ease-out"
            style={{
              top: boxTop,
              left: boxLeft,
              width: boxRight - boxLeft,
              height: boxBottom - boxTop,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
            }}
          />
        )
      })()}

      <div
        ref={tooltipRef}
        className="fixed z-[61] w-[calc(100%-2rem)] max-w-xs bg-[#111111] border border-zinc-700 rounded-2xl p-4 shadow-xl transition-all duration-300 ease-out"
        style={
          pos
            ? { top: pos.top, left: pos.left }
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
