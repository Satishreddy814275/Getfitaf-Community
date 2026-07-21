import { Check, Timer, Play } from 'lucide-react'
import MiniTrendChart from './MiniTrendChart'

// Live UI piece for the /beta "What's included" section, replacing a
// screenshot that couldn't be sourced this round (see
// project_beta_launch_plan memory). Satish's follow-up: show
// everything that makes the logging screen itself interesting, not
// just one input row - video link, target line, multiple sets (one
// done, one still open, so it reads as "mid-workout" not a finished
// state), and the rest timer pill. Every piece here mirrors the real
// markup/classes from WorkoutDayPicker.tsx's renderExerciseCard and
// renderRestPill, just static (no inputs, no handlers) since this is
// an unauthenticated public page with nothing to actually save.
const SAMPLE_POINTS = [
  { date: '2026-07-01', value: 72 },
  { date: '2026-07-08', value: 74 },
  { date: '2026-07-15', value: 76 },
  { date: '2026-07-22', value: 79 },
]

function StaticSetRow({
  setLabel,
  weight,
  reps,
  checked,
}: {
  setLabel: string
  weight: string
  reps: string
  checked: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-500 text-xs w-10 shrink-0">{setLabel}</span>
      <div className="relative flex-1">
        <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm pl-2 pr-7 py-1.5 min-h-[30px]">
          {weight}
        </div>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-zinc-500">
          kg
        </span>
      </div>
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm px-2 py-1.5 min-h-[30px]">
        {reps}
      </div>
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
          checked ? 'bg-orange-500' : 'bg-zinc-800'
        }`}
      >
        <Check className={`w-3.5 h-3.5 ${checked ? 'text-black' : 'text-zinc-600'}`} aria-hidden="true" />
      </div>
    </div>
  )
}

export default function BetaProgressPreview() {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
      <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Example - logging a workout</p>

      <div className="glass rounded-2xl p-3.5 mb-4">
        <div className="flex items-baseline justify-between mb-0.5 gap-2">
          <p className="text-white text-sm font-semibold">Bench Press</p>
          <p className="text-zinc-500 text-xs shrink-0">3 × 8 · rest 90s</p>
        </div>
        <div className="mb-3">
          <span className="text-xs font-medium text-orange-400">▶ Watch video</span>
        </div>

        <div className="space-y-2 mb-3">
          <StaticSetRow setLabel="Set 1" weight="60" reps="8" checked />
          <StaticSetRow setLabel="Set 2" weight="" reps="" checked={false} />
        </div>

        <div className="flex items-center justify-between gap-2 bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <Timer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Rest for 90s</span>
          </div>
          <span className="flex items-center gap-1 shrink-0 text-orange-400 text-xs font-medium border border-orange-500/40 rounded-full px-2.5 py-1">
            <Play className="w-3 h-3" fill="currentColor" aria-hidden="true" />
            Start
          </span>
        </div>
      </div>

      <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Example - the trend after a few weeks</p>
      <MiniTrendChart points={SAMPLE_POINTS} label="Weight over time" unit="kg" />
    </div>
  )
}
