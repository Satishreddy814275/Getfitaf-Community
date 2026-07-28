// Razorpay counterpart to notifyUnmatchedPayment.ts (Stripe) - sends
// Satish an email the moment a Razorpay event can't be matched to a
// GetFit AF account. Kept as a separate file rather than a shared/
// generic one so each gateway's field names and table name stay
// explicit in the email body rather than genericized.
//
// Best-effort: if RESEND_API_KEY isn't set or the send fails, this
// logs it and does NOT throw - a notification failure should never
// stop the webhook from finishing its actual job of processing the
// Razorpay event.
export async function notifyUnmatchedRazorpayPayment(details: {
  razorpayCustomerId: string | null
  razorpayCustomerEmail: string | null
  eventType: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('RESEND_API_KEY not set — skipping unmatched Razorpay payment email')
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
        subject: `⚠️ Unmatched Razorpay payment (${details.eventType})`,
        html: `
          <p>A Razorpay event came in that couldn't be matched to a GetFit AF account.</p>
          <ul>
            <li><strong>Event type:</strong> ${details.eventType}</li>
            <li><strong>Razorpay customer email:</strong> ${details.razorpayCustomerEmail || 'not provided'}</li>
            <li><strong>Razorpay customer ID:</strong> ${details.razorpayCustomerId || 'not provided'}</li>
          </ul>
          <p>This usually means someone paid with a different email than the one they signed up with, or paid before creating an account. It's logged in the <code>unmatched_razorpay_payments</code> table in Supabase — find the matching account and grant them access manually from /admin/members.</p>
        `,
      }),
    })

    if (!res.ok) {
      console.error('Failed to send unmatched-Razorpay-payment email:', await res.text())
    }
  } catch (err) {
    console.error('Failed to send unmatched-Razorpay-payment email:', (err as Error).message)
  }
}
