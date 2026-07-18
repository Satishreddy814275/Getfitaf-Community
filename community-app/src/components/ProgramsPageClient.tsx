'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { selectProgram } from '@/app/workouts/actions'
import ProgramPickerCard from './ProgramPickerCard'
import ProgramPreviewModal from './ProgramPreviewModal'
import SwitchProgramModal from './SwitchProgramModal'
import type { WorkoutPlanDay } from '@/types'

interface TemplateRow {
  id: string
  name: string
  level: string
  equipmentTier: string
  durationWeeks: number
  description: string | null
  isStartHere: boolean
  days: WorkoutPlanDay[]
}

interface CurrentProgram {
  templateId: string
  name: string
  level: string
  equipmentTier: string
  durationWeeks: number
  doneCells: number
  totalCells: number
}

// Owns everything the plain server-rendered list used to leave to a
// bare <form action={selectProgram}> per card - the switch-
// confirmation decision needs the current program's own progress
// (not available to an individual card), and the preview modal is
// shared across every card rather than each one managing its own
// overlay state. templates/currentProgram are pre-fetched server-side
// in programs/page.tsx (including each template's full structured_plan
// days, needed for the preview modal) and just handed down here.
export default function ProgramsPageClient({
  templates,
  currentProgram,
}: {
  templates: TemplateRow[]
  currentProgram: CurrentProgram | null
}) {
  const [isPending, startTransition] = useTransition()
  const [browseOpen, setBrowseOpen] = useState(false)
  const [previewFor, setPreviewFor] = useState<{ name: string; days: WorkoutPlanDay[] } | null>(null)
  const [switchTarget, setSwitchTarget] = useState<{ id: string; name: string } | null>(null)

  const progressPercent =
    currentProgram && currentProgram.totalCells > 0
      ? Math.round((currentProgram.doneCells / currentProgram.totalCells) * 100)
      : 0

  function doSwitch(id: string) {
    startTransition(async () => {
      await selectProgram(id)
    })
  }

  // 85%+ through the current program (or no current program at all) -
  // switch immediately, no confirmation. Satish's explicit cutoff:
  // "most people don't stop their program at that point anyways."
  // Below that, show the blocking stay-or-switch modal instead of
  // switching right away.
  function requestSwitch(id: string, name: string) {
    if (!currentProgram || progressPercent >= 85) {
      doSwitch(id)
      return
    }
    setSwitchTarget({ id, name })
  }

  const others = currentProgram ? templates.filter((t) => t.id !== currentProgram.templateId) : templates
  // Recommended (Start here) programs float to the top of whichever
  // list they're shown in - badge alone wasn't enough per Satish's
  // ask to actually highlight Foundations, not just tag it.
  const sortedOthers = [...others].sort((a, b) => Number(b.isStartHere) - Number(a.isStartHere))

  return (
    <div>
      {currentProgram && (
        <div className="glass rounded-2xl border border-orange-500/30 p-5 mb-6">
          <p className="text-orange-400 text-xs font-semibold uppercase tracking-wide mb-1">Current program</p>
          <p className="text-white font-semibold">{currentProgram.name}</p>
          <p className="text-zinc-500 text-xs mt-1 mb-3">
            {currentProgram.level} &middot; {currentProgram.equipmentTier} &middot; {currentProgram.durationWeeks} week
            {currentProgram.durationWeeks === 1 ? '' : 's'}
          </p>

          {currentProgram.totalCells > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-zinc-400 text-xs whitespace-nowrap">{progressPercent}% complete</span>
            </div>
          )}

          <p className="text-zinc-400 text-xs mb-4">We recommend finishing this before switching programs.</p>

          <Link
            href="/workouts"
            className="inline-block bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Go to workouts
          </Link>
        </div>
      )}

      {currentProgram ? (
        <div>
          <button
            type="button"
            onClick={() => setBrowseOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 bg-zinc-900 rounded-lg px-3 py-2.5 mb-3"
          >
            <span className="text-zinc-300 text-sm font-medium">Browse other programs</span>
            <span className="text-zinc-500 text-xs shrink-0">{browseOpen ? '▴' : '▾'}</span>
          </button>
          {browseOpen && (
            <div className="space-y-3">
              {sortedOthers.map((t) => (
                <ProgramPickerCard
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  level={t.level}
                  equipmentTier={t.equipmentTier}
                  durationWeeks={t.durationWeeks}
                  description={t.description}
                  isStartHere={t.isStartHere}
                  days={t.days}
                  onPreview={(name, days) => setPreviewFor({ name, days })}
                  onChoose={requestSwitch}
                  isChoosing={isPending}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedOthers.map((t) => (
            <ProgramPickerCard
              key={t.id}
              id={t.id}
              name={t.name}
              level={t.level}
              equipmentTier={t.equipmentTier}
              durationWeeks={t.durationWeeks}
              description={t.description}
              isStartHere={t.isStartHere}
              days={t.days}
              onPreview={(name, days) => setPreviewFor({ name, days })}
              onChoose={requestSwitch}
              isChoosing={isPending}
            />
          ))}
        </div>
      )}

      {previewFor && (
        <ProgramPreviewModal name={previewFor.name} days={previewFor.days} onClose={() => setPreviewFor(null)} />
      )}

      {switchTarget && currentProgram && (
        <SwitchProgramModal
          currentProgramName={currentProgram.name}
          isPending={isPending}
          onStay={() => setSwitchTarget(null)}
          onSwitchAnyway={() => {
            doSwitch(switchTarget.id)
            setSwitchTarget(null)
          }}
        />
      )}
    </div>
  )
}
