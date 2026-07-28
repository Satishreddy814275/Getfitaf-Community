// Shared Razorpay config/helpers - used by the subscription-create
// server action (beta/razorpay-actions.ts) and the checkout page. No
// Razorpay SDK - plain fetch against their REST API, same approach
// already used for Mailchimp (see syncToMailchimp.ts) rather than
// adding a new dependency for what's a handful of simple authenticated
// requests.

import type { SupabaseClient } from '@supabase/supabase-js'

export function getRazorpayAuth(): string {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new Error('Missing NEXT_PUBLIC_RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET')
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
}

// Razorpay subscriptions require either total_count (a fixed number of
// billing cycles) or end_at - there's no native "bill indefinitely
// until cancelled" option the way Stripe has. 240 monthly cycles (20
// years) stands in for indefinite: nobody's expected to actually reach
// it, and members can still cancel anytime before then.
export const RAZORPAY_SUBSCRIPTION_TOTAL_COUNT = 240

export const LOW_TICKET_SPACE = 'low_ticket'

// Razorpay's own offer max_count is set to 50 on each of the two
// offers (UPI and card) separately - Satish's own dashboard config -
// so relying on Razorpay alone could let combined signups reach 100
// (50 UPI + 50 card). This app-side cap counts BOTH methods together
// against one combined ceiling, with a 5-person buffer above the
// target 50 to absorb the imprecision of counting at
// subscription-creation time rather than confirmed payment (someone
// who opens checkout and abandons it still consumes a slot - the
// buffer is deliberately sized to cover that slack, per Satish's own
// "let's leave a buffer" framing).
export const BETA_DISCOUNT_CAP = 55

// True while beta discount slots remain. Reads
// beta_discount_redemptions (an append-only log, NOT space_memberships
// - a cancelled membership is hard-deleted, see handleRevoked in
// api/razorpay-webhook, which would silently free up a "slot" that was
// already given out if we counted live memberships instead). Must be
// called with a service-role client - the table has RLS on with no
// policies.
export async function isBetaDiscountAvailable(
  admin: SupabaseClient
): Promise<boolean> {
  const { count } = await admin
    .from('beta_discount_redemptions')
    .select('*', { count: 'exact', head: true })
  return (count ?? 0) < BETA_DISCOUNT_CAP
}
