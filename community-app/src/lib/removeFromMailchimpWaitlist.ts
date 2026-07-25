import crypto from 'crypto'

// Removes someone from the Mailchimp waitlist sequence the moment they
// actually convert (Stripe subscription created) - see
// src/app/api/stripe-webhook/route.ts's handleSubscriptionCreated.
// Without this, a paying member would keep receiving the Day 4+
// pre-launch emails and "X days to go" countdown broadcasts even
// though they already have a spot - confusing at best.
//
// Sets status to 'unsubscribed' rather than deleting/archiving the
// member outright - this immediately pulls them out of any active
// automation and excludes them from future one-time campaigns sent to
// this audience (Mailchimp's documented behavior for list-specific
// unsubscribes), while keeping their contact record intact in case
// it's ever needed. Only affects the Community Beta Waitlist list -
// has no effect on any other Mailchimp audience the same email might
// be on.
//
// Best-effort, same pattern as syncToMailchimp.ts - a Mailchimp hiccup
// here should never break the actual subscription-granting logic in
// the webhook.
export async function removeFromMailchimpWaitlist(email: string | null | undefined) {
  if (!email) return

  const apiKey = process.env.MAILCHIMP_API_KEY
  const listId = process.env.MAILCHIMP_BETA_WAITLIST_LIST_ID

  if (!apiKey || !listId) {
    console.error('Mailchimp env vars not set — skipping waitlist removal')
    return
  }

  // Mailchimp API keys end in "-<datacenter>" (e.g. "...-us15") - the
  // API host is that datacenter subdomain, not a fixed address.
  const dc = apiKey.split('-').pop()
  if (!dc) {
    console.error('Mailchimp API key missing datacenter suffix (e.g. "-us15") — skipping removal')
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  // Mailchimp addresses each member by the MD5 hash of their lowercased
  // email - same identifier syncToMailchimp.ts uses to upsert them.
  const subscriberHash = crypto.createHash('md5').update(normalizedEmail).digest('hex')

  try {
    const res = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // Mailchimp accepts any string as the basic-auth username -
          // only the API key (password) is actually checked.
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
        },
        body: JSON.stringify({ status: 'unsubscribed' }),
      }
    )

    if (!res.ok) {
      // A 404 here just means this email was never on the waitlist to
      // begin with (e.g. someone who paid without ever joining it) -
      // not worth logging as an error.
      if (res.status !== 404) {
        console.error(
          'Failed to remove converted member from Mailchimp waitlist:',
          await res.text()
        )
      }
    }
  } catch (err) {
    console.error(
      'Failed to remove converted member from Mailchimp waitlist:',
      (err as Error).message
    )
  }
}
