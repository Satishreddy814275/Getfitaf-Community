import MiniTrendChart from './MiniTrendChart'

// Live UI piece for the /beta "What's included" section, replacing a
// screenshot that couldn't be sourced this round (see
// project_beta_launch_plan memory). Reuses the actual MiniTrendChart
// component - real rendering code, not a mockup image - fed
// illustrative sample points rather than any real member's numbers.
// Explicitly labeled "Example" so this reads as "here's what the
// feature looks like," not a specific person's real data.
const SAMPLE_POINTS = [
  { date: '2026-07-01', value: 72 },
  { date: '2026-07-08', value: 74 },
  { date: '2026-07-15', value: 76 },
  { date: '2026-07-22', value: 79 },
]

export default function BetaProgressPreview() {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
      <p className="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Example - Bench Press, top set (kg)</p>
      <MiniTrendChart points={SAMPLE_POINTS} label="Weight over time" unit="kg" />
    </div>
  )
}
