import { permanentRedirect } from 'next/navigation'

// /join was built around an older plan (a 7-day free trial, no
// coupon, via a placeholder Stripe Payment Link that was never filled
// in) and was never deployed or linked anywhere live. /beta now
// implements the real model end to end - ₹249 first month via a
// silently-applied coupon, then the regular monthly rate, no trial
// (see /api/beta-checkout) - so there's no reason to finish two
// separate checkout pages for the same membership. Redirecting here
// instead, so there's exactly one live checkout path to maintain.
//
// If /join gets repurposed later (Satish has floated turning it into
// a dedicated free-trial-then-convert page), replace this redirect
// with real content then - the old implementation is still in git
// history if any of it is worth salvaging.
export default function JoinPage() {
  permanentRedirect('/beta')
}
