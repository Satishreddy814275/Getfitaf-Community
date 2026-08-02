'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { convertWeightToKgForStorage } from '@/lib/weightUnit'
import { sendPushToProfile } from '@/lib/push'

// How far back a brand-new subscriber's one-time "catch up" push (see
// savePushSubscription below) will look for something to surface.
// Deliberately not the same "48h" a live announcement push goes out
// under - this is a one-time nudge on first-ever enable, not a
// same-day alert, so it can afford to look back further; but it still
// needs *some* ceiling so someone enabling push months from now
// doesn't get resurfaced a long-stale post as if it just happened.
const CATCH_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Deliberately name + avatar only — no email editing here. Email is tied
// to how Supabase authenticates the account itself, and self-service
// changes to it would need a verification flow (confirm the new
// address) to avoid lockouts or account-hijack scenarios. That's a
// separate, more careful feature for later if it ever becomes a common
// request — for now, email changes stay a manual admin action.
export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const fullName = ((formData.get('full_name') as string) || '').trim()
  const avatarUrl = (formData.get('avatar_url') as string) || null
  // Guarded against anything but the two real values, rather than
  // trusting the submitted string outright - the DB's own CHECK
  // constraint would reject a bad value anyway, but failing silently
  // here (falling back to the current preference) is friendlier than
  // a thrown error over a settings field this low-stakes.
  const weightUnitRaw = formData.get('weight_unit') as string | null
  const weightUnit = weightUnitRaw === 'kg' || weightUnitRaw === 'lbs' ? weightUnitRaw : null

  const update: { full_name?: string; avatar_url?: string; weight_unit?: string } = {}
  if (fullName) update.full_name = fullName
  if (avatarUrl) update.avatar_url = avatarUrl
  if (weightUnit) update.weight_unit = weightUnit

  if (Object.keys(update).length === 0) return

  await supabase.from('profiles').update(update).eq('id', user.id)

  revalidatePath('/profile')
  revalidatePath('/feed')
  revalidatePath('/admin')
  revalidatePath('/leaderboard')
  revalidatePath('/workouts')
}

// One entry per calendar day - logging again the same day overwrites
// (upsert on profile_id + logged_date) rather than adding a second
// point, since multiple weigh-ins in a day don't add anything to a
// trend line. logged_date is the member's own local calendar date,
// passed in from the client rather than computed from the server
// clock - "today" should follow the device the member is standing on
// the scale next to, not wherever the server happens to be.
export async function logBodyWeight(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const weightRaw = formData.get('weight') as string | null
  const unitRaw = formData.get('unit') as string | null
  const dateRaw = formData.get('logged_date') as string | null

  const weight = weightRaw ? parseFloat(weightRaw) : NaN
  if (!Number.isFinite(weight) || weight <= 0) return

  const unit = unitRaw === 'lbs' ? 'lbs' : 'kg'
  const loggedDate =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : new Date().toISOString().slice(0, 10)
  const weightKg = convertWeightToKgForStorage(weight, unit)

  await supabase.from('body_weight_logs').upsert(
    {
      profile_id: user.id,
      weight_kg: weightKg,
      logged_date: loggedDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,logged_date' }
  )

  revalidatePath('/profile')
  revalidatePath('/admin')
}

// Push notification subscriptions - a member can have more than one
// (phone + laptop, say), so this is an upsert keyed on the endpoint
// itself (unique per subscription, not per profile) rather than one
// row per profile.
export async function savePushSubscription(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Deliberately checking `error` here (unlike most other writes in
  // this file) - the caller (PushNotificationsRow/Banner) treats a
  // resolved promise as "saved, show Enabled" with no other signal.
  // Before this check, an RLS failure here (e.g. the missing UPDATE
  // policy on this table, fixed 2026-08-02) would upsert silently, the
  // browser would still have a real push subscription, and the UI
  // would show "Enabled" forever even though no row - and therefore no
  // future push - ever existed server-side.
  // Checked BEFORE the upsert below - this is how "first-ever
  // subscription" (see the catch-up push further down) is told apart
  // from "already had one, just adding a second device/browser." Doing
  // this check after the upsert would always see the row that upsert
  // itself just wrote.
  const { count: existingSubCount } = await supabase
    .from('push_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
  const isFirstEverSubscription = !existingSubCount

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error

  revalidatePath('/profile')

  // One-time "welcome, here's what you missed" nudge (Satish,
  // 2026-08-02) - someone who enables push for the first time after an
  // admin has already posted something would otherwise never see that
  // post as a push, since the admin-post-push feature only fires at
  // the moment of posting. Deliberately best-effort: any failure here
  // (no recent post, query hiccup) must never surface as a failure of
  // the subscription save itself, which already fully succeeded above.
  if (isFirstEverSubscription) {
    try {
      await sendCatchUpPush(user.id)
    } catch (err) {
      console.error('push: catch-up notification failed', err)
    }
  }
}

// Finds and sends the single most recent admin post (within
// CATCH_UP_WINDOW_MS) in a space this member actually has access to -
// same per-space-audience reasoning as notifyAdminPost in
// feed/actions.ts, just resolved for one specific new subscriber
// instead of fanned out to everyone. Only the ONE most recent post,
// never a backlog - stacking multiple catch-up pushes on someone's
// very first notification would be a bad first impression, not a
// welcome-back nudge.
async function sendCatchUpPush(profileId: string): Promise<void> {
  const supabase = await createClient()

  const [{ data: profileRow }, { data: memberships }, { data: adminProfiles }] = await Promise.all([
    supabase.from('profiles').select('approved').eq('id', profileId).single(),
    supabase.from('space_memberships').select('space').eq('profile_id', profileId),
    supabase.from('profiles').select('id').eq('is_admin', true),
  ])

  const spaces: string[] = []
  if (profileRow?.approved) spaces.push('premium')
  if ((memberships || []).some((m) => m.space === 'low_ticket')) spaces.push('low_ticket')
  const adminIds = (adminProfiles || []).map((p) => p.id)

  if (spaces.length === 0 || adminIds.length === 0) return

  const cutoff = new Date(Date.now() - CATCH_UP_WINDOW_MS).toISOString()
  const { data: recentPost } = await supabase
    .from('posts')
    .select('id, author_id, content')
    .in('author_id', adminIds)
    .in('space', spaces)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Own post (an admin enabling push on a fresh device shouldn't get
  // notified about themselves) or nothing recent enough - nothing to
  // send.
  if (!recentPost || recentPost.author_id === profileId) return

  const { data: authorProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', recentPost.author_id)
    .single()

  const preview = (recentPost.content || '').split('\n')[0].replace(/\*\*/g, '').slice(0, 120)

  await sendPushToProfile(profileId, {
    title: `${authorProfile?.full_name || 'GetFit AF'} posted`,
    body: preview || 'Tap to see the new post.',
    url: `/feed?post=${recentPost.id}`,
  })
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  // Scoped to this member's own rows even though endpoint is already
  // unique - belt and suspenders against ever deleting someone else's
  // subscription via a tampered request.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('profile_id', user.id)

  revalidatePath('/profile')
}
