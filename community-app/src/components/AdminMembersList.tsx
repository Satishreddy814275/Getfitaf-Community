'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  resetAvatar,
  grantLowTicketAccess,
  revokeLowTicketAccess,
  getMemberWorkoutHistory,
} from '@/app/admin/actions'
import Avatar from './Avatar'
import WorkoutHistoryList from './WorkoutHistoryList'
import type { WorkoutHistoryGroup } from '@/types'

type Member = {
  id: string
  full_name: string | null
  avatar_url: string | null
  approved: boolean
  hasLowTicket: boolean
  email: string | null
}

type WorkoutSummary = {
  hasPlan: boolean
  completedCount: number
  totalCount: number
  lastLoggedAt: string | null
}

type Filter = 'all' | 'low_ticket' | 'not_low_ticket'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'low_ticket', label: 'Low-ticket' },
  { value: 'not_low_ticket', label: 'Not low-ticket' },
]

export default function AdminMembersList({
  members,
  workoutSummaries,
}: {
  members: Member[]
  workoutSummaries: Record<string, WorkoutSummary>
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  // Optimistic local overrides so the toggle updates immediately
  // rather than waiting on a full page revalidation round-trip.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<Filter>('all')
  // Which member's full log is currently expanded (only one at a time
  // - keeps the list from turning into a wall of history). History is
  // fetched lazily on first expand, then cached here so re-collapsing
  // and re-expanding the same member doesn't re-fetch.
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [historyByMember, setHistoryByMember] = useState<
    Record<string, { history: WorkoutHistoryGroup[]; weightUnit: 'kg' | 'lbs' }>
  >({})
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)

  async function handleToggleHistory(member: Member) {
    if (expandedMemberId === member.id) {
      setExpandedMemberId(null)
      return
    }
    setExpandedMemberId(member.id)
    if (!historyByMember[member.id]) {
      setLoadingHistoryId(member.id)
      const result = await getMemberWorkoutHistory(member.id)
      setHistoryByMember((h) => ({ ...h, [member.id]: result }))
      setLoadingHistoryId(null)
    }
  }

  async function handleReset(member: Member) {
    if (!confirm(`Reset ${member.full_name || 'this member'}'s profile photo?`)) return
    setPendingId(member.id)
    await resetAvatar(member.id)
    setPendingId(null)
  }

  async function handleToggleLowTicket(member: Member) {
    const hasAccess = overrides[member.id] ?? member.hasLowTicket
    const verb = hasAccess ? 'Revoke' : 'Grant'
    if (!confirm(`${verb} low-ticket community access for ${member.full_name || 'this member'}?`))
      return

    setPendingId(member.id)
    setOverrides((o) => ({ ...o, [member.id]: !hasAccess }))
    if (hasAccess) {
      await revokeLowTicketAccess(member.id)
    } else {
      await grantLowTicketAccess(member.id)
    }
    setPendingId(null)
  }

  if (members.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-12">No members found.</p>
  }

  const filtered = members.filter((member) => {
    const hasLowTicket = overrides[member.id] ?? member.hasLowTicket
    if (filter === 'low_ticket') return hasLowTicket
    if (filter === 'not_low_ticket') return !hasLowTicket
    return true
  })

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? 'text-xs px-3 py-1.5 rounded-lg bg-orange-500 text-white font-semibold transition'
                : 'text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">No members match this filter.</p>
      ) : (
        <div className="glass rounded-2xl divide-y divide-zinc-800">
          {filtered.map((member) => {
            const hasLowTicket = overrides[member.id] ?? member.hasLowTicket
            const summary = workoutSummaries[member.id]
            const isExpanded = expandedMemberId === member.id
            return (
              <div key={member.id}>
                <div className="flex items-center justify-between gap-3 p-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Avatar avatarUrl={member.avatar_url} name={member.full_name} size={40} />
                    <div>
                      <p className="text-sm font-medium text-white">{member.full_name || 'Member'}</p>
                      <div className="flex items-center gap-2">
                        {!member.approved && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Pending approval
                          </span>
                        )}
                        {hasLowTicket && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                            Low-ticket
                          </span>
                        )}
                      </div>
                      {hasLowTicket && summary && (
                        <p className="text-xs text-zinc-500 mt-1">
                          {summary.hasPlan
                            ? `${summary.completedCount}/${summary.totalCount} this cycle`
                            : 'No active plan'}
                          {summary.lastLoggedAt && (
                            <>
                              {' · Last logged '}
                              {formatDistanceToNow(new Date(summary.lastLoggedAt), { addSuffix: true })}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasLowTicket && summary && (summary.completedCount > 0 || summary.hasPlan) && (
                      <button
                        onClick={() => handleToggleHistory(member)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition"
                      >
                        {isExpanded ? 'Hide log' : 'View log'}
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleLowTicket(member)}
                      disabled={pendingId === member.id}
                      className={
                        hasLowTicket
                          ? 'text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition disabled:opacity-30'
                          : 'text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition disabled:opacity-30'
                      }
                    >
                      {pendingId === member.id
                        ? '...'
                        : hasLowTicket
                          ? 'Revoke low-ticket'
                          : 'Grant low-ticket'}
                    </button>
                    <button
                      onClick={() => handleReset(member)}
                      disabled={!member.avatar_url || pendingId === member.id}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-red-500/30 hover:text-red-400 transition disabled:opacity-30"
                    >
                      Reset photo
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 bg-black/20">
                    {loadingHistoryId === member.id ? (
                      <p className="text-xs text-zinc-500 py-4">Loading...</p>
                    ) : (
                      <WorkoutHistoryList
                        groups={historyByMember[member.id]?.history || []}
                        weightUnit={historyByMember[member.id]?.weightUnit}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
