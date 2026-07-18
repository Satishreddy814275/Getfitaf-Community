'use client'

import { useState } from 'react'
import { renderRichText } from '@/lib/richText'
import type { WorkoutPlanDay } from '@/types'

interface ProgramPickerCardProps {
  id: string
  name: string
  level: string
  equipmentTier: string
  durationWeeks: number
  description: string | null
  // Free-standing "recommended starting point" flag (see
  // migration add_is_start_here_to_program_templates) - not tied to
  // level, since a future proper tag/filter system may cover level
  // separately. Renders a small "Start here" badge when true.
  isStartHere?: boolean
  days: WorkoutPlanDay[]
  onPreview: (name: string, days: WorkoutPlanDay[]) => void
  // Choosing is no longer a bare form submit - the parent
  // (ProgramsPageClient) owns the switch-confirmation decision (skip
  // it entirely if there's no current program or it's 85%+ done,
  // otherwise show the "stay or switch anyway" modal) since that
  // needs cross-card context (the current program's own progress) a
  // single card doesn't have on its own.
  onChoose: (id: string, name: string) => void
  isChoosing?: boolean
}

// First non-empty line, used as the collapsed-state preview so a
// multi-paragraph description doesn't dominate the picker once there
// are several programs to scroll through - same "collapsed by
// default, expand on demand" pattern as the coach-note and exercise-
// video panels elsewhere in the app.
function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) || ''
  )
}

export default function ProgramPickerCard({
  id,
  name,
  level,
  equipmentTier,
  durationWeeks,
  description,
  isStartHere,
  days,
  onPreview,
  onChoose,
  isChoosing,
}: ProgramPickerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const trimmedDescription = description?.trim() || ''
  const preview = firstLine(trimmedDescription)
  const hasMore = trimmedDescription.length > preview.length

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-white font-semibold">{name}</p>
        {isStartHere && (
          <span className="shrink-0 bg-orange-500/10 text-orange-400 text-[11px] font-semibold px-2 py-0.5 rounded-full">
            Start here
          </span>
        )}
      </div>
      {isStartHere && (
        <p className="text-zinc-500 text-xs mb-2">
          Recommended if you&apos;re just getting started or had a significant break in your journey.
        </p>
      )}
      <p className="text-zinc-500 text-xs mt-1 mb-3">
        {level} &middot; {equipmentTier} &middot; {durationWeeks} week{durationWeeks === 1 ? '' : 's'}
      </p>

      {trimmedDescription && (
        <div className="text-zinc-300 text-sm mb-4">
          <div className="space-y-2">{expanded ? renderRichText(trimmedDescription) : <p>{renderRichText(preview)}</p>}</div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 text-xs font-medium text-orange-400 hover:text-orange-300 transition"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onChoose(id, name)}
          disabled={isChoosing}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          Choose this program
        </button>
        <button
          type="button"
          onClick={() => onPreview(name, days)}
          className="text-xs font-medium text-zinc-400 hover:text-white transition"
        >
          See what&apos;s inside
        </button>
      </div>
    </div>
  )
}
