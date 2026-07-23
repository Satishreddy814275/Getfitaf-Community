import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

// Needs the Node runtime (not Edge) — same reason as the other Stripe
// routes: the Stripe SDK requires it.
export const runtime = 'nodejs'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' })
}

// Lets a signed-in member manage or cancel their own low-ticket
// subscription through Stripe's own hosted Billing Portal, rather than
// building custom cancel UI here. Mirrors /api/beta-checkout's shape:
// GET so it can be a plain link/button, requires a signed-in account,
// uses the account's own data rather than anything client-suppliable.
//
// Requires the Customer Portal to be configured/active in the Stripe
// Dashboard (Settings -> Billing -> Customer portal) - a one-time
// setup step, not per-user.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.redirect(
      `${origin}/login?next=${encodeURIComponent('/api/stripe-portal')}`,
      303
    )
  }

  // RLS (space_memberships_select_own) already restricts this to the
  // signed-in user's own row - no need for the admin client here.
  const { data: membership } = await supabase
    .from('space_memberships')
    .select('stripe_customer_id')
    .eq('profile_id', user.id)
    .eq('space', 'low_ticket')
    .maybeSingle()

  if (!membership?.stripe_customer_id) {
    // Nothing to manage - either no low-ticket membership at all, or
    // access was granted manually (no real Stripe subscription behind
    // it). Bounce back rather than error; the profile page itself only
    // shows the "Manage membership" link when this would succeed, so
    // landing here without a stripe_customer_id means the link was hit
    // directly/stale.
    return Response.redirect(`${origin}/profile`, 303)
  }

  const stripe = getStripe()

  let session: Stripe.BillingPortal.Session
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: membership.stripe_customer_id,
      return_url: `${origin}/profile`,
    })
  } catch (err) {
    // Same reasoning as beta-checkout's error handling - most likely
    // failure while setting this up is the Customer Portal config not
    // being active yet in this Stripe mode (test vs live), and Stripe's
    // own error message says so directly.
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('stripe-portal: failed to create portal session:', message)
    return new Response(`Stripe error: ${message}`, { status: 500 })
  }

  return Response.redirect(session.url, 303)
}
