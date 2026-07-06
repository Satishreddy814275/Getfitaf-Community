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
          setLoading(true)
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
