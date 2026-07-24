import crypto from 'crypto'

// Adds a beta-waitlist signup to the dedicated "Community Beta Waitlist"
// Mailchimp audience (MAILCHIMP_BETA_WAITLIST_LIST_ID) - deliberately NOT
// the main GetFit AF audience. That one's "GetfitAF Lessons" automation
// has a "Contact signs up to GetFit AF" entry trigger that fires for ANY
// new subscriber to that audience regardless of tags, which would queue
// waitlist joiners into the 97-day lesson drip - wrong sequence entirely.
// A separate audience sidesteps that without touching the existing flow.
//
// Best-effort, same pattern as notifyUnmatchedPayment.ts: a Mailchimp
// API key is account-wide (not scoped to one audience), so reusing the
// key already issued for the main audience here is expected - the list
// ID in the URL is what decides which audience gets written to. A
// Mailchimp hiccup should never fail the actual waitlist signup, so
// this logs and returns rather than throwing.
export async function syncToMailchimp(email: string) {
  const apiKey = process.env.MAILCHIMP_API_KEY
  const listId = process.env.MAILCHIMP_BETA_WAITLIST_LIST_ID

  if (!apiKey || !listId) {
    console.error('Mailchimp env vars not set — skipping waitlist sync')
    return
  }

  // Mailchimp API keys end in "-<datacenter>" (e.g. "...-us15") - the
  // API host is that datacenter subdomain, not a fixed address.
  const dc = apiKey.split('-').pop()
  if (!dc) {
    console.error('Mailchimp API key missing datacenter suffix (e.g. "-us15") — skipping sync')
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  // Mailchimp addresses each member by the MD5 hash of their lowercased
  // email - this is how their upsert-by-PUT convention identifies an
  // existing member vs. creating a new one.
  const subscriberHash = crypto.createHash('md5').update(normalizedEmail).digest('hex')

  try {
    const res = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // Mailchimp accepts any string as the basic-auth username -
          // only the API key (password) is actually checked.
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
        },
        body: JSON.stringify({
          email_address: normalizedEmail,
          // Only applies to brand-new members - resubmitting an address
          // that already unsubscribed themselves from this audience
          // won't silently flip them back to subscribed.
          status_if_new: 'subscribed',
        }),
      }
    )

    if (!res.ok) {
      console.error('Failed to sync waitlist signup to Mailchimp:', await res.text())
    }
  } catch (err) {
    console.error('Failed to sync waitlist signup to Mailchimp:', (err as Error).message)
  }
}
