import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminMembersList from '@/components/AdminMembersList'

export default async function AdminMembersPage() {
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

  const [{ data: members }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url').order('full_name'),
    supabase.from('space_memberships').select('profile_id, space').eq('space', 'low_ticket'),
  ])

  const lowTicketIds = new Set((memberships || []).map((m) => m.profile_id))
  const membersWithSpace = (members || []).map((m) => ({
    ...m,
    hasLowTicket: lowTicketIds.has(m.id),
  }))

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Moderation
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Members</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Reset a profile photo, or grant/revoke low-ticket community access once
          someone's paid.
        </p>
      </div>

      <AdminMembersList members={membersWithSpace} />
    </div>
  )
}
