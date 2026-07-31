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
// Scoped to the low-ticket program only - premium/high-ticket
// (profiles.approved) members already get 1-on-1 attention as part of
// what they're paying for, so this shouldn't read as an upsell to
// them. Server-side check (not just a hidden nav link), same pattern
// as /admin - direct URL access is blocked the same as the nav links
// (ProfileMenu.tsx / AppNav.tsx's showCoaching prop) already are.
export const dynamic = 'force-dynamic'

// hide_event_type_details=1 hides the photo/name/duration/location/
// description panel. Re-testing it now that the real border cause
// (container width crossing into Calendly's "medium" layout tier, see
// below) is fixed and isolated, to check whether it's safe to combine
// with the narrow width instead of assuming it isn't.
const CALENDLY_URL =
  'https://calendly.com/getfit_af/30-minute-free-consultation-clone?hide_gdpr_banner=1&hide_event_type_details=1&background_color=0a0a0a&text_color=f4f4f5&primary_color=f97316'

export default async function CoachingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    supabase
      .from('space_memberships')
      .select('space')
      .eq('profile_id', user.id)
      .eq('space', 'low_ticket')
      .maybeSingle(),
  ])

  if (!profile?.is_admin && !membership) redirect('/feed')

  return (
    // Back to max-w-2xl (same as /help, /guidelines) - widening to
    // max-w-3xl was a wrong turn: confirmed live in the browser by
    // resizing the embed's container at different widths that
    // Calendly's card renders flush/border-free under their own 650px
    // "small layout" breakpoint, and only picks up a visible margin
    // around itself once it crosses into "medium" layout (650-1100px).
    // max-w-2xl keeps it under that line, which is the width it was
    // already at when this page first shipped with no border at all.
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
