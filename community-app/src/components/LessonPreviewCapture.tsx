'use client'

import { useState } from 'react'

// Standalone "not ready to pay yet" card - sits between FAQ and the
// bottom CTA on the live (post-Aug-1) /beta page. Posts to the same
// /api/beta-waitlist endpoint the old pre-launch WaitlistForm used -
// that route was always generic (email + name -> beta_waitlist table +
// Mailchimp "Community Beta Waitlist" sync), nothing pre-launch
// specific about it. See 2026-08-01 conversation: this is the only
// email-capture path on the live page now that WaitlistForm no longer
// renders once isLive is true.
//
// Sets the same localStorage flag FreeLessonsBanner checks - if
// someone submits here, the banner (which triggers on scroll/time
// separately) shouldn't also nag them later in the same visit.
const BANNER_DISMISS_KEY = 'gfa-free-lessons-banner-dismissed'

export default function LessonPreviewCapture() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/beta-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Something went wrong. Try again.')
        setStatus('error')
        return
      }

      window.localStorage.setItem(BANNER_DISMISS_KEY, new Date().toDateString())
      setStatus('done')
    } catch {
      setErrorMessage('Something went wrong. Try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl p-6 bg-zinc-900/40 border border-zinc-800 text-center">
        <p className="text-white font-semibold text-sm">Check your inbox.</p>
        <p className="text-zinc-400 text-xs mt-1">
          Your first lesson is on its way. If you don&apos;t see it in a few minutes, check
          Promotions or Spam.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-6 bg-zinc-900/40 border border-zinc-800 text-center">
      <p className="text-white text-base font-bold mb-1">Not sure yet?</p>
      <p className="text-zinc-400 text-xs mb-4 leading-relaxed max-w-sm mx-auto">
        Get the first 7 lessons free - mindset, nutrition basics, and how to actually track
        progress. No payment needed.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2 max-w-sm mx-auto">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-xl transition text-sm whitespace-nowrap"
          >
            {status === 'loading' ? 'Sending...' : 'Send me the free lessons'}
          </button>
        </div>
        {status === 'error' && <p className="text-red-400 text-xs">{errorMessage}</p>}
      </form>
    </div>
  )
}
