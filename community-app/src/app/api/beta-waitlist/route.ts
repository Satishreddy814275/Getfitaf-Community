import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Simple, deliberately dumb email check — good enough to catch typos
// and empty submissions without rejecting valid addresses Zod-style
// regexes tend to choke on (plus-addressing, uncommon TLDs, etc.).
function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// POST-only capture for the /beta waitlist form. Writes to
// public.beta_waitlist rather than pushing straight into the existing
// Mailchimp audience on purpose — that audience's automation trigger
// ("Subscribed to audience") fires the 97-day onboarding drip, which
// is the wrong sequence for someone who's just joined a waitlist. See
// the beta_waitlist migration comment for the full reasoning. Satish
// syncs this list to Mailchimp (or wherever) deliberately, on his own
// timeline, rather than that happening automatically the moment this
// page ships.
export async function POST(req: Request) {
  let email: unknown
  try {
    const body = await req.json()
    email = body?.email
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return Response.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createAdminClient()

  // onConflict on the unique email column — resubmitting the same
  // address (double-click, revisit) is treated as a no-op success
  // rather than an error, since from the visitor's side both cases
  // just mean "you're on the list."
  const { error } = await supabase
    .from('beta_waitlist')
    .upsert({ email: normalizedEmail }, { onConflict: 'email', ignoreDuplicates: true })

  if (error) {
    console.error('beta-waitlist: failed to insert:', error.message)
    return Response.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
