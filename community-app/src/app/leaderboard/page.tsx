import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaderboardList from '@/components/LeaderboardList'
import type { LeaderboardRow } from '@/types'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('get_community_leaderboard')
  const rows = (data as LeaderboardRow[] | null) || []

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Community Leaderboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Most active members over the last 30 days — posts and comments count.
        </p>
      </div>

      <div className="glass rounded-2xl p-5">
        <LeaderboardList rows={rows} />
      </div>
    </div>
  )
}
