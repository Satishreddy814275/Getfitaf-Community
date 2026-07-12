// Sends Satish an email the moment a Stripe payment can't be matched
// to a GetFit AF account (e.g. paid with a different email than they
// signed up with). Uses the Resend API directly via fetch — same
// approach already used in the workout builder's send-email.js, no
// extra dependency needed.
//
// Best-effort: if RESEND_API_KEY isn't set or the send fails, this
// logs it and does NOT throw — a notification failure should never
// stop the webhook from finishing its actual job of processing the
// Stripe event.
export async function notifyUnmatchedPayment(details: {
  stripeCustomerId: string | null
  stripeCustomerEmail: string | null
  eventType: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('RESEND_API_KEY not set — skipping unmatched payment email')
    return
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'GetFitAF Alerts <satish@getfitaf.fitness>',
        to: ['satish@getfitaf.fitness'],
        subject: `⚠️ Unmatched Stripe payment (${details.eventType})`,
        html: `
          <p>A Stripe event came in that couldn't be matched to a GetFit AF account.</p>
          <ul>
            <li><strong>Event type:</strong> ${details.eventType}</li>
            <li><strong>Stripe customer email:</strong> ${details.stripeCustomerEmail || 'not provided'}</li>
            <li><strong>Stripe customer ID:</strong> ${details.stripeCustomerId || 'not provided'}</li>
          </ul>
          <p>This usually means someone paid with a different email than the one they signed up with, or paid before creating an account. It's logged in the <code>unmatched_stripe_payments</code> table in Supabase — find the matching account and grant them access manually from /admin/members.</p>
        `,
      }),
    })

    if (!res.ok) {
      console.error('Failed to send unmatched-payment email:', await res.text())
    }
  } catch (err) {
    console.error('Failed to send unmatched-payment email:', (err as Error).message)
  }
}
