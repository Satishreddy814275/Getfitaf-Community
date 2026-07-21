import { Check } from 'lucide-react'
import MiniTrendChart from './MiniTrendChart'

// Live UI piece for the /beta "What's included" section, replacing a
// screenshot that couldn't be sourced this round (see
// project_beta_launch_plan memory). Two parts, both illustrative
// rather than tied to any real member's data:
// 1. A static mockup of the actual set-entry row (weight/reps inputs +
//    checkmark), styled identically to the real logging screen in
//    WorkoutDayPicker.tsx - Satish's ask was to show what *using* the
//    app looks like, not just the resulting trend line.
// 2. MiniTrendChart itself, reused as-is with sample points.
const SAMPLE_POINTS = [
  { date: '2026-07-01', value: 72 },
  { date: '2026-07-08', value: 74 },
  { date: '2026-07-15', value: 76 },
  { date: '2026-07-22', value: 79 },
]

export default function BetaProgressPreview() {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
      <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Example - logging a set</p>

      {/* Static mockup, not a real input - same visual language as
          WorkoutDayPicker's compact set row (bg-zinc-900 border rounded-lg,
          orange-filled checkmark circle once checked). */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-zinc-300 text-xs font-medium w-24 shrink-0">Bench Press</span>
        <div className="relative flex-1">
          <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm pl-2 pr-7 py-1.5">
            60
          </div>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-zinc-500">
            kg
          </span>
        </div>
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm px-2 py-1.5">8</div>
        <div className="shrink-0 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
          <Check className="w-3.5 h-3.5 text-black" aria-hidden="true" />
        </div>
      </div>

      <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Example - the trend after a few weeks</p>
      <MiniTrendChart points={SAMPLE_POINTS} label="Weight over time" unit="kg" />
    </div>
  )
}
