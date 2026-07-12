import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Safety net alongside the Stripe webhook (src/app/api/stripe-webhook),
// not a replacement for it. The webhook should already flip a trial to
// 'active' on successful payment or delete it on
// customer.subscription.deleted — this just catches anything that
// slips through (a missed webhook delivery, Stripe taking longer than
// expected to fire the cancellation event, etc.) so nobody ever ends
// up with free access past their 7-day trial by accident.
//
// Runs once daily via Vercel Cron (see vercel.json). Vercel
// automatically sends `Authorization: Bearer <CRON_SECRET>` on
// cron-triggered requests when CRON_SECRET is set as an env var —
// checked below so this endpoint can't be triggered by anyone else.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabase = createAdminClient()

  const { data: expired, error } = await supabase
    .from('space_memberships')
    .select('id, profile_id')
    .eq('space', 'low_ticket')
    .eq('status', 'trialing')
    .lt('trial_ends_at', new Date().toISOString())

  if (error) {
    console.error('expire-trials: failed to query expired trials', error.message)
    return new Response('Query failed', { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return new Response('No expired trials', { status: 200 })
  }

  const { error: deleteError } = await supabase
    .from('space_memberships')
    .delete()
    .in(
      'id',
      expired.map((row) => row.id)
    )

  if (deleteError) {
    console.error('expire-trials: failed to revoke expired trials', deleteError.message)
    return new Response('Delete failed', { status: 500 })
  }

  console.log(`expire-trials: revoked ${expired.length} expired trial(s)`)
  return new Response(`Revoked ${expired.length} expired trial(s)`, { status: 200 })
}
