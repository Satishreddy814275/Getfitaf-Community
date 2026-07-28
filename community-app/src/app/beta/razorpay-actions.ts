'use server'

import { createClient } from '@/lib/supabase/server'
import { getRazorpayAuth, RAZORPAY_SUBSCRIPTION_TOTAL_COUNT } from '@/lib/razorpay'

export type RazorpayMethod = 'upi' | 'card'

// Creates a Razorpay subscription for the signed-in member, attaching
// whichever offer matches the payment method they chose on the
// method-choice screen (see RazorpayCheckout.tsx). Razorpay offers can
// only be restricted to a single payment-method category - not applied
// universally the way the Stripe coupon was - so the discount has to
// be picked up front rather than auto-applied at checkout.
//
// Requires login first, same reasoning as /api/beta-checkout: the
// webhook grants access by matching this subscription's email to an
// existing profiles row, and that match only works reliably if the
// account already exists before Razorpay fires the webhook.
export async function createRazorpaySubscription(method: RazorpayMethod) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    throw new Error('Not authenticated')
  }

  const planId = process.env.RAZORPAY_LOW_TICKET_PLAN_ID
  const offerId =
    method === 'upi'
      ? process.env.RAZORPAY_UPI_OFFER_ID
      : process.env.RAZORPAY_CARD_OFFER_ID

  if (!planId || !offerId) {
    throw new Error(
      `Missing RAZORPAY_LOW_TICKET_PLAN_ID or RAZORPAY_${method.toUpperCase()}_OFFER_ID env var`
    )
  }

  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getRazorpayAuth(),
    },
    body: JSON.stringify({
      plan_id: planId,
      offer_id: offerId,
      total_count: RAZORPAY_SUBSCRIPTION_TOTAL_COUNT,
      quantity: 1,
      customer_notify: 1,
      // Not used for granting access (the webhook matches by email,
      // same as Stripe) - just useful context if this ever needs
      // manual investigation in the Razorpay dashboard.
      notes: { profile_id: user.id, email: user.email },
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Razorpay subscription creation failed:', data)
    throw new Error(data?.error?.description || 'Could not start checkout. Please try again.')
  }

  return { subscriptionId: data.id as string, email: user.email as string }
}
