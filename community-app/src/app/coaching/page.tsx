import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CalendlyInlineEmbed from '@/components/CalendlyInlineEmbed'

// One-on-one coaching, a separate (higher-touch, higher-ticket) offer
// from the community membership - the "clone" Calendly event type is
// the live/current one (confirmed against the real Calendly account;
// the original "30 Minute Free Consultation" is a stale duplicate left
// active there). Colors match the app's dark/orange theme via
// Calendly's supported embed params - font/layout stay Calendly's,
// that's the real limit of what their embed customization allows.
//
// ADMIN-ONLY PREVIEW: gated the same way /admin is (live is_admin
// check, not just a hidden nav link) so nobody can land on this via a
// direct URL before it's ready to announce. Remove the is_admin
// redirect below (and the matching isAdmin check in ProfileMenu.tsx /
// AppNav.tsx's nav links) to launch it for everyone.
export const dynamic = 'force-dynamic'

const CALENDLY_URL =
  'https://calendly.com/getfit_af/30-minute-free-consultation-clone?hide_gdpr_banner=1&background_color=0a0a0a&text_color=f4f4f5&primary_color=f97316'

export default async function CoachingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/feed')

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>

      <h1 className="text-white text-xl font-bold mb-1">One-on-one coaching</h1>
      <p className="text-zinc-500 text-sm mb-6">
        Hands-on, tailored coaching for anyone who wants more than the community program: direct
        access, a plan built around your specific goals, and closer accountability.
      </p>

      <div className="glass rounded-2xl p-5 mb-5">
        <p className="text-white text-sm font-semibold mb-2">What this is</p>
        <p className="text-zinc-400 text-sm leading-relaxed">
          This is separate from your community membership, a dedicated 1-on-1 coaching
          relationship built around your goals, schedule, and budget. The call below is a free
          30-minute consultation to see if it&apos;s the right fit.
        </p>
      </div>

      <div className="glass rounded-2xl p-5 pb-2">
        <p className="text-white text-sm font-semibold mb-4">Book your free consultation</p>
        <CalendlyInlineEmbed url={CALENDLY_URL} />
      </div>
    </div>
  )
}
