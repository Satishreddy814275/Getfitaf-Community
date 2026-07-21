'use client'

import { useEffect, useState } from 'react'

// Slim floating CTA bar so someone convinced halfway down a long page
// doesn't have to scroll all the way back up (or down) to act. Stays
// out of the way until scrolled past the hero - appearing immediately
// would just duplicate the top CTA card. Pre-launch, it jumps to the
// real waitlist form (#waitlist-top) rather than embedding a second
// email field - one form, one place to type, no risk of someone
// filling in one copy and not the other.
export default function BetaStickyCTA({ isLive }: { isLive: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 560)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto">
        <div className="bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-2xl shadow-lg shadow-black/40 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-white text-xs font-medium">
            {isLive ? '50 spots - first come, first served' : '50 spots at ₹249 your first month'}
          </p>
          {isLive ? (
            <a
              href="/api/beta-checkout"
              className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 px-4 rounded-lg transition whitespace-nowrap"
            >
              Reserve your spot
            </a>
          ) : (
            <a
              href="#waitlist-top"
              className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 px-4 rounded-lg transition whitespace-nowrap"
            >
              Join the waitlist
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
