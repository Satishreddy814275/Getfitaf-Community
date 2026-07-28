// Shared Razorpay config/helpers - used by the subscription-create
// server action (beta/razorpay-actions.ts) and the checkout page. No
// Razorpay SDK - plain fetch against their REST API, same approach
// already used for Mailchimp (see syncToMailchimp.ts) rather than
// adding a new dependency for what's a handful of simple authenticated
// requests.

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
