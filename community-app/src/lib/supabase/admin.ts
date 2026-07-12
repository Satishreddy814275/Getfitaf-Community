import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client for server-only code that needs to bypass RLS —
// the Stripe webhook and the trial-expiry cron job, specifically.
// Never import this into anything that runs in the browser or that
// handles a normal user request; it has full read/write access to
// every table regardless of policy.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
