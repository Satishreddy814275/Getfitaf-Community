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
