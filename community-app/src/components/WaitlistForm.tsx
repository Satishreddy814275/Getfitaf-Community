'use client'

import { useState } from 'react'

// Client component for the pre-Aug-1 mode of /beta. Kept separate from
// the page itself (a server component) since this is the one piece of
// the page that needs interactivity/state - everything else on /beta
// is static marketing copy.
export default function WaitlistForm() {
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
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Something went wrong. Try again.')
        setStatus('error')
        return
      }

      setStatus('done')
    } catch {
      setErrorMessage('Something went wrong. Try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-center">
        <p className="text-white font-semibold text-sm">You&apos;re on the list.</p>
        <p className="text-zinc-400 text-xs mt-1">
          We&apos;ll email you the moment doors open on Aug 1 - first come, first served for the
          50 spots at ₹249.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
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
          {status === 'loading' ? 'Joining...' : 'Join the waitlist'}
        </button>
      </div>
      {status === 'error' && <p className="text-red-400 text-xs">{errorMessage}</p>}
    </form>
  )
}
