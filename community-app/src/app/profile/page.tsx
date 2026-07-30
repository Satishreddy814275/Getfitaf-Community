import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProfileForm from '@/components/ProfileForm'
import InstallAppRow from '@/components/InstallAppRow'
import PushNotificationsRow from '@/components/PushNotificationsRow'
import BodyWeightCard from '@/components/BodyWeightCard'
import RazorpayMembershipCard from '@/components/RazorpayMembershipCard'
import type { BodyWeightEntry } from '@/types'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Independent of each other (neither reads the other's result), so
  // batched into one round-trip instead of three serial ones.
  const [{ data: profile }, { data: bodyWeightRows }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url, weight_unit').eq('id', user.id).single(),
    supabase
      .from('body_weight_logs')
      .select('id, weight_kg, logged_date')
      .eq('profile_id', user.id)
      .order('logged_date', { ascending: true }),
    // Only a Razorpay-originated membership has anything to manage
    // here - premium access and manually-granted low-ticket access
    // don't carry a razorpay_subscription_id, so the card below stays
    // hidden for those rather than showing a cancel button that has
    // nothing real to cancel.
    supabase
      .from('space_memberships')
      .select('razorpay_subscription_id, current_period_end, cancel_at_period_end')
      .eq('profile_id', user.id)
      .eq('space', 'low_ticket')
      .maybeSingle(),
  ])

  const weightUnit: 'kg' | 'lbs' = profile?.weight_unit === 'lbs' ? 'lbs' : 'kg'

  const bodyWeightEntries: BodyWeightEntry[] = (bodyWeightRows || []).map((r) => ({
    id: r.id,
    loggedDate: r.logged_date,
    weightKg: r.weight_kg,
  }))

  return (
    <div className="max-w-lg mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">Edit Profile</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Update your name and photo. This is what the rest of the community sees on your posts and comments.
      </p>

      <ProfileForm
        userId={user.id}
        initialName={profile?.full_name || ''}
        initialAvatarUrl={profile?.avatar_url || null}
        initialWeightUnit={weightUnit}
        email={user.email || null}
      />

      <BodyWeightCard weightUnit={weightUnit} entries={bodyWeightEntries} />

      {membership?.razorpay_subscription_id && (
        <RazorpayMembershipCard
          currentPeriodEnd={membership.current_period_end}
          cancelAtPeriodEnd={membership.cancel_at_period_end}
        />
      )}

      <InstallAppRow />
      <PushNotificationsRow />
    </div>
  )
}
