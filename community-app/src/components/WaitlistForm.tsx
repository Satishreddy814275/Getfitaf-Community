'use client'

import { useState } from 'react'

// The address campaigns actually send from - shown post-signup so
// people can copy it into their contacts rather than typing it by
// hand. Not read from env since it's a fixed, publicly-shown value,
// not a secret - hardcoding it here avoids adding a new env var for a
// single display string.
const SENDER_EMAIL = 'satish@getfitaf.fitness'

// Client component for the pre-Aug-1 mode of /beta. Kept separate from
// the page itself (a server component) since this is the one piece of
// the page that needs interactivity/state - everything else on /beta
// is static marketing copy.
export default function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [copied, setCopied] = useState(false)

  // Best-effort - the Clipboard API can fail in older browsers or
  // non-HTTPS contexts, and the address is already shown as plain
  // text right next to the button, so a failure here just means the
  // person copies it manually instead of getting the "Copied" state.
  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(SENDER_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // no-op, see comment above
    }
  }

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
        {/* Sets expectations right after signup instead of leaving
            people to wonder if the confirmation email actually sent -
            plain copy-to-clipboard button (works the same on every
            device, unlike a vCard download) plus a Gmail-specific tip,
            since that's the strongest deliverability signal available
            to a recipient. */}
        <div className="mt-3 pt-3 border-t border-orange-500/20 text-left">
          <p className="text-zinc-400 text-xs">
            You should get a confirmation email from us shortly. If you don&apos;t see it, check
            your Promotions or Spam tab.
          </p>
          <div className="mt-2 flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
            <span className="text-white text-xs flex-1 truncate">{SENDER_EMAIL}</span>
            <button
              type="button"
              onClick={handleCopyEmail}
              className="text-orange-400 hover:text-orange-300 text-xs font-semibold whitespace-nowrap transition"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-zinc-500 text-[11px] mt-2">
            Add this to your contacts so future emails land in your inbox, not Promotions. On
            Gmail, if you find us in Promotions, drag that email into Primary once and we&apos;ll
            stay there.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
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
          {status === 'loading' ? 'Joining...' : 'Join the waitlist'}
        </button>
      </div>
      {status === 'error' && <p className="text-red-400 text-xs">{errorMessage}</p>}
    </form>
  )
}
