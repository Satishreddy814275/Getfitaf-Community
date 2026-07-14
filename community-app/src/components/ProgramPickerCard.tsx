'use client'

import { useState } from 'react'
import { selectProgram } from '@/app/workouts/actions'
import { renderRichText } from '@/lib/richText'

interface ProgramPickerCardProps {
  id: string
  name: string
  level: string
  equipmentTier: string
  durationWeeks: number
  description: string | null
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
}: ProgramPickerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const trimmedDescription = description?.trim() || ''
  const preview = firstLine(trimmedDescription)
  const hasMore = trimmedDescription.length > preview.length

  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-white font-semibold">{name}</p>
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

      <form action={selectProgram.bind(null, id)}>
        <button
          type="submit"
          className="bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          Choose this program
        </button>
      </form>
    </div>
  )
}
