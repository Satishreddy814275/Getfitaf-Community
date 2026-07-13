'use client'

import { Suspense, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { signIn, signUp } from './actions'
import { createClient } from '@/lib/supabase/client'

// useFormStatus only works from a component rendered inside the
// <form> it's tracking, not the form itself — hence pulling this out
// separately rather than just adding a useState in LoginForm. This is
// what was missing before: the button just said "Sign in" the whole
// time, with nothing to show a submission was actually happening.
// Client-side equivalent of clearStaleAuthCookies() in login/actions.ts
// - magic link and Google sign-in run entirely in the browser and
// never touch that server action, so without this they'd skip the
// same stale-cookie-chunk cleanup and could reintroduce the exact
// "AuthSessionMissingError" corruption that fix was for.
function clearStaleAuthCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name.startsWith('sb-') && name.includes('auth-token')) {
      document.cookie = `${name}=; domain=.getfitaf.fitness; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    }
  })
}

function SubmitButton({ mode }: { mode: 'signin' | 'signup' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition text-sm mt-2 disabled:opacity-50"
    >
      {pending
        ? mode === 'signin'
          ? 'Signing in...'
          : 'Creating account...'
        : mode === 'signin'
          ? 'Sign in'
          : 'Create account'}
    </button>
  )
}

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [magicLinkStatus, setMagicLinkStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle'
  )
  const [magicLinkError, setMagicLinkError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const params = useSearchParams()
  const error = params.get('error')
  const next = params.get('next')

  // Despite the "forgot password" framing, this is a magic-link sign
  // in (signInWithOtp) rather than an actual password reset — it lets
  // you in via an emailed link without ever touching your password,
  // same as learn.getfitaf.fitness already does. Simpler than a real
  // reset flow (no separate "set new password" page needed) and
  // solves the same underlying problem.
  async function handleMagicLink() {
    if (!email.trim()) {
      setMagicLinkStatus('error')
      setMagicLinkError('Enter your email above first.')
      return
    }
    setMagicLinkStatus('sending')
    clearStaleAuthCookies()
    const supabase = createClient()
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (otpError) {
      setMagicLinkStatus('error')
      setMagicLinkError(otpError.message)
    } else {
      setMagicLinkStatus('sent')
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    clearStaleAuthCookies()
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) {
      setGoogleLoading(false)
      setMagicLinkStatus('error')
      setMagicLinkError(oauthError.message)
    }
    // On success the page is redirecting away to Google, so leave
    // googleLoading true rather than resetting it — nothing to reset to.
  }

  return (
    <div className="w-full max-w-md mx-auto py-16 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-white tracking-tight">
          GET<span className="text-orange-500">FIT</span> AF
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Client Community</p>
      </div>

      <div className="glass rounded-2xl p-8">
        <h2 className="text-white text-xl font-bold mb-6">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <form action={mode === 'signin' ? signIn : signUp} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          {mode === 'signup' && (
            <div>
              <label className="text-zinc-400 text-sm block mb-1.5">Full name</label>
              <input
                name="full_name"
                placeholder="Your name"
                required
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
              />
            </div>
          )}
          <div>
            <label className="text-zinc-400 text-sm block mb-1.5">Email</label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
            />
          </div>
          <div>
            <label className="text-zinc-400 text-sm block mb-1.5">Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <SubmitButton mode={mode} />
        </form>

        {mode === 'signin' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={magicLinkStatus === 'sending'}
              className="text-zinc-500 hover:text-orange-500 text-xs transition disabled:opacity-50"
            >
              {magicLinkStatus === 'sending'
                ? 'Sending...'
                : 'Forgot password? Send me a magic link'}
            </button>
            {magicLinkStatus === 'sent' && (
              <p className="text-green-400 text-xs mt-2">
                Magic link sent — check your inbox.
              </p>
            )}
            {magicLinkStatus === 'error' && (
              <p className="text-red-400 text-xs mt-2">{magicLinkError}</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-zinc-600 text-xs">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold py-3 rounded-xl transition text-sm disabled:opacity-50"
        >
          {googleLoading ? (
            <span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
          )}
          {googleLoading ? 'Redirecting to Google...' : 'Sign in with Google'}
        </button>

        <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-zinc-500 hover:text-orange-500 text-sm transition"
          >
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>

      <p className="text-center text-zinc-700 text-xs mt-6">
        Same login as learn.getfitaf.fitness
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
