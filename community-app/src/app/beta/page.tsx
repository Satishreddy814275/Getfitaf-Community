import type { Metadata } from 'next'
import WaitlistForm from '@/components/WaitlistForm'

// Single URL, two modes - see project_beta_launch_plan memory. Only
// the CTA changes between "Join the waitlist" (before launch) and
// "Reserve your spot" (from launch day on); every other section on
// the page is identical throughout, built once rather than twice.
//
// 2026-08-01T00:00:00+05:30 - IST, since that's the timezone this
// launches in. Comparing against Date.now() means this page flips
// modes on its own at midnight on launch day with no manual edit or
// redeploy needed.
const LAUNCH_AT = new Date('2026-08-01T00:00:00+05:30').getTime()

const INSTAGRAM_HANDLE = '@getfitaf_satish'
const INSTAGRAM_URL = 'https://www.instagram.com/getfitaf_satish/'
const CONTACT_EMAIL = 'satish@getfitaf.fitness'

export const metadata: Metadata = {
  title: 'GetFit AF Community — Beta Launch',
  description:
    'Self-guided training, daily lessons, and a real community - beta pricing for the first 50 members.',
}

export default function BetaLandingPage() {
  // Deliberate: this is a Server Component, computed fresh per
  // request (not a client re-render), so there's no "unstable across
  // renders" concern the react-hooks/purity rule is guarding against -
  // same reasoning already used for the Date.now() call in
  // AdminTemplatesList.tsx.
  // eslint-disable-next-line react-hooks/purity
  const isLive = Date.now() >= LAUNCH_AT

  return (
    <div className="min-h-full bg-[#0a0a0a]">
      <div className="w-full max-w-2xl mx-auto py-16 px-4">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            GET<span className="text-orange-500">FIT</span> AF
          </h1>
          <p className="text-zinc-400 text-sm mt-2">Community Membership — Beta</p>
          <h2 className="text-white text-xl sm:text-2xl font-bold mt-6 leading-snug">
            A personalized workout, daily coaching lessons, and a community that actually
            answers - for ₹249 your first month.
          </h2>
          <p className="text-zinc-400 text-sm mt-3 max-w-lg mx-auto leading-relaxed">
            Built for people who want real structure and real support without paying for 1-on-1
            coaching. First 50 members get their first month at ₹249, then ₹499/month after -
            same rate everyone else eventually pays.
          </p>
        </div>

        {/* CTA - top */}
        <div className="glass rounded-2xl p-6 mb-10">
          {isLive ? (
            <div className="text-center">
              <p className="text-orange-500 text-sm font-semibold mb-3">
                Doors are open - 50 spots, first come first served
              </p>
              <a
                href="/api/beta-checkout"
                className="inline-block w-full sm:w-auto text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl transition text-sm"
              >
                Reserve your spot - ₹249 first month
              </a>
              <p className="text-zinc-500 text-xs mt-3">
                Then ₹499/month. Cancel anytime, no charge until then.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-orange-500 text-sm font-semibold mb-1 text-center">
                Opens Aug 1, 2026 - 50 spots at ₹249 your first month
              </p>
              <p className="text-zinc-500 text-xs mb-4 text-center">
                Join the waitlist and we&apos;ll email you the second doors open.
              </p>
              <WaitlistForm />
            </div>
          )}
        </div>

        {/* What's included */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">What&apos;s included</h3>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>
                A personalized workout plan, built around your goals and the equipment you
                actually have access to
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>Daily lessons on nutrition and training, delivered to keep you moving forward</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>Set logging and progress tracking, so you can see what&apos;s working</span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-500">✓</span>
              <span>A community to bring your questions and wins to - not doing this alone</span>
            </li>
          </ul>
        </div>

        {/* What this is / isn't */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">What this is - and isn&apos;t</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-2">This is</p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>Self-guided - you run your own program, at your own pace</li>
                <li>Community-supported - post a question, get a real answer, usually within a day or two</li>
              </ul>
            </div>
            <div className="glass rounded-xl p-4">
              <p className="text-white text-sm font-semibold mb-2">This isn&apos;t</p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>1-on-1 coaching - nobody is individually watching your form or adjusting your plan rep by rep</li>
                <li>Instant, always-on support - it&apos;s a community, not a call center</li>
              </ul>
            </div>
          </div>
          <p className="text-zinc-500 text-xs mt-4 leading-relaxed">
            Want hands-on 1-on-1 coaching instead? DM me on Instagram{' '}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 transition"
            >
              {INSTAGRAM_HANDLE}
            </a>{' '}
            and we&apos;ll talk through whether it&apos;s a fit.
          </p>
        </div>

        {/* Pricing & terms */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">Pricing &amp; terms</h3>
          <div className="glass rounded-xl p-4 space-y-2 text-sm text-zinc-300">
            <p>
              <span className="text-white font-semibold">₹249</span> for your first month - an
              intro rate for the first 50 members who join.
            </p>
            <p>
              <span className="text-white font-semibold">₹499/month</span> from month two on -
              the same ongoing rate everyone eventually pays.
            </p>
            <p>
              Cancel anytime from your profile page. You won&apos;t be billed again, but you keep
              access until the current billing cycle finishes.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h3 className="text-white text-lg font-bold mb-4">FAQ</h3>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-white font-semibold mb-1">Is ₹249 a permanent price?</p>
              <p className="text-zinc-400 leading-relaxed">
                No - it&apos;s an intro rate for your first month, and only for the first 50
                people who join. From month two, everyone (including beta members) moves to the
                standard ₹499/month.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">How is this different from 1-on-1 coaching?</p>
              <p className="text-zinc-400 leading-relaxed">
                This is self-guided with community support - you run your own program and post
                questions to the community, with responses usually within a day or two. 1-on-1
                coaching is closer supervision and direct programming from a coach. If that&apos;s
                what you&apos;re after, DM {INSTAGRAM_HANDLE} on Instagram.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Can I cancel anytime?</p>
              <p className="text-zinc-400 leading-relaxed">
                Yes, self-serve from your profile page. Cancelling stops future billing, but you
                keep access through the end of whatever period you already paid for.
              </p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">What if I&apos;m paying from outside India?</p>
              <p className="text-zinc-400 leading-relaxed">
                Email{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Beta waitlist - paying from outside India`}
                  className="text-orange-400 hover:text-orange-300 transition"
                >
                  {CONTACT_EMAIL}
                </a>{' '}
                and we&apos;ll get you set up directly.
              </p>
            </div>
          </div>
        </div>

        {/* CTA - bottom */}
        <div className="glass rounded-2xl p-6">
          {isLive ? (
            <div className="text-center">
              <a
                href="/api/beta-checkout"
                className="inline-block w-full sm:w-auto text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl transition text-sm"
              >
                Reserve your spot - ₹249 first month
              </a>
            </div>
          ) : (
            <div>
              <p className="text-orange-500 text-sm font-semibold mb-4 text-center">
                50 spots at ₹249 - join the waitlist to get first access on Aug 1
              </p>
              <WaitlistForm />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
