'use client'

import { useState } from 'react'
import { resetAvatar } from '@/app/admin/actions'
import Avatar from './Avatar'

type Member = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export default function AdminMembersList({ members }: { members: Member[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function handleReset(member: Member) {
    if (!confirm(`Reset ${member.full_name || 'this member'}'s profile photo?`)) return
    setPendingId(member.id)
    await resetAvatar(member.id)
    setPendingId(null)
  }

  if (members.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-12">No members found.</p>
  }

  return (
    <div className="glass rounded-2xl divide-y divide-zinc-800">
      {members.map((member) => (
        <div key={member.id} className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar avatarUrl={member.avatar_url} name={member.full_name} size={40} />
            <p className="text-sm font-medium text-white">{member.full_name || 'Member'}</p>
          </div>
          <button
            onClick={() => handleReset(member)}
            disabled={!member.avatar_url || pendingId === member.id}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition disabled:opacity-30"
          >
            {pendingId === member.id ? 'Resetting...' : 'Reset photo'}
          </button>
        </div>
      ))}
    </div>
  )
}
