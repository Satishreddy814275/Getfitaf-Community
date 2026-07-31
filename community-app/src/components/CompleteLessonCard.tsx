'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { markLessonComplete, rateLesson } from '@/app/lessons/actions'

// Ported from the old learn.getfitaf.fitness complete-lesson.js - same
// flow (upsert user_progress, confetti burst, then a centered "did you
// find this useful" star-rating + share-to-community popup), just
// wired to a server action instead of a client-side supabase upsert.
// canvas-confetti is still loaded on demand from the same CDN the old
// site used - it's a one-time load triggered only by an actual
// completion, not something that adds to every page's load like the
// esm.sh Supabase import did, so it isn't part of what the perf pass
// on the old site was trying to cut down.
declare global {
  interface Window {
    confetti?: (opts: Record<string, unknown>) => void
  }
}

function loadConfetti(): Promise<void> {
  return new Promise((resolve) => {
    if (window.confetti) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.js'
    s.onload = () => resolve()
    document.head.appendChild(s)
  })
}

export default function CompleteLessonCard({
  lessonId,
  lessonTitle,
  initialCompleted,
}: {
  lessonId: string
  lessonTitle: string
  initialCompleted: boolean
}) {
  const router = useRouter()
  const [completed, setCompleted] = useState(initialCompleted)
  const [saving, setSaving] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [alreadyPosted, setAlreadyPosted] = useState(false)
  const [picked, setPicked] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [ratingMsg, setRatingMsg] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)

  async function handleComplete() {
    if (completed || saving) return
    setSaving(true)
    try {
      const { alreadyPosted } = await markLessonComplete(lessonId)
      setAlreadyPosted(alreadyPosted)

      await loadConfetti()
      const origin = { x: 0.5, y: 0.5 }
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        origin.x = (rect.left + rect.width / 2) / window.innerWidth
        origin.y = (rect.top + rect.height / 2) / window.innerHeight
      }
      window.confetti?.({
        particleCount: 90,
        spread: 75,
        startVelocity: 35,
        origin,
        colors: ['#e8552e', '#ffb199', '#ffffff'],
      })

      setCompleted(true)
      setShowPopup(true)
    } catch {
      setSaving(false)
    }
  }

  async function handleRate(n: number) {
    setPicked(n)
    setRatingMsg('Thanks for letting us know.')
    try {
      await rateLesson(lessonId, n)
    } catch {
      setRatingMsg('Could not save your rating.')
    }
  }

  function dismissPopup() {
    setShowPopup(false)
    router.refresh()
  }

  return (
    <>
      <div className="bg-white rounded-lg p-6 sm:p-8 shadow-sm flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="text-[15px] font-bold text-[#1a1a1a] mb-1">
            {completed ? 'Great job finishing this lesson!' : "Done with today's lesson?"}
          </p>
          <p className="text-[13px] text-[#888]">
            {completed ? 'Your progress has been saved.' : 'Mark it complete so we can track your progress.'}
          </p>
        </div>
        <button
          ref={btnRef}
          onClick={handleComplete}
          disabled={completed || saving}
          className={
            completed
              ? 'bg-transparent text-green-600 text-sm font-bold whitespace-nowrap cursor-default'
              : 'bg-[#e8552e] hover:opacity-90 text-white text-sm font-bold px-6 py-3 rounded-md whitespace-nowrap transition disabled:opacity-60'
          }
        >
          {completed ? '✓ Done' : saving ? 'Saving...' : 'Mark as complete'}
        </button>
      </div>

      {showPopup && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-5"
          style={{ background: 'rgba(20,20,20,0.55)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissPopup()
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-[420px] p-8 pb-6 text-center shadow-2xl">
            <div className="w-[52px] h-[52px] rounded-full bg-[#eafbf0] flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-[#1a7f3c]">✓</span>
            </div>
            <p className="text-[17px] font-bold text-[#1a1a1a] mb-1">Lesson complete</p>
            <p className="text-[13px] text-[#888] mb-5">{lessonTitle}</p>

            <div className="border-t border-[#f0f0f0] pt-5 mb-5">
              <p className="text-[15px] font-bold text-[#1a1a1a] mb-3.5">Did you find this lesson useful?</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => handleRate(n)}
                    className="text-3xl leading-none transition-colors"
                    style={{ color: n <= (hovered || picked) ? '#e8552e' : '#d8d8d8' }}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#e8552e] mt-2.5 min-h-[16px]">{ratingMsg || ' '}</p>
            </div>

            {alreadyPosted ? (
              <p className="text-[13px] text-[#999] mb-2.5">
                You already shared a takeaway for this lesson.
              </p>
            ) : (
              <Link
                href={`/feed?lesson=${encodeURIComponent(lessonId)}&title=${encodeURIComponent(lessonTitle)}`}
                className="block bg-[#e8552e] text-white text-sm font-bold px-5 py-3 rounded-lg mb-2.5"
              >
                Share a takeaway in Community
              </Link>
            )}
            <button
              onClick={dismissPopup}
              className="block w-full text-[13px] text-[#999] py-1.5"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </>
  )
}
