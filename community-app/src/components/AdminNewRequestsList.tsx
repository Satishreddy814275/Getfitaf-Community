'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { approveProfile, grantLowTicketAccess } from '@/app/admin/actions'
import Avatar from './Avatar'

type NewRequest = {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

export default function AdminNewRequestsList({ members }: { members: NewRequest[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  // Once actioned, hide it immediately rather than waiting on the
  // server round-trip — the row belongs in the full Members list
  // below from this point on, not here.
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set())

  async function handleApprove(member: NewRequest) {
    setPendingId(member.id)
    await approveProfile(member.id)
    setHandledIds((s) => new Set(s).add(member.id))
    setPendingId(null)
  }

  async function handleGrantLowTicket(member: NewRequest) {
    setPendingId(member.id)
    await grantLowTicketAccess(member.id)
    setHandledIds((s) => new Set(s).add(member.id))
    setPendingId(null)
  }

  const visible = members.filter((m) => !handledIds.has(m.id))

  if (visible.length === 0) return null

  return (
    <div className="glass rounded-2xl divide-y divide-zinc-800 border border-orange-500/20">
      {visible.map((member) => (
        <div key={member.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Avatar avatarUrl={member.avatar_url} name={member.full_name} size={40} />
            <div>
              <p className="text-sm font-medium text-white">{member.full_name || 'Member'}</p>
              <span className="text-xs text-zinc-500">
                Signed up {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleGrantLowTicket(member)}
              disabled={pendingId === member.id}
              className="text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition disabled:opacity-30"
            >
              {pendingId === member.id ? '...' : 'Grant low-ticket'}
            </button>
            <button
              onClick={() => handleApprove(member)}
              disabled={pendingId === member.id}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition disabled:opacity-30"
            >
              {pendingId === member.id ? '...' : 'Approve (Premium)'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
