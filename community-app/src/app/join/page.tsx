import Link from 'next/link'

// TODO(Satish): paste your ₹499/mo Payment Link URL here. Before
// going live, double-check in the Stripe Dashboard that this Price
// has the 7-day free trial toggle turned on — the "Start Free 7-Day
// Trial" copy below only holds true if it does. Also don't go live
// with this until the Stripe webhook (src/app/api/stripe-webhook) is
// deployed and its env vars are set — otherwise trials will start in
// Stripe but access won't be granted automatically on this end.
const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/REPLACE_ME'

const CONTACT_EMAIL = 'satish@getfitaf.fitness'

export default function JoinPage() {
  return (
    <div className="min-h-full bg-[#0a0a0a]">
      <div className="w-full max-w-lg mx-auto py-16 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">
            GET<span className="text-orange-500">FIT</span> AF
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Community Membership</p>
        </div>

        <div className="glass rounded-2xl p-8">
          <p className="text-orange-500 text-sm font-semibold mb-1">
            7-day free trial, then ₹499/month
          </p>
          <h2 className="text-white text-xl font-bold mb-4">Join the GetFit AF Community</h2>

          <ul className="space-y-2.5 text-sm text-zinc-300 mb-6">
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>A personalized workout, built for you based on your goals and any injuries</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>Daily lessons on nutrition and training, delivered to keep you moving forward</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>A community to bring your questions and progress to — not doing this alone</span>
            </li>
          </ul>

          <div className="border-t border-zinc-800 pt-6">
            <h3 className="text-white text-sm font-bold mb-4">How to join</h3>

            <div className="space-y-4">
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

              <div>
                <p className="text-zinc-400 text-sm mb-2">
                  <span className="text-white font-semibold">Step 2.</span> Start your free trial
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
                  <span className="text-white font-semibold">Step 3.</span> Build your first
                  workout
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
              Your access is activated automatically as soon as your trial starts — no need to
              wait on us. If you paid internationally by email instead, access is turned on
              shortly after we confirm your payment.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
