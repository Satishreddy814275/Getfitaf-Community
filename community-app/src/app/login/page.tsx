'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, signUp } from './actions'

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const params = useSearchParams()
  const error = params.get('error')

  return (
    <div className="max-w-sm mx-auto py-16 px-4">
      <h1 className="text-2xl font-bold text-center">GetFit AF Community</h1>
      <p className="text-sm text-gray-500 text-center mt-1">
        {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <form action={mode === 'signin' ? signIn : signUp} className="mt-6 space-y-3">
        {mode === 'signup' && (
          <input
            name="full_name"
            placeholder="Full name"
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        )}
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={6}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="w-full bg-black text-white text-sm font-medium py-2 rounded-lg"
        >
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="w-full text-center text-sm text-gray-500 mt-4"
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
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
