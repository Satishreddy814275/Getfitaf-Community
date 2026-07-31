'use client'

import { useEffect, useRef } from 'react'

// Thin fill-as-you-scroll bar fixed to the top of the viewport - same
// pure scroll math as the old learn.getfitaf.fitness
// reading-progress.js, just as a React effect instead of a
// self-invoking script tag.
export default function ReadingProgressBar() {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function update() {
      const doc = document.documentElement
      const scrollTop = window.scrollY || doc.scrollTop
      const scrollable = (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight
      const pct = scrollable > 0 ? Math.min(100, (scrollTop / scrollable) * 100) : 0
      if (barRef.current) barRef.current.style.width = pct + '%'
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 h-[3px] z-[200]"
      style={{ width: '0%', background: '#e8552e', transition: 'width .1s linear' }}
    />
  )
}
