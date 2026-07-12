import { createHmac, timingSafeEqual } from 'crypto'

// Generates a short-lived, signed "this really is a logged-in member"
// handoff for the workout builder (a separate static site with no
// shared session/cookie access of its own). Rather than trying to
// make the workout builder read community-app's Supabase session
// cookie directly — fragile, since community-app uses @supabase/ssr's
// cookie-based storage while a plain client-side Supabase client
// defaults to localStorage, which isn't shared across subdomains —
// this signs a small, tamper-proof token server-side here, and the
// workout builder's api/generate.js verifies it independently using
// the same shared secret. Neither side needs to know anything about
// the other's session internals.
//
// WORKOUT_BUILDER_HANDOFF_SECRET must be set to the exact same value
// in both this project's Vercel env vars AND the workout builder
// project's Vercel env vars — it's how the two separate apps agree
// the token is genuine without sharing a database call.
// 60 minutes — long enough to actually read and fill out the intake
// form (name, email, gender, level, goal, equipment, days, cardio,
// injuries, notes) without the token quietly expiring mid-fill and
// silently downgrading to an unverified/anonymous visit with no error
// shown. This only identifies an email for cap-tracking purposes, not
// anything sensitive like a payment, so there's no real security
// reason to keep this as tight as the original 5 minutes.
const HANDOFF_TTL_MS = 60 * 60 * 1000

function getSecret() {
  const secret = process.env.WORKOUT_BUILDER_HANDOFF_SECRET
  if (!secret) throw new Error('Missing WORKOUT_BUILDER_HANDOFF_SECRET')
  return secret
}

function sign(payload: string) {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

export function createWorkoutBuilderHandoffUrl(email: string) {
  const payload = JSON.stringify({ email, exp: Date.now() + HANDOFF_TTL_MS })
  const encodedPayload = Buffer.from(payload).toString('base64url')
  const signature = sign(encodedPayload)
  const token = `${encodedPayload}.${signature}`
  return `https://workoutbuilder.getfitaf.fitness/?token=${encodeURIComponent(token)}`
}

// Not currently used on this side (verification happens in the
// workout builder's own api/generate.js, which doesn't share this
// TypeScript file) — kept here so the signing and verification logic
// live side by side for anyone reading this later, and in case this
// app ever needs to verify a token itself.
export function verifyWorkoutBuilderHandoffToken(token: string): string | null {
  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = sign(encodedPayload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expectedSignature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const { email, exp } = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString())
    if (typeof email !== 'string' || typeof exp !== 'number') return null
    if (Date.now() > exp) return null
    return email
  } catch {
    return null
  }
}
