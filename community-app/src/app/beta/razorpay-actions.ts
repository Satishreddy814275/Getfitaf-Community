'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExistingAccess } from '@/lib/existingAccess'
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

  // Hard stop against a real duplicate charge - beta/pay/page.tsx
  // already redirects an existing member away before they see a
  // checkout button, but this is the actual money-moving call, so it
  // gets its own independent check rather than trusting that the page
  // upstream was never bypassed (stale render, future code path
  // calling this action some other way, etc.).
  if (await hasExistingAccess(supabase, user.id)) {
    throw new Error('You already have access - no need to subscribe again.')
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
    //
    // discount_applied is stamped here rather than left for the webhook
    // to infer from Razorpay's own subscription.offer_id echo - a real
    // test payment (2026-07-28) charged the discounted rate but
    // subscription.offer_id read falsy on the activated event, an
    // undocumented gap in what Razorpay actually sends back. We already
    // know deterministically, server-side, whether an offer was
    // attached (see applyDiscount above) - no need to guess it back
    // from Razorpay's payload when notes already round-trips reliably
    // (profile_id/email matching in findProfileFromNotes proves this).
    notes: {
      profile_id: user.id,
      email: user.email,
      method: method ?? 'none',
      discount_applied: applyDiscount ? '1' : '0',
    },
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

// Polled from RazorpayCheckout right after Razorpay's client-side
// payment-success callback fires, before redirecting to /feed. Access
// is actually granted by the webhook (a separate, asynchronous
// server-to-server call from Razorpay) - without this, someone could
// land on /feed a few seconds before that webhook lands and briefly
// see Lessons/Workouts still locked, which reads as broken even though
// it resolves itself moments later. Reuses the same access check as
// the /beta and /beta/pay redirects (hasExistingAccess) rather than a
// bespoke "does this specific subscription have a row yet" query,
// since what actually matters to the person waiting is "do I have
// access now," not which code path granted it.
export async function checkBetaAccessGranted(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  return hasExistingAccess(supabase, user.id)
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
