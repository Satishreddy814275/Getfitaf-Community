'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getBetaSpotsRemaining,
  getRazorpayAuth,
  isBetaDiscountAvailable,
  LOW_TICKET_SPACE,
  RAZORPAY_SUBSCRIPTION_TOTAL_COUNT,
} from '@/lib/razorpay'

export type RazorpayMethod = 'upi' | 'card'

// What the checkout page (server component) needs to decide, BEFORE
// anyone clicks anything, whether to show the method-choice screen at
// all and what to say about pricing - so nothing shown on the page
// contradicts what Razorpay actually charges once clicked.
export async function getBetaCheckoutState(): Promise<{
  discounted: boolean
  spotsRemaining: number | null
}> {
  const admin = createAdminClient()
  const [discounted, spotsRemaining] = await Promise.all([
    isBetaDiscountAvailable(admin),
    getBetaSpotsRemaining(admin),
  ])
  return { discounted, spotsRemaining }
}

// Creates a Razorpay subscription for the signed-in member. method is
// null once the discount is no longer available - the UI skips the
// method-choice screen entirely at that point (see RazorpayCheckout.tsx)
// since there's no offer left to protect, and this just creates a
// plain subscription that lets Razorpay's checkout show every method
// actually enabled on the account. While discount slots remain, method
// is required and picks which offer gets attached - Razorpay offers
// can only be restricted to a single payment-method category, not
// applied universally the way the Stripe coupon was, so the discount
// has to be picked up front rather than auto-applied at checkout.
//
// Requires login first, same reasoning as /api/beta-checkout: the
// webhook grants access by matching this subscription's notes.profile_id
// to an existing profiles row, and that match only works reliably if
// the account already exists before Razorpay fires the webhook.
export async function createRazorpaySubscription(method: RazorpayMethod | null) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) {
    throw new Error('Not authenticated')
  }

  const planId = process.env.RAZORPAY_LOW_TICKET_PLAN_ID
  if (!planId) {
    throw new Error('Missing RAZORPAY_LOW_TICKET_PLAN_ID env var')
  }

  const admin = createAdminClient()
  // method === null means the UI already decided at page load that no
  // discount is available and skipped the method-choice screen - trust
  // that rather than re-checking, since beta_discount_redemptions only
  // ever grows, so "not discounted" can never flip back to "discounted"
  // between page load and click.
  const applyDiscount = method !== null && (await isBetaDiscountAvailable(admin))

  let offerId: string | undefined
  if (applyDiscount && method) {
    offerId =
      method === 'upi' ? process.env.RAZORPAY_UPI_OFFER_ID : process.env.RAZORPAY_CARD_OFFER_ID
    if (!offerId) {
      throw new Error(`Missing RAZORPAY_${method.toUpperCase()}_OFFER_ID env var`)
    }
  }

  const body: Record<string, unknown> = {
    plan_id: planId,
    total_count: RAZORPAY_SUBSCRIPTION_TOTAL_COUNT,
    quantity: 1,
    customer_notify: 1,
    // profile_id is how the webhook matches this subscription back to
    // a GetFit AF account (see findProfileFromNotes in
    // api/razorpay-webhook). method is read back there too - only used
    // to label the redemption row IF this subscription actually
    // activates with the discount attached (see BETA_DISCOUNT_CAP
    // comment in lib/razorpay.ts for why that's counted on confirmed
    // payment, not here at creation time).
    notes: { profile_id: user.id, email: user.email, method: method ?? 'none' },
  }
  if (offerId) body.offer_id = offerId

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
