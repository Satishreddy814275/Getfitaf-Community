import { createAdminClient } from '@/lib/supabase/admin'
import { syncToMailchimp } from '@/lib/syncToMailchimp'

export const runtime = 'nodejs'

// Simple, deliberately dumb email check — good enough to catch typos
// and empty submissions without rejecting valid addresses Zod-style
// regexes tend to choke on (plus-addressing, uncommon TLDs, etc.).
function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// POST-only capture for the /beta waitlist form. Writes to
// public.beta_waitlist first, then best-effort syncs to a dedicated
// "Community Beta Waitlist" Mailchimp audience (see syncToMailchimp.ts)
// — deliberately NOT the main GetFit AF audience, whose automation
// trigger ("Subscribed to audience") fires the 97-day onboarding drip,
// the wrong sequence for someone who's just joined a waitlist. See the
// beta_waitlist migration comment for the original reasoning.
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

  // Best-effort - see syncToMailchimp.ts for why this never throws and
  // never blocks the signup response on its own account.
  await syncToMailchimp(normalizedEmail)

  return Response.json({ ok: true })
}
