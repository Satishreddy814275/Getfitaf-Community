'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, signUp } from './actions'

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const params = useSearchParams()
  const error = params.get('error')

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

          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition text-sm mt-2"
          >
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

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
