'use client'

import { useId, useRef, useState } from 'react'

// Smooth Catmull-Rom -> cubic-bezier line chart with a soft gradient
// fill and a hover/touch tooltip showing the exact date + value at the
// nearest point. Shared by body-weight tracking, the admin member
// view, workout exercise-history charts, and the beta progress
// preview - one upgrade here applies everywhere this renders. No
// charting library added (the app has none so far) - still small
// enough to hand-roll. Callers should only render this with 2+ points
// - a single point has no line to draw and isn't worth a chart.
function buildSmoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return ''
  if (coords.length === 2) {
    return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)} L${coords[1].x.toFixed(1)},${coords[1].y.toFixed(1)}`
  }
  let d = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

// "YYYY-MM-DD" -> "Jul 15". Parsed with an explicit local-midnight time
// (rather than new Date(dateStr), which JS treats as UTC) so the label
// never shifts a day depending on the viewer's timezone offset.
function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
  const gradientId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const values = points.map((p) => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0
  const coords = points.map((p, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - (p.value - minV) / range) * (height - padY * 2),
  }))
  const linePath = buildSmoothPath(coords)
  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`
      : ''

  function updateHoverFromClientX(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return
    const relX = ((clientX - rect.left) / rect.width) * width
    const index = stepX > 0 ? Math.round((relX - padX) / stepX) : 0
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)))
  }

  const hovered = hoverIndex !== null ? coords[hoverIndex] : null
  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null
  const leftPct = hovered ? Math.min(92, Math.max(8, (hovered.x / width) * 100)) : 0
  const topPct = hovered ? (hovered.y / height) * 100 : 0

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">{label}</span>
        <span className="text-zinc-500 text-[11px]">
          {minV === maxV ? `${minV}${unit}` : `${minV}–${maxV}${unit}`}
        </span>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full touch-none"
          style={{ aspectRatio: `${width} / ${height}` }}
          onPointerMove={(e) => updateHoverFromClientX(e.clientX)}
          onPointerDown={(e) => updateHoverFromClientX(e.clientX)}
          onPointerLeave={() => setHoverIndex(null)}
          onPointerUp={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="#f97316"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hovered && (
            <line
              x1={hovered.x}
              y1={0}
              x2={hovered.x}
              y2={height}
              stroke="#f97316"
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={i === hoverIndex ? 4.5 : 2.5}
              fill={i === hoverIndex ? '#0a0a0a' : '#f97316'}
              stroke={i === hoverIndex ? '#f97316' : 'none'}
              strokeWidth={i === hoverIndex ? 2.5 : 0}
            />
          ))}
        </svg>
        {hovered && hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-zinc-900 border border-orange-500/50 rounded-lg px-2.5 py-1 text-[11px] whitespace-nowrap -translate-x-1/2 -translate-y-[calc(100%+10px)]"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          >
            <span className="text-orange-400 font-medium">
              {hoveredPoint.value}
              {unit}
            </span>{' '}
            <span className="text-zinc-400">· {formatDateLabel(hoveredPoint.date)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
