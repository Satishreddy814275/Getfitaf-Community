'use client'

import { AlertTriangle } from 'lucide-react'

// Blocking confirmation before switching away from an in-progress
// program - same modal shape/pattern as WorkoutDayPicker's finish-
// workout celebration modal (Satish's explicit call, reusing that
// pattern rather than a third confirmation style). "Stay on my
// program" is the bold primary button (Satish: this is what we're
// actually steering people toward), "Switch anyway" is the secondary
// outline. Tapping the backdrop also counts as "stay" - the safe,
// non-destructive default - rather than doing nothing or switching.
export default function SwitchProgramModal({
  currentProgramName,
  isPending,
  onStay,
  onSwitchAnyway,
}: {
  currentProgramName: string
  isPending: boolean
  onStay: () => void
  onSwitchAnyway: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onStay}
    >
      <div className="glass rounded-2xl p-5 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
        <AlertTriangle className="w-7 h-7 text-orange-400 mx-auto mb-3" aria-hidden="true" />
        <p className="text-white font-semibold text-sm mb-1">You&apos;re currently on {currentProgramName}</p>
        <p className="text-zinc-400 text-sm mb-5">We recommend finishing it before switching programs.</p>
        <div className="space-y-2">
          <button
            onClick={onStay}
            className="w-full bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold py-2.5 rounded-xl transition"
          >
            Stay on my program
          </button>
          <button
            onClick={onSwitchAnyway}
            disabled={isPending}
            className="w-full border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-xl transition"
          >
            {isPending ? 'Switching...' : 'Switch anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}
