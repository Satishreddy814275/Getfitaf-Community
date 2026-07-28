'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getRazorpayAuth,
  isBetaDiscountAvailable,
  LOW_TICKET_SPACE,
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

// Razorpay has no hosted equivalent of Stripe's Billing Portal, so
// cancellation has to be a real API call from our own UI rather than a
// redirect. cancel_at_cycle_end keeps the same "you won't be billed
// again, but you have access until the cycle finishes" policy as the
// (still-unbuilt) Stripe portal was meant to have - status only
// actually flips to cancelled, and space_memberships only gets its row
// deleted (see handleRevoked in api/razorpay-webhook), once the
// current cycle really ends. cancel_at_period_end here is purely a
// local flag so the profile page can show "cancels on [date]" in the
// meantime instead of re-showing the Cancel button.
export async function cancelRazorpaySubscription() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // RLS (space_memberships_select_own) already restricts this to the
  // signed-in user's own row.
  const { data: membership } = await supabase
    .from('space_memberships')
    .select('id, razorpay_subscription_id')
    .eq('profile_id', user.id)
    .eq('space', LOW_TICKET_SPACE)
    .maybeSingle()

  if (!membership?.razorpay_subscription_id) {
    throw new Error('No active Razorpay membership found to cancel.')
  }

  const res = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${membership.razorpay_subscription_id}/cancel`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getRazorpayAuth(),
      },
      body: JSON.stringify({ cancel_at_cycle_end: 1 }),
    }
  )

  const data = await res.json()
  if (!res.ok) {
    console.error('Razorpay subscription cancellation failed:', data)
    throw new Error(data?.error?.description || 'Could not cancel membership. Please try again.')
  }

  // Only select_own (read) and an admin-only write policy exist on
  // this table - a regular member has no UPDATE policy of their own,
  // so this write has to go through the admin client. Ownership was
  // already confirmed by the RLS-scoped select above.
  await createAdminClient()
    .from('space_memberships')
    .update({ cancel_at_period_end: true })
    .eq('id', membership.id)

  return { ok: true }
}
