'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createRazorpaySubscription, type RazorpayMethod } from '@/app/beta/razorpay-actions'

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

// Razorpay-native counterpart to the old single-click Stripe CTA.
// Needs an extra step Stripe didn't: Razorpay offers can only be
// restricted to one payment-method category (UPI or card, not both),
// so the member has to pick a method here BEFORE a subscription is
// created, matching whichever offer_id gets attached server-side. The
// `method` flags passed into the Checkout options below are the
// structural safeguard that keeps them from switching methods inside
// the modal itself and silently missing the discount - worth
// confirming visually (only one tab shows) during the real-payment
// test pass, since this is the one piece of the integration most
// worth double-checking against Razorpay's current widget behavior.
export default function RazorpayCheckout({ email }: { email: string }) {
  const router = useRouter()
  const [loadingMethod, setLoadingMethod] = useState<RazorpayMethod | null>(null)
  const [error, setError] = useState('')

  async function handlePay(method: RazorpayMethod) {
    setError('')
    setLoadingMethod(method)
    try {
      const { subscriptionId } = await createRazorpaySubscription(method)
      await loadRazorpayScript()

      const methodFlags =
        method === 'upi'
          ? { upi: 1, card: 0, netbanking: 0, wallet: 0, paylater: 0, emi: 0 }
          : { card: 1, upi: 0, netbanking: 0, wallet: 0, paylater: 0, emi: 0 }

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        subscription_id: subscriptionId,
        name: 'GetFit AF',
        description: 'Community Membership - first month ₹249',
        prefill: { email },
        method: methodFlags,
        theme: { color: '#f97316' },
        // The webhook (api/razorpay-webhook) is the real source of
        // truth for granting access, same as the Stripe flow - this
        // just moves them on to /feed, which already redirects back
        // if access somehow isn't there yet by the time they land.
        handler: () => {
          router.push('/feed')
        },
        modal: {
          ondismiss: () => setLoadingMethod(null),
        },
      })
      razorpay.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoadingMethod(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-zinc-400 text-xs text-center">
        Choose carefully — the ₹249 discount only applies to the method you pick here.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handlePay('upi')}
          disabled={loadingMethod !== null}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-xl transition text-sm"
        >
          {loadingMethod === 'upi' ? 'Opening…' : 'Pay with UPI — ₹249'}
        </button>
        <button
          type="button"
          onClick={() => handlePay('card')}
          disabled={loadingMethod !== null}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-white font-bold py-3 px-6 rounded-xl transition text-sm border border-zinc-700"
        >
          {loadingMethod === 'card' ? 'Opening…' : 'Pay with Card — ₹249'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      <p className="text-zinc-600 text-[11px] text-center">Then ₹499/month. Cancel anytime.</p>
    </div>
  )
}
