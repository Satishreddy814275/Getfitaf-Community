// Server component (no interactivity of its own - "Manage membership"
// is a plain link to /api/stripe-portal, which does the actual work)
// showing the signed-in member's low-ticket subscription status, with
// a way to manage/cancel it themselves. Renders nothing if there's no
// low_ticket space_membership row at all - i.e. not a paying member.
export default function MembershipCard({
  status,
  hasStripeCustomer,
  currentPeriodEnd,
}: {
  status: 'trialing' | 'active' | 'past_due' | 'canceled'
  // False when access was granted manually (e.g. by Satish via the
  // admin panel) rather than through a real Stripe subscription -
  // there's nothing to manage/cancel via Stripe in that case.
  hasStripeCustomer: boolean
  currentPeriodEnd: string | null
}) {
  const statusDisplay: Record<typeof status, { label: string; className: string }> = {
    trialing: { label: 'Trial', className: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    active: { label: 'Active', className: 'text-green-400 bg-green-500/10 border-green-500/30' },
    past_due: {
      label: 'Payment failed',
      className: 'text-red-400 bg-red-500/10 border-red-500/30',
    },
    canceled: { label: 'Canceled', className: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' },
  }

  const { label, className } = statusDisplay[status]

  const periodEndDisplay = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null

  return (
    <div className="glass rounded-2xl p-5 mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-white">Membership</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${className}`}>
          {label}
        </span>
      </div>

      {hasStripeCustomer ? (
        <>
          {status === 'past_due' ? (
            <p className="text-xs text-zinc-400 mb-3">
              Your last payment didn&apos;t go through. Update your card to keep your membership
              active.
            </p>
          ) : periodEndDisplay ? (
            <p className="text-xs text-zinc-400 mb-3">
              {status === 'trialing' ? 'Trial ends' : 'Next billing date'}: {periodEndDisplay}
            </p>
          ) : null}
          <a
            href="/api/stripe-portal"
            className="inline-block text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition rounded-lg px-3 py-2"
          >
            Manage membership
          </a>
          <p className="text-xs text-zinc-500 mt-2">
            Update your card, view invoices, or cancel anytime - you&apos;ll keep access until your
            current billing cycle finishes.
          </p>
        </>
      ) : (
        <p className="text-xs text-zinc-500">Contact support to make changes to your membership.</p>
      )}
    </div>
  )
}
