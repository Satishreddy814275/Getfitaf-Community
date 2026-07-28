'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getRazorpayAuth,
  isBetaDiscountAvailable,
  RAZORPAY_SUBSCRIPTION_TOTAL_COUNT,
} from '@/lib/razorpay'

export type RazorpayMethod = 'upi' | 'card'

// Whether the beta discount is still available right now - exported so
// the checkout page (server component) can show the correct price
// BEFORE anyone clicks anything, rather than surprising them with a
// different amount inside the Razorpay modal than what the page said.
export async function checkBetaDiscountAvailable(): Promise<boolean> {
  return isBetaDiscountAvailable(createAdminClient())
}

// Creates a Razorpay subscription for the signed-in member. If beta
// discount slots remain (see isBetaDiscountAvailable /
// BETA_DISCOUNT_CAP in lib/razorpay.ts), attaches whichever offer
// matches the payment method they chose on the method-choice screen
// (see RazorpayCheckout.tsx) - Razorpay offers can only be restricted
// to a single payment-method category, not applied universally the way
// the Stripe coupon was, so the discount has to be picked up front
// rather than auto-applied at checkout. Once the cap is reached, this
// simply omits offer_id and the subscription bills the plan's own
// ₹499 base rate from month one - no separate "post-beta" plan needed.
//
// Requires login first, same reasoning as /api/beta-checkout: the
// webhook grants access by matching this subscription's notes.profile_id
// to an existing profiles row, and that match only works reliably if
// the account already exists before Razorpay fires the webhook.
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

  const admin = createAdminClient()
  const applyDiscount = await isBetaDiscountAvailable(admin)

  const body: Record<string, unknown> = {
    plan_id: planId,
    total_count: RAZORPAY_SUBSCRIPTION_TOTAL_COUNT,
    quantity: 1,
    customer_notify: 1,
    // Not used for granting access (the webhook matches by
    // notes.profile_id) - just useful context if this ever needs
    // manual investigation in the Razorpay dashboard.
    notes: { profile_id: user.id, email: user.email },
  }
  if (applyDiscount) body.offer_id = offerId

  const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getRazorpayAuth(),
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Razorpay subscription creation failed:', data)
    throw new Error(data?.error?.description || 'Could not start checkout. Please try again.')
  }

  // Log the redemption AFTER a successful create - a failed attempt
  // shouldn't consume a slot from the cap.
  if (applyDiscount) {
    await admin.from('beta_discount_redemptions').insert({
      profile_id: user.id,
      razorpay_subscription_id: data.id,
      method,
    })
  }

  return { subscriptionId: data.id as string, email: user.email as string, discounted: applyDiscount }
}
