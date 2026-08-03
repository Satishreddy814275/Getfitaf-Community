import { createAdminClient } from '@/lib/supabase/admin'

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

// Real count of the 50 beta spots actually taken - the live-state copy
// on /beta ("Doors are open - 50 spots") used to be a static string
// that could never reflect reality. Excludes anyone flagged
// profiles.is_test (Satish's own testing accounts, confirmed
// 2026-08-03 - see the add_profiles_is_test_flag migration) so his own
// checkout testing doesn't silently eat into the real cap shown to
// prospects. Small dataset (a 50-spot cohort) even at full capacity,
// so filtering the joined rows in JS rather than trying to push an
// embedded-resource filter into a head-count query is simpler and just
// as fast here.
export async function getBetaEnrolledCount(): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('space_memberships')
    .select('profile_id, profiles!inner(is_test)')
    .eq('space', 'low_ticket')
  const rows = (data as { profile_id: string; profiles: { is_test: boolean } | null }[] | null) || []
  return rows.filter((r) => !r.profiles?.is_test).length
}
