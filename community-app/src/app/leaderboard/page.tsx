import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LeaderboardList from '@/components/LeaderboardList'
import type { LeaderboardRow } from '@/types'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Previously this page only checked "are you logged in" - meaning
  // any account, paid or not, could see every real member's name and
  // activity. Same access rule /feed and /workouts already enforce:
  // no active membership in either space means no view here either,
  // straight to /beta instead.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, approved')
    .eq('id', user.id)
    .single()
  const { data: membership } = await supabase
    .from('space_memberships')
    .select('space')
    .eq('profile_id', user.id)
    .eq('space', 'low_ticket')
    .maybeSingle()

  const isAdmin = !!profile?.is_admin
  const isApproved = !!profile?.approved
  const hasLowTicket = !!membership

  if (!isAdmin && !isApproved && !hasLowTicket) {
    redirect('/beta')
  }

  const { data } = await supabase.rpc('get_community_leaderboard')
  const rows = (data as LeaderboardRow[] | null) || []

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Community Leaderboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Most active members over the last 30 days - posts and comments count.
        </p>
      </div>

      <div className="glass rounded-2xl p-5">
        <LeaderboardList rows={rows} currentUserId={user.id} />
      </div>
    </div>
  )
}
