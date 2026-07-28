import type { createClient } from './supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Shared "does this person already have access" check - used to keep
// existing members away from the /beta marketing/checkout pages (see
// beta/page.tsx, beta/pay/page.tsx) and, more importantly, as the
// actual server-side guard inside createRazorpaySubscription
// (razorpay-actions.ts) against creating and charging for a second
// real subscription for someone who's already a paying/premium member.
// Mirrors the same premium (profiles.approved) + low_ticket
// (space_memberships) check already used in feed/page.tsx to compute
// availableSpaces - admins always count as having access too.
export async function hasExistingAccess(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_admin, approved').eq('id', userId).single(),
    supabase
      .from('space_memberships')
      .select('space')
      .eq('profile_id', userId)
      .eq('space', 'low_ticket')
      .maybeSingle(),
  ])

  return !!profile?.is_admin || !!profile?.approved || !!membership
}
