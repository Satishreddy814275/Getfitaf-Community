import { createBrowserClient } from '@supabase/ssr'

// cookieOptions.domain is set to the root domain (with a leading dot) so
// the session cookie is shared across every subdomain of getfitaf.fitness
// (learn.getfitaf.fitness, community.getfitaf.fitness, etc.) — signing in
// on one subdomain signs you in on all of them.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: '.getfitaf.fitness',
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    }
  )
}
