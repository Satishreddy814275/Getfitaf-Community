'use client'

import { useState } from 'react'
import { cancelRazorpaySubscription } from '@/app/beta/razorpay-actions'

// Only rendered by profile/page.tsx when a razorpay_subscription_id
// exists on the member's low_ticket space_memberships row - i.e. only
// for someone who actually went through /beta/pay. No hosted Stripe-
// style portal to redirect to for Razorpay, so this is a real cancel
// button hitting our own server action instead of a plain link.
export default function RazorpayMembershipCard({
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: {
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [cancelled, setCancelled] = useState(cancelAtPeriodEnd)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const periodEndDisplay = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  async function handleCancel() {
    setLoading(true)
    setError('')
    try {
      await cancelRazorpaySubscription()
      setCancelled(true)
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-3 mt-4">
      <h2 className="text-sm font-bold text-white">Membership</h2>

      {cancelled ? (
        <p className="text-sm text-zinc-400">
          Your membership is cancelled — you won&apos;t be billed again, but you keep access
          {periodEndDisplay ? ` until ${periodEndDisplay}` : ' until the current cycle ends'}.
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            Active{periodEndDisplay ? ` — renews ${periodEndDisplay}` : ''}.
          </p>
          {confirming ? (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                You won&apos;t be billed again, but you&apos;ll keep access until the end of your
                current billing cycle. Cancel?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-60"
                >
                  {loading ? 'Cancelling…' : 'Yes, cancel membership'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-400"
                >
                  Never mind
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-semibold text-zinc-500 hover:text-red-400 transition"
            >
              Cancel membership
            </button>
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </>
      )}
    </div>
  )
}
