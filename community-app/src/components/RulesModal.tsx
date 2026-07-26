'use client'

import GuidelinesContent from './GuidelinesContent'
import type { GuidelineRule } from '@/lib/communityGuidelines'

// Blocking first-time acknowledgment - no backdrop-click dismiss, no X,
// only the "I understand, continue" button below. RulesGate owns the
// localStorage flag and only mounts this once (ever, not daily like
// WorkoutBuilderPromptModal) per user; this component itself is purely
// presentational.
export default function RulesModal({
  intro,
  rules,
  onAcknowledge,
}: {
  intro: string
  rules: GuidelineRule[]
  onAcknowledge: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 py-8">
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-orange-500/30 bg-[#111111] shadow-xl">
        <div className="p-6 pb-4 border-b border-zinc-800 shrink-0">
          <p className="text-white text-lg font-bold">Community Guidelines</p>
          <p className="text-zinc-500 text-xs mt-1">A quick read before you jump in - takes a minute.</p>
        </div>

        <div className="p-6 overflow-y-auto">
          <GuidelinesContent intro={intro} rules={rules} />
        </div>

        <div className="p-6 pt-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={onAcknowledge}
            className="block w-full text-center bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-3 rounded-xl transition"
          >
            I understand, continue
          </button>
        </div>
      </div>
    </div>
  )
}
