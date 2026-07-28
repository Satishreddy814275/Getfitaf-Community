'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createRazorpaySubscription,
  checkBetaAccessGranted,
  type RazorpayMethod,
} from '@/app/beta/razorpay-actions'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void }
  }
}

// Loads Razorpay's checkout script once and reuses it across method
// selections, rather than re-injecting a script tag on every click.
let scriptPromise: Promise<void> | null = null
function loadRazorpayScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Razorpay checkout'))
    document.body.appendChild(script)
  })
  return scriptPromise
}

function QrIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" />
    </svg>
  )
}

function CardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}

// Razorpay-native counterpart to the old single-click Stripe CTA. Two
// distinct paths depending on whether beta discount slots remain (see
// BETA_DISCOUNT_CAP in lib/razorpay.ts):
//
// - discounted: member has to pick UPI or card BEFORE a subscription
//   is created, since Razorpay offers can only be restricted to one
//   payment-method category - the `method` flags passed into Checkout
//   below are the structural safeguard that keeps them from switching
//   methods inside the modal and silently missing the discount. Worth
//   confirming visually (only one tab shows) during the real-payment
//   test pass.
// - not discounted: no offer to protect, so no choice to make either -
//   one button, no method restriction, Razorpay's own checkout shows
//   whatever's actually enabled on the account.
export default function RazorpayCheckout({
  email,
  discounted,
  spotsRemaining,
}: {
  email: string
  discounted: boolean
  spotsRemaining: number | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState<RazorpayMethod | 'single' | null>(null)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')

  // Access is granted by an async webhook, not by Razorpay's
  // client-side success callback - polls for up to ~12s so the person
  // doesn't land on /feed and briefly see Lessons/Workouts still
  // locked while the webhook catches up (see checkBetaAccessGranted's
  // comment for why this exists). If it never lands within that
  // window, sends them on anyway rather than leaving them stuck - /feed
  // already tolerates access arriving a moment after it loads, this is
  // purely about not showing a confusing in-between state.
  async function waitForAccessThenRedirect() {
    const maxAttempts = 12
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (await checkBetaAccessGranted()) break
      if (attempt < maxAttempts - 1) await sleep(1000)
    }
    router.push('/feed')
  }

  async function handlePay(method: RazorpayMethod | null) {
    setError('')
    setPending(method ?? 'single')
    try {
      // discounted here reflects the actual decision made at the
      // moment this specific subscription was created server-side -
      // more authoritative than the `discounted` prop, which only
      // reflects the cap's state as of the earlier page load, in the
      // (rare) case it changes in between.
      const { subscriptionId, discounted: actuallyDiscounted } =
        await createRazorpaySubscription(method)
      await loadRazorpayScript()

      const options: Record<string, unknown> = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        subscription_id: subscriptionId,
        name: 'GetFit AF',
        description: actuallyDiscounted
          ? 'Community Membership - first month ₹249'
          : 'Community Membership - ₹499/month',
        prefill: { email },
        theme: { color: '#f97316' },
        // The webhook (api/razorpay-webhook) is the real source of
        // truth for granting access, same as the Stripe flow - this
        // shows a brief "activating" state and polls for it rather
        // than redirecting instantly, so /feed doesn't load a beat
        // before the webhook has actually landed.
        handler: () => {
          setActivating(true)
          waitForAccessThenRedirect()
        },
        modal: {
          ondismiss: () => setPending(null),
        },
      }

      // Only restrict the modal to one method when a specific method
      // was actually chosen up front (the discount path) - once
      // there's no offer to protect, let Razorpay show every method
      // that's enabled on the account instead of guessing at one.
      if (method) {
        options.method =
          method === 'upi'
            ? { upi: 1, card: 0, netbanking: 0, wallet: 0, paylater: 0, emi: 0 }
            : { card: 1, upi: 0, netbanking: 0, wallet: 0, paylater: 0, emi: 0 }
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setPending(null)
    }
  }

  if (activating) {
    return (
      <div className="py-8 text-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-sm font-semibold mb-1">Activating your access…</p>
        <p className="text-zinc-500 text-xs">This usually takes just a few seconds.</p>
      </div>
    )
  }

  return (
    <div>
      {spotsRemaining !== null && (
        <p className="text-orange-400 text-xs font-semibold text-center mb-4">
          {spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} left at this price
        </p>
      )}

      <div className="text-center mb-1">
        <span className="text-white text-4xl font-medium">
          {discounted ? '₹249' : '₹499'}
        </span>
        <span className="text-zinc-500 text-sm ml-1">
          {discounted ? 'first month' : '/month'}
        </span>
      </div>
      <p className="text-zinc-500 text-xs text-center mb-5">
        {discounted ? 'then ₹499/month · cancel anytime' : 'Cancel anytime'}
      </p>

      <div className="h-px bg-zinc-800 mb-5" />

      {discounted && (
        <p className="text-zinc-500 text-xs text-center mb-4">
          Choose carefully. The ₹249 discount only applies to the method you pick here.
        </p>
      )}

      {discounted ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handlePay('upi')}
            disabled={pending !== null}
            className="h-11 flex items-center justify-center gap-1.5 whitespace-nowrap bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-full transition text-sm"
          >
            {pending === 'upi' ? (
              'Opening…'
            ) : (
              <>
                <QrIcon />
                UPI · ₹249
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => handlePay('card')}
            disabled={pending !== null}
            className="h-11 flex items-center justify-center gap-1.5 whitespace-nowrap bg-transparent hover:bg-zinc-900 disabled:opacity-60 text-white font-bold rounded-full transition text-sm border border-zinc-700"
          >
            {pending === 'card' ? (
              'Opening…'
            ) : (
              <>
                <CardIcon />
                Card · ₹249
              </>
            )}
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => handlePay(null)}
            disabled={pending !== null}
            className="w-full h-11 flex items-center justify-center whitespace-nowrap bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-full transition text-sm"
          >
            {pending === 'single' ? 'Opening…' : 'Continue'}
          </button>
          <p className="text-zinc-600 text-[11px] text-center mt-3">
            Choose your payment method on the next screen.
          </p>
        </div>
      )}

      {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}

      <p className="text-zinc-600 text-[10px] flex items-center justify-center gap-1.5 mt-4">
        <LockIcon />
        Payments secured by Razorpay
      </p>
    </div>
  )
}
