import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminMembersList from '@/components/AdminMembersList'
import AdminNewRequestsList from '@/components/AdminNewRequestsList'

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
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, approved, created_at')
      .order('full_name'),
    supabase.from('space_memberships').select('profile_id, space').eq('space', 'low_ticket'),
  ])

  const lowTicketIds = new Set((memberships || []).map((m) => m.profile_id))
  const membersWithSpace = (members || []).map((m) => ({
    ...m,
    hasLowTicket: lowTicketIds.has(m.id),
  }))

  // Not approved yet AND not already granted low-ticket — i.e. nobody's
  // done anything with this signup yet. Once either action happens, it
  // naturally drops out of this list on the next load (revalidatePath
  // handles that) and only lives in the full list below.
  const newRequests = membersWithSpace
    .filter((m) => !m.approved && !m.hasLowTicket)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Moderation
      </Link>

      {newRequests.length > 0 && (
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">New Requests</h1>
          <p className="text-sm text-zinc-500 mt-1 mb-4">
            Recent signups nobody's actioned yet, newest first.
          </p>
          <AdminNewRequestsList members={newRequests} />
        </div>
      )}

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
