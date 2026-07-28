import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUnmatchedRazorpayPayment } from '@/lib/notifyUnmatchedRazorpayPayment'
import { removeFromMailchimpWaitlist } from '@/lib/removeFromMailchimpWaitlist'
import { LOW_TICKET_SPACE } from '@/lib/razorpay'

// Needs the Node runtime (not Edge) — same reason as
// src/app/api/stripe-webhook: raw-body HMAC signature verification
// requires Node's crypto module.
export const runtime = 'nodejs'

type AdminClient = ReturnType<typeof createAdminClient>

interface RazorpaySubscriptionEntity {
  id: string
  customer_id?: string | null
  status: string
  current_end?: number | null
  offer_id?: string | null
  notes?: { profile_id?: string; email?: string; method?: string } | null
}

interface RazorpayWebhookPayload {
  event: string
  payload: {
    subscription?: { entity: RazorpaySubscriptionEntity }
    payment?: { entity: { email?: string | null; contact?: string | null } }
  }
}

// Every subscription we create ourselves (see beta/razorpay-actions.ts)
// stamps notes.profile_id + notes.email at creation time, and Razorpay
// echoes notes back on every webhook for that subscription regardless
// of event type. That's a more direct and reliable match than Stripe's
// approach of looking up a customer by email on every event — no
// separate API call needed, and it can't be thrown off by someone
// paying with a different email than they signed up with.
async function findProfileFromNotes(
  supabase: AdminClient,
  subscription: RazorpaySubscriptionEntity,
  eventType: string,
  rawPayload: unknown
) {
  const profileId = subscription.notes?.profile_id
  if (!profileId) {
    await logUnmatched(supabase, {
      razorpayCustomerId: subscription.customer_id ?? null,
      razorpayCustomerEmail: subscription.notes?.email ?? null,
      eventType,
      rawPayload,
    })
    return null
  }

  // Confirm the profile still exists rather than trusting the id
  // blindly — notes are just metadata we set, not a foreign key.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle()

  if (!profile) {
    await logUnmatched(supabase, {
      razorpayCustomerId: subscription.customer_id ?? null,
      razorpayCustomerEmail: subscription.notes?.email ?? null,
      eventType,
      rawPayload,
    })
    return null
  }

  return profile.id as string
}

async function logUnmatched(
  supabase: AdminClient,
  details: {
    razorpayCustomerId: string | null
    razorpayCustomerEmail: string | null
    eventType: string
    rawPayload: unknown
  }
) {
  await supabase.from('unmatched_razorpay_payments').insert({
    razorpay_customer_id: details.razorpayCustomerId,
    razorpay_customer_email: details.razorpayCustomerEmail,
    event_type: details.eventType,
    raw_payload: details.rawPayload,
  })

  await notifyUnmatchedRazorpayPayment({
    razorpayCustomerId: details.razorpayCustomerId,
    razorpayCustomerEmail: details.razorpayCustomerEmail,
    eventType: details.eventType,
  })
}

// First successful authorization — the Razorpay equivalent of Stripe's
// customer.subscription.created, grants access.
async function handleActivated(
  supabase: AdminClient,
  subscription: RazorpaySubscriptionEntity,
  eventType: string,
  rawPayload: unknown
) {
  const profileId = await findProfileFromNotes(supabase, subscription, eventType, rawPayload)
  if (!profileId) return

  await supabase.from('space_memberships').upsert(
    {
      profile_id: profileId,
      space: LOW_TICKET_SPACE,
      razorpay_customer_id: subscription.customer_id ?? null,
      razorpay_subscription_id: subscription.id,
      status: 'active',
      trial_ends_at: null,
      current_period_end: subscription.current_end
        ? new Date(subscription.current_end * 1000).toISOString()
        : null,
    },
    { onConflict: 'profile_id,space' }
  )

  // Counts toward the public beta-discount cap (see BETA_DISCOUNT_CAP /
  // BETA_ANNOUNCED_CAP in lib/razorpay.ts) only HERE, once payment is
  // actually confirmed - not at the moment someone merely clicked Pay
  // (see createRazorpaySubscription in beta/razorpay-actions.ts). That
  // way an abandoned checkout never burns a slot that a real paying
  // member could have used. offer_id on the subscription entity is
  // Razorpay's own record of whether the discount was actually
  // attached to this specific subscription at creation time.
  if (subscription.offer_id) {
    await supabase.from('beta_discount_redemptions').insert({
      profile_id: profileId,
      razorpay_subscription_id: subscription.id,
      method: subscription.notes?.method || 'unknown',
    })
  }

  // This is the moment someone actually becomes a member — pull them
  // out of the Mailchimp waitlist sequence, same as the Stripe flow.
  const email = subscription.notes?.email
  if (email) await removeFromMailchimpWaitlist(email)
}

