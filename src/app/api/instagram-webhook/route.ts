import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Needs the Node runtime (not Edge) - raw-body HMAC signature
// verification requires Node's crypto module, same reason as
// stripe-webhook and razorpay-webhook.
export const runtime = 'nodejs'

type AdminClient = ReturnType<typeof createAdminClient>

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// --- Meta webhook handshake -------------------------------------------------
//
// When you paste the callback URL into the Meta app dashboard and hit
// "Verify and save", Meta calls this with hub.mode=subscribe and a
// challenge string. Echo the challenge back as plain text if the verify
// token matches what you configured there - this is a one-time check,
// not something that runs per-event.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token && expectedToken && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Verification failed', { status: 403 })
}

// --- Signature verification --------------------------------------------------

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const signature = signatureHeader.slice('sha256='.length)
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  if (expected.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// --- Meta payload shapes -------------------------------------------------
//
// Trimmed to the fields this route actually reads. See Meta's Instagram
// webhooks reference if these ever need extending - the "comments" and
// "messages"/"messaging" change fields are the only two this campaign
// flow cares about.

interface CommentChangeValue {
  id: string // comment id
  text: string
  from: { id: string; username?: string }
  media: { id: string }
}

interface MessagingEvent {
  sender: { id: string }
  recipient: { id: string }
  message?: { mid: string; text?: string }
}

interface WebhookEntry {
  id: string
  time: number
  changes?: { field: string; value: CommentChangeValue }[]
  messaging?: MessagingEvent[]
}

interface WebhookPayload {
  object: string
  entry: WebhookEntry[]
}

// --- Graph API calls -------------------------------------------------------

async function graphPost(path: string, body: Record<string, unknown>) {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) throw new Error('Missing INSTAGRAM_ACCESS_TOKEN')

  const res = await fetch(`${GRAPH_API_BASE}/${path}?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Graph API call to ${path} failed (${res.status}): ${errText}`)
  }

  return res.json()
}

// Public reply visible under the comment thread itself.
async function postPublicReply(commentId: string, message: string) {
  await graphPost(`${commentId}/replies`, { message })
}

// Private DM triggered by a specific comment - the endpoint Meta
// provides specifically for the "reply publicly + also DM them"
// pattern. Only usable within a short window of the triggering comment
// (per Meta's docs), which is fine here since we call it immediately.
async function postPrivateReply(commentId: string, message: string) {
  await graphPost(`${commentId}/private_replies`, { message })
}

// Follow-up DM once someone's already inside an open messaging thread
// (e.g. sending the file after they reply to confirm) - not tied to a
// specific comment, just an open recipient thread.
async function sendDirectMessage(igUserId: string, message: string) {
  const igBusinessId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (!igBusinessId) throw new Error('Missing INSTAGRAM_BUSINESS_ACCOUNT_ID')
  await graphPost(`${igBusinessId}/messages`, {
    recipient: { id: igUserId },
    message: { text: message },
  })
}

// --- Campaign matching + interaction tracking -------------------------------

async function findMatchingCampaign(supabase: AdminClient, mediaId: string, commentText: string) {
  const { data: campaigns } = await supabase
    .from('instagram_campaigns')
    .select('*')
    .eq('media_id', mediaId)
    .eq('active', true)

  if (!campaigns?.length) return null

  const lowerText = commentText.toLowerCase()
  return campaigns.find((c) => lowerText.includes(c.keyword.toLowerCase())) ?? null
}

async function handleCommentEvent(supabase: AdminClient, value: CommentChangeValue) {
  const campaign = await findMatchingCampaign(supabase, value.media.id, value.text)
  if (!campaign) return // no active campaign for this post/keyword - ignore, exactly the "don't respond to unrelated comments" requirement

  // Upsert so a duplicate webhook delivery (Meta retries) or the same
  // person commenting twice doesn't send a second round of replies.
  const { data: existing } = await supabase
    .from('instagram_interactions')
    .select('id, state')
    .eq('campaign_id', campaign.id)
    .eq('ig_user_id', value.from.id)
    .maybeSingle()

  if (existing) return // already in the funnel for this campaign - don't re-trigger

  await postPublicReply(value.id, campaign.public_reply_text)
  await postPrivateReply(value.id, campaign.dm_prompt_text)

  await supabase.from('instagram_interactions').insert({
    campaign_id: campaign.id,
    ig_user_id: value.from.id,
    ig_username: value.from.username ?? null,
    comment_id: value.id,
    state: 'dm_sent',
  })
}

async function handleMessagingEvent(supabase: AdminClient, event: MessagingEvent) {
  const text = event.message?.text
  if (!text) return

  // Look up the most recent interaction still waiting on confirmation.
  // A given commenter could in theory be mid-funnel on more than one
  // campaign at once, so this takes the most recently touched one
  // rather than assuming there's only ever one match.
  const { data: interaction } = await supabase
    .from('instagram_interactions')
    .select('id, campaign_id, state, instagram_campaigns(confirm_trigger, file_message_text, file_url)')
    .eq('ig_user_id', event.sender.id)
    .eq('state', 'dm_sent')
    .order('last_event_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!interaction) return

  const campaign = interaction.instagram_campaigns as unknown as {
    confirm_trigger: string
    file_message_text: string
    file_url: string
  } | null
  if (!campaign) return

  if (!text.toLowerCase().includes(campaign.confirm_trigger.toLowerCase())) return

  await sendDirectMessage(event.sender.id, `${campaign.file_message_text}\n${campaign.file_url}`)

  await supabase
    .from('instagram_interactions')
    .update({ state: 'file_sent', last_event_at: new Date().toISOString() })
    .eq('id', interaction.id)
}

// --- Route entry point -------------------------------------------------

export async function POST(req: Request) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const rawBody = await req.text()

  if (!appSecret || !verifySignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    console.error('Instagram webhook signature verification failed')
    return new Response('Invalid signature', { status: 400 })
  }

  const body = JSON.parse(rawBody) as WebhookPayload
  const supabase = createAdminClient()

  // Meta doesn't send one canonical event id the way Stripe/Razorpay do,
  // so build a dedupe key from entry id + timestamp. Good enough to
  // catch Meta's own retry-on-non-2xx behavior; not a strict guarantee
  // against every conceivable duplicate.
  const dedupeKey = `${body.entry?.[0]?.id ?? 'unknown'}-${body.entry?.[0]?.time ?? Date.now()}`
  const { data: already } = await supabase
    .from('instagram_webhook_events')
    .select('event_id')
    .eq('event_id', dedupeKey)
    .maybeSingle()

  if (already) return new Response('Already processed', { status: 200 })

  try {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'comments') {
          await handleCommentEvent(supabase, change.value)
        }
      }
      for (const event of entry.messaging ?? []) {
        await handleMessagingEvent(supabase, event)
      }
    }
  } catch (err) {
    // Logged for investigation, but still marked processed below - same
    // reasoning as the Razorpay webhook: retrying a persistently-broken
    // handler just means Meta hammers this endpoint for hours.
    console.error('Error handling Instagram webhook event', (err as Error).message)
  }

  await supabase.from('instagram_webhook_events').insert({ event_id: dedupeKey, raw_payload: body })

  return new Response('ok', { status: 200 })
}
