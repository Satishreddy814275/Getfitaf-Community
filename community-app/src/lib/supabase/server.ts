import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

// Wrapped in React's cache() so every call to createClient() within a
// single request (root layout, then the page itself, sometimes a
// component below that too) reuses the SAME client instance instead of
// each independently spinning up its own and each calling
// auth.getUser(). That mattered more than it looks: getUser() silently
// refreshes the access token when it's near/past expiry, and several
// of those independent clients racing to refresh using the same
// refresh token at once is a known way to get a session killed
// outright (Supabase's refresh-token rotation treats a reused token as
// a hijack signal) - which looks exactly like "click any nav link,
// get signed out, only fixed by logging back in." This got far more
// visible after force-dynamic + revalidatePath started forcing a
// genuinely fresh render (and fresh getUser() calls) on every single
// navigation instead of some of them being served from cache.
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: '.getfitaf.fitness',
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component - safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    }
  )
})
