import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkoutPlan } from '@/lib/workoutPlan'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminMembersList from '@/components/AdminMembersList'
import AdminNewRequestsList from '@/components/AdminNewRequestsList'

// See admin/page.tsx for why this is forced dynamic.
export const dynamic = 'force-dynamic'

const TOTAL_WEEKS = 4

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
      .select('id, full_name, avatar_url, approved, created_at, email')
      .order('full_name'),
    supabase.from('space_memberships').select('profile_id, space').eq('space', 'low_ticket'),
  ])

  const lowTicketIds = new Set((memberships || []).map((m) => m.profile_id))
  const membersWithSpace = (members || []).map((m) => ({
    ...m,
    hasLowTicket: lowTicketIds.has(m.id),
  }))

  // Workout-logging summary - low-ticket members only, since that's
  // the only population that builds/logs workouts at all. Each
  // member's active-plan lookup goes through getActiveWorkoutPlan
  // (its own email-based intake query) run in parallel rather than
  // batched into one query - there's no clean way to batch that
  // lookup without duplicating its logic, and at current member counts
  // the parallel round-trips are cheap. Revisit if this list grows
  // into the hundreds. The sessions themselves ARE batched into one
  // query across all low-ticket members instead of one-per-member.
  const lowTicketMembers = membersWithSpace.filter((m) => m.hasLowTicket)
  const memberIds = lowTicketMembers.map((m) => m.id)
  const adminSupabase = createAdminClient()

  const [plans, sessionsRes] = await Promise.all([
    Promise.all(
      lowTicketMembers.map(async (m) => ({
        memberId: m.id,
        plan: await getActiveWorkoutPlan(m.id),
      }))
    ),
    memberIds.length > 0
      ? adminSupabase
          .from('workout_sessions')
          .select('profile_id, generation_id, week_number, day_number, completed_at')
          .in('profile_id', memberIds)
          .not('completed_at', 'is', null)
      : Promise.resolve({ data: [] }),
  ])

  const planByMember = new Map(plans.map((p) => [p.memberId, p.plan]))
  const sessionsByMember = new Map<string, { generation_id: string; week_number: number; day_number: number; completed_at: string }[]>()
  for (const s of sessionsRes.data || []) {
    const list = sessionsByMember.get(s.profile_id) || []
    list.push(s)
    sessionsByMember.set(s.profile_id, list)
  }

  const workoutSummaries: Record<
    string,
    { hasPlan: boolean; completedCount: number; totalCount: number; lastLoggedAt: string | null }
  > = {}
  for (const m of lowTicketMembers) {
    const plan = planByMember.get(m.id) || null
    const sessions = sessionsByMember.get(m.id) || []
    const currentGenSessions = plan
      ? sessions.filter((s) => s.generation_id === plan.generationId)
      : []
    const completedCount = new Set(
      currentGenSessions.map((s) => `${s.week_number}-${s.day_number}`)
    ).size
    const totalCount = plan ? plan.days.length * TOTAL_WEEKS : 0
    const lastLoggedAt = sessions.reduce<string | null>(
      (latest, s) => (!latest || s.completed_at > latest ? s.completed_at : latest),
      null
    )
    workoutSummaries[m.id] = { hasPlan: !!plan, completedCount, totalCount, lastLoggedAt }
  }

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
            Recent signups nobody&apos;s actioned yet, newest first.
          </p>
          <AdminNewRequestsList members={newRequests} />
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Members</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Reset a profile photo, or grant/revoke low-ticket community access once
          someone&apos;s paid.
        </p>
      </div>

      <AdminMembersList members={membersWithSpace} workoutSummaries={workoutSummaries} />
    </div>
  )
}
