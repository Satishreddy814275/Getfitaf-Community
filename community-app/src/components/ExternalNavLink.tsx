'use client'

import { useState } from 'react'

// For links that leave this app entirely (a different subdomain) —
// Next.js's automatic loading.tsx skeletons only cover navigation
// within this app, so a cross-site jump like "Go to your lessons"
// would otherwise show nothing at all while the browser fetches the
// other site. This shows a full-screen overlay the instant it's
// clicked, filling that gap until the browser actually replaces the
// page with the destination.
export default function ExternalNavLink({
  href,
  className,
  loadingLabel,
  children,
}: {
  href: string
  className?: string
  loadingLabel: string
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(false)

  return (
    <>
      <a
        href={href}
        className={className}
        onClick={(e) => {
          // Skip modified clicks (cmd/ctrl/shift-click, middle-click) —
          // those open a new tab and don't leave this page at all, so
          // showing a full-screen overlay here would be wrong.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return

          // Take over navigation ourselves instead of letting the
          // browser's default anchor click handle it. Without this,
          // the browser can start unloading the page immediately after
          // this handler returns — potentially before React's state
          // update ever gets painted, so the overlay would silently
          // lose that race and never actually appear. Two nested
          // requestAnimationFrame calls is the standard way to
          // guarantee at least one full frame has rendered before
          // continuing, which is what actually makes the overlay
          // visible before we navigate away.
          e.preventDefault()
          setLoading(true)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.location.href = href
            })
          })
        }}
      >
        {children}
      </a>
      {loading && (
        <div className="fixed inset-0 bg-[#0a0a0a] z-[100] flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-zinc-700 border-t-orange-500 animate-spin" />
          <p className="text-sm text-zinc-400">{loadingLabel}</p>
        </div>
      )}
    </>
  )
}
