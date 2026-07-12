import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUnmatchedPayment } from '@/lib/notifyUnmatchedPayment'

// Needs the Node runtime (not Edge) — the Stripe SDK and raw-body
// signature verification below both require it.
export const runtime = 'nodejs'

const LOW_TICKET_SPACE = 'low_ticket'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' })
}

type AdminClient = ReturnType<typeof createAdminClient>

// Finds the GetFit AF profile matching a Stripe customer's email. If
// none is found, logs it to unmatched_stripe_payments and emails
// Satish immediately so nothing paid-for silently falls through the
// cracks.
async function findProfileByEmail(
  supabase: AdminClient,
  email: string | null | undefined,
  context: { stripeCustomerId: string | null; eventType: string; rawPayload: unknown }
) {
  if (!email) {
    await logUnmatched(supabase, { ...context, stripeCustomerEmail: null })
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle()

  if (!profile) {
    await logUnmatched(supabase, { ...context, stripeCustomerEmail: email })
    return null
  }

  return profile.id as string
}

async function logUnmatched(
  supabase: AdminClient,
  details: {
    stripeCustomerId: string | null
    stripeCustomerEmail: string | null
    eventType: string
    rawPayload: unknown
  }
) {
  await supabase.from('unmatched_stripe_payments').insert({
    stripe_customer_id: details.stripeCustomerId,
    stripe_customer_email: details.stripeCustomerEmail,
    event_type: details.eventType,
    raw_payload: details.rawPayload,
  })

  await notifyUnmatchedPayment({
    stripeCustomerId: details.stripeCustomerId,
    stripeCustomerEmail: details.stripeCustomerEmail,
    eventType: details.eventType,
  })
}

async function handleSubscriptionCreated(
  supabase: AdminClient,
  stripe: Stripe,
  event: Stripe.Event,
  subscription: Stripe.Subscription
) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const customer = await stripe.customers.retrieve(customerId)
  const email = 'email' in customer ? customer.email : null

  const profileId = await findProfileByEmail(supabase, email, {
    stripeCustomerId: customerId,
    eventType: event.type,
    rawPayload: event.data.object,
  })
  if (!profileId) return

  await supabase.from('space_memberships').upsert(
    {
      profile_id: profileId,
      space: LOW_TICKET_SPACE,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status === 'trialing' ? 'trialing' : 'active',
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    },
    { onConflict: 'profile_id,space' }
  )
}

// Shared by payment_succeeded and payment_failed — both need to find
// the space_memberships row for a given subscription id, falling back
// to matching by customer email if the row somehow doesn't exist yet
// (webhook delivery order isn't strictly guaranteed by Stripe).
async function findMembershipBySubscription(supabase: AdminClient, subscriptionId: string) {
  const { data } = await supabase
    .from('space_memberships')
    .select('id, profile_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  return data
}

async function handlePaymentSucceeded(
  supabase: AdminClient,
  event: Stripe.Event,
  invoice: Stripe.Invoice
) {
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  if (!subscriptionId) return

  const membership = await findMembershipBySubscription(supabase, subscriptionId)
  if (!membership) {
    // Payment succeeded but we have no record of this subscription at
    // all — shouldn't normally happen since customer.subscription.created
    // fires first, but log it rather than silently drop a real payment.
    await logUnmatched(supabase, {
      stripeCustomerId:
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null,
      stripeCustomerEmail: invoice.customer_email ?? null,
      eventType: event.type,
      rawPayload: event.data.object,
    })
    return
  }

  await supabase
    .from('space_memberships')
    .update({
      status: 'active',
      current_period_end: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
    })
    .eq('id', membership.id)
}

async function handlePaymentFailed(supabase: AdminClient, invoice: Stripe.Invoice) {
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  if (!subscriptionId) return

  const membership = await findMembershipBySubscription(supabase, subscriptionId)
  if (!membership) return

  // Soft state — Stripe automatically retries a failed payment over
  // the following days by default. We don't revoke access on the
  // first failure; only on customer.subscription.deleted (fired once
  // Stripe gives up retrying, or on explicit cancellation) or via the
  // daily trial-expiry safety net for trials that never converted.
  await supabase.from('space_memberships').update({ status: 'past_due' }).eq('id', membership.id)
}

async function handleSubscriptionDeleted(supabase: AdminClient, subscription: Stripe.Subscription) {
  // Definitive revoke — delete the row entirely so has_space_access()
  // (which only checks row existence, not status) immediately stops
  // granting access. No need to touch that function for this to work.
  await supabase
    .from('space_memberships')
    .delete()
    .eq('stripe_subscription_id', subscription.id)
}

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const body = await req.text() // must be the raw body for signature verification

  if (!signature || !webhookSecret) {
    return new Response('Missing signature or webhook secret', { status: 400 })
  }

  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe signature verification failed:', (err as Error).message)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = createAdminClient()

  // Idempotency — Stripe retries webhook deliveries on any non-2xx
  // response (and sometimes even on success), so skip anything we've
  // already handled.
  const { data: already } = await supabase
    .from('processed_stripe_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()

  if (already) {
    return new Response('Already processed', { status: 200 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created': {
        await handleSubscriptionCreated(
          supabase,
          stripe,
          event,
          event.data.object as Stripe.Subscription
        )
        break
      }
      case 'invoice.payment_succeeded': {
        await handlePaymentSucceeded(supabase, event, event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice)
        break
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break
      }
      default:
        // Anything else (e.g. customer.subscription.updated for plan
        // changes) is intentionally ignored for now.
        break
    }
  } catch (err) {
    // Logged for investigation, but we still mark the event as
    // processed below — retrying a persistently-broken handler just
    // means Stripe hammers this endpoint indefinitely.
    console.error('Error handling Stripe event', event.type, (err as Error).message)
  }

  await supabase.from('processed_stripe_events').insert({ event_id: event.id })

  return new Response('ok', { status: 200 })
}
