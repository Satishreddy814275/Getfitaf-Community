'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

// Only ever redirect to a relative in-app path ("/admin", not
// "https://evil.example.com") - formData is client-controlled, so this
// guards against it being tampered with into an open redirect.
function safeNextPath(formData: FormData): string {
  const next = formData.get('next') as string | null
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/feed'
}

// Supabase splits the session into numbered "sb-<ref>-auth-token.0",
// ".1" etc. cookies when it's too large for one, and its own
// signOut() only clears whatever chunk count the CURRENT session
// happens to have. If a previous session was chunked differently, a
// leftover chunk can survive a sign-out and then sit alongside the
// next sign-in's cookies - Supabase tries to reassemble all of them
// into one token, gets a corrupted mix of two different sessions, and
// rejects it outright ("AuthSessionMissingError", confirmed via the
// Vercel log on 2026-07-13: a bare auth-token cookie sitting next to
// .0/.1 chunks from a different session). Sweeping every matching
// cookie name - not just the ones the current client thinks exist -
// guarantees a genuinely clean slate. Run before signing in (so anyone
// already stuck in a corrupted state self-heals on their next login,
// no manual cookie-clearing needed) and after signing out (so it never
// happens in the first place).
async function clearStaleAuthCookies() {
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
      cookieStore.set(cookie.name, '', { domain: '.getfitaf.fitness', path: '/', maxAge: 0 })
    }
  }
}

export async function signIn(formData: FormData) {
  await clearStaleAuthCookies()
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const next = safeNextPath(formData)

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Logged server-side (visible in Vercel's Runtime Logs) so the real
    // cause is always visible somewhere, even in cases where the
    // message shown to the user ends up unhelpful.
    console.error('Sign in error:', error.name, error.status, error.message)
    const message = error.message?.trim() || `Sign in failed (${error.status ?? 'unknown error'}).`
    redirect(`/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`)
  }

  // Purges Next's client-side Router Cache for every route under the
  // root layout - without this, switching accounts in the same
  // browser tab (sign out, sign in as someone else) can leave stale,
  // previous-session renders cached for routes you haven't hard-
  // reloaded yet, e.g. clicking Admin right after logging back in as
  // the real admin serving a cached "not admin, redirect to /feed"
  // result from the account you were just testing with.
  revalidatePath('/', 'layout')

  redirect(next)
}

export async function signUp(formData: FormData) {
  await clearStaleAuthCookies()
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const next = safeNextPath(formData)

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })

  if (error) {
    console.error('Sign up error:', error.name, error.status, error.message)
    const message = error.message?.trim() || `Sign up failed (${error.status ?? 'unknown error'}).`
    redirect(`/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`)
  }

  // If email confirmation is required, Supabase returns no error but
  // also no active session — data.session is null until the user
  // clicks the confirmation link in their inbox. Without this check,
  // that case silently redirects to /feed, which immediately bounces
  // back to /login with no explanation (exactly the confusing "back to
  // login page for no visible reason" behaviour this replaces).
  if (!data.session) {
    redirect(
      `/login?error=${encodeURIComponent('Check your email to confirm your account before signing in.')}&next=${encodeURIComponent(next)}`
    )
  }

  revalidatePath('/', 'layout')
  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  await clearStaleAuthCookies()
  // Same reasoning as signIn/signUp above - clears cached, session-
  // dependent renders so the next person to sign in on this browser
  // (or the same person switching accounts) never sees a stale view
  // left over from whoever was signed in before.
  revalidatePath('/', 'layout')
  redirect('/login')
}
