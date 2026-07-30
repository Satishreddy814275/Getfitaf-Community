import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

// Configured once at module load, not per-call - setVapidDetails just
// stores these on the module-level webpush instance, no reason to
// repeat it on every send.
webpush.setVapidDetails(
  'mailto:support@getfitaf.fitness',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export type PushPayload = {
  title: string
  body: string
  // Where a tap should land - an absolute URL (e.g. the learn-portal
  // dashboard, a different origin) or an app-relative path (e.g.
  // /workouts) - the service worker's notificationclick handler treats
  // the two differently (only a relative path can reuse an already-open
  // tab).
  url: string
}

// Sends to every subscription on file for a profile (they can have more
// than one device) and prunes any that the push service reports as
// gone - a 404/410 there means the endpoint itself is dead (uninstalled,
// permission revoked, etc.), not a transient failure, so retrying it
// later would just fail the same way forever if left in the table.
export async function sendPushToProfile(profileId: string, payload: PushPayload): Promise<void> {
  const supabase = createAdminClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId)

  if (!subs || subs.length === 0) return

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        // Any other error (network blip, push service hiccup) is left
        // alone - the subscription might still be good next time.
      }
    })
  )
}
