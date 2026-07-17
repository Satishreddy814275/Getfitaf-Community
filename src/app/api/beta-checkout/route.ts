import Stripe from 'stripe'

// Needs the Node runtime (not Edge) — same reason as
// src/app/api/stripe-webhook: the Stripe SDK requires it.
export const runtime = 'nodejs'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' })
}

// Why this route exists: Stripe Payment Links (the static, reusable
// URLs created in the Dashboard) have no way to silently auto-apply a
// coupon — the only discount option on a Payment Link is
// `allow_promotion_codes`, which shows the customer a code field to
// fill in themselves (confirmed against Stripe's own API reference for
// payment_links.create — there's no `discounts` param there at all).
//
// A Checkout Session is a different object — created fresh per
// customer via the API rather than one static link — and IS allowed to
// carry a `discounts` array. So instead of sending beta applicants to
// a Payment Link, we send them here first: this route creates a
// one-off Checkout Session with the beta coupon silently attached, and
// immediately redirects to it. The customer never sees a promo code
// field or types anything — checkout just opens already showing ₹249.
//
// GET (not POST) on purpose, so this can be used as a plain link in an
// acceptance email — no client-side JS or form needed, same as a
// Payment Link would be.
export async function GET(req: Request) {
  const priceId = process.env.STRIPE_LOW_TICKET_PRICE_ID
  const couponId = process.env.STRIPE_BETA_COUPON_ID
  if (!priceId || !couponId) {
    return new Response(
      'Missing STRIPE_LOW_TICKET_PRICE_ID or STRIPE_BETA_COUPON_ID env vars',
      { status: 500 }
    )
  }

  const url = new URL(req.url)
  // Pass ?email=<the address they signed up with> when generating this
  // link for an approved applicant. Prefilling it here (rather than
  // letting Stripe collect it fresh at checkout) means the Stripe
  // customer's email matches profiles.email exactly, which is what the
  // webhook's findProfileByEmail lookup relies on — a typo'd email at
  // checkout would otherwise land the payment in
  // unmatched_stripe_payments instead of granting access.
  const email = url.searchParams.get('email') || undefined

  // Derived from the incoming request rather than hardcoded, so this
  // works the same on a Vercel preview deployment and on the real
  // production domain without needing a separate env var for it.
  const origin = url.origin

  const stripe = getStripe()

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: [{ coupon: couponId }],
      customer_email: email,
      // Sent to /feed rather than a dedicated "success" page — the
      // webhook grants access asynchronously (usually within seconds),
      // and /feed already redirects to /join on its own if access
      // somehow isn't there yet by the time they land, so there's no
      // dead end either way.
      success_url: `${origin}/feed`,
      cancel_url: `${origin}/beta`,
    })
  } catch (err) {
    // Surfaced directly rather than left as an unhandled 500 — the
    // most likely failure while setting this up is a test/live mode
    // mismatch between STRIPE_SECRET_KEY and the price/coupon IDs
    // (Stripe's error message says exactly this, e.g. "No such price"),
    // and that's much faster to debug read directly than guessed at
    // from a blank Next.js error page.
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('beta-checkout: failed to create Checkout Session:', message)
    return new Response(`Stripe error: ${message}`, { status: 500 })
  }

  if (!session.url) {
    return new Response('Could not create checkout session', { status: 500 })
  }

  return Response.redirect(session.url, 303)
}
