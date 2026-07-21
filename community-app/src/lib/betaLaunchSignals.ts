import { createAdminClient } from '@/lib/supabase/admin'

// Satish's own profile row - used for the real photo in the "who's
// behind this" section on /beta. Hardcoded id rather than a "find the
// admin" query, for the same reason betaProgramPreviews.ts hardcodes
// template ids: several other accounts also have is_admin=true (coach
// team members), so picking "an admin" isn't the same as picking
// Satish specifically. Confirmed against the live DB on 2026-07-21.
const SATISH_PROFILE_ID = 'b33964b5-c46b-4ff3-8e3f-43c4f36a63ea'

export async function getCoachPhotoUrl(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', SATISH_PROFILE_ID)
    .maybeSingle()
  return data?.avatar_url || null
}

// Real signup count from the waitlist - honest social proof rather
// than a fabricated number (see the /beta copy-review conversation).
// Callers should treat 0 as "don't show a counter at all" rather than
// literally rendering "0 people on the waitlist," which would work
// against the page rather than for it.
export async function getWaitlistCount(): Promise<number> {
  const supabase = createAdminClient()
  const { count } = await supabase.from('beta_waitlist').select('*', { count: 'exact', head: true })
  return count || 0
}
