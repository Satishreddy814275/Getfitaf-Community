'use client'

import { useState } from 'react'
import { resetAvatar, grantLowTicketAccess, revokeLowTicketAccess } from '@/app/admin/actions'
import Avatar from './Avatar'

type Member = {
  id: string
  full_name: string | null
  avatar_url: string | null
  hasLowTicket: boolean
}

export default function AdminMembersList({ members }: { members: Member[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  // Optimistic local overrides so the toggle updates immediately
  // rather than waiting on a full page revalidation round-trip.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

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

  return (
    <div className="glass rounded-2xl divide-y divide-zinc-800">
      {members.map((member) => {
        const hasLowTicket = overrides[member.id] ?? member.hasLowTicket
        return (
          <div key={member.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar avatarUrl={member.avatar_url} name={member.full_name} size={40} />
              <div>
                <p className="text-sm font-medium text-white">{member.full_name || 'Member'}</p>
                {hasLowTicket && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                    Low-ticket
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
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
        )
      })}
    </div>
  )
}
