// Minimal hand-rolled SVG line chart - a plain polyline over 2+ points,
// oldest to newest left-to-right. Extracted from WorkoutDayPicker's
// exercise-history chart (top weight / longest hold per session) so
// body-weight tracking can reuse the exact same rendering instead of a
// third hand-rolled copy. No charting library added for this (the app
// has none so far) - a single component this small doesn't earn one.
// Callers should only render this with 2+ points - a single point has
// no line to draw and isn't worth a chart.
export default function MiniTrendChart({
  points,
  label,
  unit,
}: {
  points: { date: string; value: number }[]
  label: string
  unit: string
}) {
  const width = 300
  const height = 90
  const padX = 10
  const padY = 14
  const values = points.map((p) => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0
  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - (p.value - minV) / range) * (height - padY * 2),
  }))
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">{label}</span>
        <span className="text-zinc-500 text-[11px]">
          {minV === maxV ? `${minV}${unit}` : `${minV}–${maxV}${unit}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" preserveAspectRatio="none">
        <path
          d={pathD}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="#f97316" />
        ))}
      </svg>
    </div>
  )
}
