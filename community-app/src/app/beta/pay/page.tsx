import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RazorpayCheckout from '@/components/RazorpayCheckout'
import { getBetaCheckoutState } from '@/app/beta/razorpay-actions'

export const dynamic = 'force-dynamic'

// Razorpay-native counterpart to /api/beta-checkout (Stripe). Not yet
// linked from /beta - built and tested independently first, per plan.
// Needs its own page rather than a plain redirect like the Stripe
// route because Razorpay subscription checkout opens as an on-page
// modal (Checkout.js) instead of a hosted redirect page.
export default async function RazorpayPayPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/beta/pay')}`)
  }
  if (!user.email) {
    redirect('/beta')
  }

  // Decided server-side, before render, so the page never shows a
  // price or spots-left count that contradicts what Razorpay actually
  // charges once clicked - see BETA_DISCOUNT_CAP / BETA_ANNOUNCED_CAP
  // in lib/razorpay.ts. Re-checked again inside createRazorpaySubscription
  // at the moment of the actual click, so a stale value here (e.g. the
  // cap fills between page load and click) can't cause a mismatch either.
  const { discounted, spotsRemaining } = await getBetaCheckoutState()

  return (
    <div className="min-h-full bg-[#0a0a0a] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-2xl p-6 bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/20">
          <p className="text-orange-500 text-sm font-semibold mb-4 text-center">
            Reserve your spot
          </p>
          <RazorpayCheckout email={user.email} discounted={discounted} spotsRemaining={spotsRemaining} />
        </div>
      </div>
    </div>
  )
}
