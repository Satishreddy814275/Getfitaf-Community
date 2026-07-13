'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Only ever redirect to a relative in-app path ("/admin", not
// "https://evil.example.com") - formData is client-controlled, so this
// guards against it being tampered with into an open redirect.
function safeNextPath(formData: FormData): string {
  const next = formData.get('next') as string | null
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/feed'
}

export async function signIn(formData: FormData) {
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

  redirect(next)
}

export async function signUp(formData: FormData) {
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

  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
