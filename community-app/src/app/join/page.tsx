import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

// TODO(Satish): paste your ₹499/mo Payment Link URL here. Before
// going live, double-check in the Stripe Dashboard that this Price
// has the 7-day free trial toggle turned on - the "Start Free 7-Day
// Trial" copy below only holds true if it does. Also don't go live
// with this until the Stripe webhook (src/app/api/stripe-webhook) is
// deployed and its env vars are set - otherwise trials will start in
// Stripe but access won't be granted automatically on this end.
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/REPLACE_ME'

const CONTACT_EMAIL = 'satish@getfitaf.fitness'
const INSTAGRAM_HANDLE = '@getfitaf_satish'
const INSTAGRAM_URL = 'https://www.instagram.com/getfitaf_satish/'

export default async function JoinPage() {
  // If someone lands here already logged in but with no active
  // membership (most commonly: signed up but never paid, or a
  // premium 1-on-1 client who stumbled onto community.getfitaf.fitness
  // directly instead of coming through learn.getfitaf.fitness), show
  // them a note explaining that instead of just silently showing the
  // generic sales page. See src/app/feed/page.tsx, which is what
  // actually sends people here in that situation.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isLoggedIn = false
  let hasNoAccess = false

  if (user) {
    isLoggedIn = true
    const [profileRes, membershipRes] = await Promise.all([
      supabase.from('profiles').select('approved, is_admin').eq('id', user.id).single(),
      supabase
        .from('space_memberships')
        .select('space')
        .eq('profile_id', user.id)
        .eq('space', 'low_ticket')
        .maybeSingle(),
    ])
    const isApproved = !!profileRes.data?.approved
    const isAdmin = !!profileRes.data?.is_admin
    const hasLowTicket = !!membershipRes.data
    hasNoAccess = !isApproved && !isAdmin && !hasLowTicket
  }

  return (
    <div className="min-h-full bg-[#0a0a0a]">
      <div className="w-full max-w-lg mx-auto py-16 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            GET<span className="text-orange-500">FIT</span> AF
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Community Membership</p>
          <p className="text-zinc-600 text-xs mt-2">
            7 years coaching experience · ACE Certified Personal Trainer · Precision Nutrition
            Master Health Coach
          </p>
        </div>

        {isLoggedIn && hasNoAccess && (
          <div className="mb-6 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 space-y-2">
            <p className="text-white text-sm font-semibold">
              Looks like you don&apos;t have an active membership yet
            </p>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Waiting on approval for the 1-on-1 coaching program? Hang tight - approvals usually
              go through within 12-24 hours.
            </p>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Looking for 1-on-1 coaching but haven&apos;t started yet? DM me on Instagram{' '}
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 transition"
              >
                {INSTAGRAM_HANDLE}
              </a>{' '}
              and I&apos;ll get you sorted.
            </p>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Just want the workout builder + community? Start your free trial below.
            </p>
          </div>
        )}

        <div className="glass rounded-2xl p-8">
          <p className="text-orange-500 text-sm font-semibold mb-1">
            7-day free trial, then ₹499/month
          </p>
          <h2 className="text-white text-xl font-bold mb-4">Join the GetFit AF Community</h2>

          <ul className="space-y-2.5 text-sm text-zinc-300 mb-6">
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>
                A personalized workout, built for you based on your goals and the equipment you
                have
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>Daily lessons on nutrition and training, delivered to keep you moving forward</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>A community to bring your questions and progress to - not doing this alone</span>
            </li>
          </ul>

          <div className="border-t border-zinc-800 pt-6">
            <h3 className="text-white text-sm font-bold mb-4">How to join</h3>

            <div className="space-y-4">
              {!isLoggedIn && (
                <div>
                  <p className="text-zinc-400 text-sm mb-2">
                    <span className="text-white font-semibold">Step 1.</span> Create your account
                  </p>
                  <Link
                    href="/login"
                    className="inline-block text-sm font-medium text-orange-500 hover:text-orange-400 transition"
                  >
                    Sign up here →
                  </Link>
                </div>
              )}

              <div>
                <p className="text-zinc-400 text-sm mb-2">
                  <span className="text-white font-semibold">Step {isLoggedIn ? 1 : 2}.</span>{' '}
                  Start your free trial
                </p>

                <a
                  href={STRIPE_PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition text-sm mb-3"
                >
                  Start Free 7-Day Trial (India)
                </a>

                <p className="text-zinc-500 text-xs leading-relaxed">
                  You won&apos;t be charged until your trial ends, and you can cancel anytime
                  before then at no cost. Paying from outside India? Email{' '}
                  <a
                    href={`mailto:${CONTACT_EMAIL}?subject=Joining the GetFit AF Community`}
                    className="text-orange-400 hover:text-orange-300 transition"
                  >
                    {CONTACT_EMAIL}
                  </a>{' '}
                  and we&apos;ll get you set up directly.
                </p>
              </div>

              <div>
                <p className="text-zinc-400 text-sm mb-2">
                  <span className="text-white font-semibold">Step {isLoggedIn ? 2 : 3}.</span>{' '}
                  Build your first workout
                </p>
                <a
                  href="https://workoutbuilder.getfitaf.fitness"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 font-bold py-3 rounded-xl transition text-sm"
                >
                  Build My Workout →
                </a>
              </div>
            </div>

            <p className="text-zinc-600 text-xs mt-6 pt-6 border-t border-zinc-800">
              Your access is activated automatically as soon as your trial starts - no need to
              wait on us. If you paid internationally by email instead, access is turned on
              shortly after we confirm your payment.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