// Recurring successful charge — keeps status active and pushes out
// current_period_end. Doesn't grant access from scratch (activated
// already did that); this just extends it.
async function handleCharged(
  supabase: AdminClient,
  subscription: RazorpaySubscriptionEntity,
  eventType: string,
  rawPayload: unknown
) {
  const { data: membership } = await supabase
    .from('space_memberships')
    .select('id')
    .eq('razorpay_subscription_id', subscription.id)
    .maybeSingle()

  if (!membership) {
    // Charged before we ever saw an activated event for this
    // subscription — shouldn't normally happen, but handle it the same
    // way activation would rather than silently dropping a real
    // payment.
    await handleActivated(supabase, subscription, eventType, rawPayload)
    return
  }

  await supabase
    .from('space_memberships')
    .update({
      status: 'active',
      current_period_end: subscription.current_end
        ? new Date(subscription.current_end * 1000).toISOString()
        : null,
    })
    .eq('id', membership.id)
}

// Payment failed but Razorpay is still retrying — soft state, same as
// Stripe's invoice.payment_failed. Access is not revoked here.
async function handlePending(supabase: AdminClient, subscription: RazorpaySubscriptionEntity) {
  await supabase
    .from('space_memberships')
    .update({ status: 'past_due' })
    .eq('razorpay_subscription_id', subscription.id)
}

// Retries exhausted (halted) or explicitly cancelled — both are
// Razorpay's version of Stripe's customer.subscription.deleted ("fired
// once Stripe gives up retrying, or on explicit cancellation"), so
// both revoke the same way: delete the row so has_space_access() (row
// existence only, not status) immediately stops granting access.
async function handleRevoked(supabase: AdminClient, subscription: RazorpaySubscriptionEntity) {
  await supabase.from('space_memberships').delete().eq('razorpay_subscription_id', subscription.id)
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  // Both must be equal length for timingSafeEqual — signature is
  // attacker-influenced input, so guard against a length mismatch
  // throwing before we get the chance to reject it.
  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function POST(req: Request) {
  const signature = req.headers.get('x-razorpay-signature')
  const eventId = req.headers.get('x-razorpay-event-id')
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  const rawBody = await req.text() // must be the raw body for signature verification

  if (!signature || !eventId || !webhookSecret) {
    return new Response('Missing signature, event id, or webhook secret', { status: 400 })
  }

  if (!verifySignature(rawBody, signature, webhookSecret)) {
    console.error('Razorpay signature verification failed')
    return new Response('Invalid signature', { status: 400 })
  }

  const body = JSON.parse(rawBody) as RazorpayWebhookPayload
  const supabase = createAdminClient()

  // Idempotency — Razorpay retries webhook deliveries with exponential
  // backoff on any non-2xx response, so skip anything already handled.
  // x-razorpay-event-id is a unique value per event (confirmed via
  // Razorpay's own webhook docs), same role event.id plays for Stripe.
  const { data: already } = await supabase
    .from('processed_razorpay_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (already) {
    return new Response('Already processed', { status: 200 })
  }

  const subscription = body.payload.subscription?.entity

  // TEMP DIAGNOSTIC — remove once we've confirmed whether Razorpay
  // echoes offer_id back on the subscription entity for real events.
  // A real card payment (test2, 2026-07-28) charged the discounted
  // ₹249 rate but left beta_discount_redemptions empty, meaning
  // subscription.offer_id read falsy in handleActivated despite the
  // offer clearly being attached at creation time. No DB constraint
  // explains a silent insert failure, so this logs the raw entity to
  // see what Razorpay actually sent.
  if (subscription) {
    console.log('[razorpay-webhook] TEMP DIAGNOSTIC', {
      event: body.event,
      subscriptionId: subscription.id,
      offerId: subscription.offer_id,
      notes: subscription.notes,
      status: subscription.status,
    })
  }

  try {
    if (subscription) {
      switch (body.event) {
        case 'subscription.activated':
          await handleActivated(supabase, subscription, body.event, body)
          break
        case 'subscription.charged':
          await handleCharged(supabase, subscription, body.event, body)
          break
        case 'subscription.pending':
          await handlePending(supabase, subscription)
          break
        case 'subscription.halted':
        case 'subscription.cancelled':
          await handleRevoked(supabase, subscription)
          break
        default:
          // subscription.authenticated / .updated / .completed / .resumed
          // are intentionally ignored for now — none of them require a
          // space_memberships change beyond what activated/charged/
          // pending/halted/cancelled already cover.
          break
      }
    }
  } catch (err) {
    // Logged for investigation, but still marked processed below —
    // retrying a persistently-broken handler just means Razorpay
    // hammers this endpoint for 24 hours before giving up.
    console.error('Error handling Razorpay event', body.event, (err as Error).message)
  }

  await supabase.from('processed_razorpay_events').insert({ event_id: eventId })

  return new Response('ok', { status: 200 })
}
