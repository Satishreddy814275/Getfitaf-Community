'use client'

import { useState } from 'react'
import { updateCommunityGuidelines } from '@/app/admin/actions'

// Two independent textareas (intro, rule blocks), each with its own
// draft/saved/dirty state and Save button - same "don't let one field's
// mistake blow away another field's saved edit" reasoning as
// AdminBetaPageEditor, just with a two-argument save action instead of
// a per-section key.
export default function AdminGuidelinesEditor({
  initialIntro,
  initialRulesText,
}: {
  initialIntro: string
  initialRulesText: string
}) {
  const [intro, setIntro] = useState(initialIntro)
  const [savedIntro, setSavedIntro] = useState(initialIntro)
  const [rulesText, setRulesText] = useState(initialRulesText)
  const [savedRulesText, setSavedRulesText] = useState(initialRulesText)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const isDirty = intro !== savedIntro || rulesText !== savedRulesText

  async function handleSave() {
    setStatus('saving')
    await updateCommunityGuidelines(intro, rulesText)
    setSavedIntro(intro)
    setSavedRulesText(rulesText)
    setStatus('saved')
    setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <p className="text-white text-sm font-semibold mb-2">Intro line</p>
        <p className="text-xs text-zinc-500 mb-2">Shown above the numbered rules.</p>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={3}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition font-mono"
        />
      </div>

      <div className="glass rounded-2xl p-4">
        <p className="text-white text-sm font-semibold mb-2">Rules</p>
        <p className="text-xs text-zinc-500 mb-2">
          One rule per block, separated by a blank line. First line of each block is the rule
          title, the rest is the body. Numbering and formatting is applied automatically.
        </p>
        <textarea
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          rows={28}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition font-mono"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || status === 'saving'}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-2 px-4 rounded-lg transition"
        >
          {status === 'saving' ? 'Saving...' : 'Save'}
        </button>
        {status === 'saved' && <span className="text-xs text-zinc-500">Saved</span>}
        {isDirty && status !== 'saving' && (
          <span className="text-[11px] text-orange-500">Unsaved changes</span>
        )}
      </div>
    </div>
  )
}
