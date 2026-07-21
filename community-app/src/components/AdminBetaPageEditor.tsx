'use client'

import { useState } from 'react'
import { updateBetaPageContent } from '@/app/admin/actions'
import type { BetaPageContentKey } from '@/lib/betaPageContent'

interface Section {
  key: BetaPageContentKey
  label: string
}

// One independent textarea + Save per section, rather than one big
// "save everything" form - a mistake in one field shouldn't risk
// discarding edits already made (and saved) elsewhere. Each section
// tracks its own draft/saved/dirty state locally.
export default function AdminBetaPageEditor({
  sections,
  initialContent,
}: {
  sections: readonly Section[]
  initialContent: Record<BetaPageContentKey, string>
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <SectionEditor key={section.key} section={section} initialValue={initialContent[section.key] || ''} />
      ))}
    </div>
  )
}

function SectionEditor({ section, initialValue }: { section: Section; initialValue: string }) {
  const [draft, setDraft] = useState(initialValue)
  const [saved, setSaved] = useState(initialValue)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const isDirty = draft !== saved

  async function handleSave() {
    setStatus('saving')
    await updateBetaPageContent(section.key, draft)
    setSaved(draft)
    setStatus('saved')
    setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-white text-sm font-semibold">{section.label}</p>
        {isDirty && <span className="text-[11px] text-orange-500 shrink-0">Unsaved changes</span>}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition font-mono"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || status === 'saving'}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-2 px-4 rounded-lg transition"
        >
          {status === 'saving' ? 'Saving...' : 'Save'}
        </button>
        {status === 'saved' && <span className="text-xs text-zinc-500">Saved</span>}
      </div>
    </div>
  )
}
