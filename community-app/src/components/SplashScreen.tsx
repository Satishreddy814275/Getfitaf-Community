'use client'

import { useEffect, useState } from 'react'

// Only meaningful once someone's actually installed the PWA to their
// home screen - a regular browser tab already has its own address bar
// visible while it loads, so overlaying a second loading state there
// would just be redundant. Standalone-mode detection covers both
// Android/desktop (the display-mode media query) and iOS Safari
// (navigator.standalone, which only Safari exposes - not in the
// standard lib.dom types, hence the cast).
function isStandalone() {
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

// Worth being upfront about what this does and doesn't cover: the very
// first instant after tapping the home-screen icon - before any of our
// HTML has even started loading - is controlled by the OS, not by
// anything in this component. Android already handles that moment
// automatically from the manifest's icon + background_color. iOS
// doesn't, and properly fixing that there means generating a launch
// image for every individual device screen size, which isn't worth the
// upkeep for what it'd buy. What this component covers instead is the
// moment right after our page's first paint - hydration finishing,
// data settling in - so that gap reads as one branded beat instead of
// the raw page just popping in.
export default function SplashScreen() {
  const [show, setShow] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!isStandalone()) return
    // Reading display-mode/navigator.standalone (browser-only APIs) has
    // to happen post-mount, not via a lazy useState initializer, or the
    // client's first render would disagree with the server-rendered
    // markup and React would throw a hydration-mismatch error. Same
    // precedent as WorkoutBuilderPromptModal's entrance effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true)
    // Minimum display time so a fast load doesn't just flash the mark
    // for a single frame - short enough to never feel like an
    // artificial delay if the page is slow instead.
    const fadeTimer = setTimeout(() => setFading(true), 450)
    const removeTimer = setTimeout(() => setShow(false), 750)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [])

  if (!show) return null

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a] transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`w-16 h-16 text-orange-500 transition-transform duration-300 ${
          fading ? 'scale-110' : 'scale-100'
        }`}
      >
        <path d="M16.2 10.7L16.8 8.3C16.9 8 17.3 6.6 16.5 5.4C15.9 4.5 14.7 4 13 4H11C9.3 4 8.1 4.5 7.5 5.4C6.7 6.6 7.1 7.9 7.2 8.3L7.8 10.7C6.7 11.8 6 13.3 6 15C6 17.1 7.1 18.9 8.7 20H15.3C16.9 18.9 18 17.1 18 15C18 13.3 17.3 11.8 16.2 10.7M9.6 9.5L9.1 7.8V7.7C9.1 7.7 8.9 7 9.2 6.6C9.4 6.2 10 6 11 6H13C13.9 6 14.6 6.2 14.9 6.5C15.2 6.9 15 7.6 15 7.6L14.5 9.5C13.7 9.2 12.9 9 12 9C11.1 9 10.3 9.2 9.6 9.5Z" />
      </svg>
    </div>
  )
}
