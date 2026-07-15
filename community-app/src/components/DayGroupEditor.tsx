'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProgramDayGroup } from '@/app/admin/actions'
import { buildDayGroups, buildProgressionRows, type DayGroup, type ProgressionCell } from '@/lib/dayGroups'
import type { EditableBlock } from '@/lib/workoutBlocks'
import type { ExercisePoolEntry } from '@/lib/exercisePool'
import type { WorkoutPlanDay } from '@/types'
import {
  AddExerciseControl,
  BlockItemEditor,
  itemsForPhase,
  PHASES,
  PHASE_LABELS,
} from './AdminProgramsList'

type Phase = 'warmup' | 'main' | 'cooldown'

// Small inline number/text fields for one exercise's progression at
// one occurrence - the per-week-editable counterpart to the shared
// structure fields (name/grouping/order) edited above in
// BlockItemEditor. `showSets` mirrors the same standalone-vs-grouped
// split used everywhere else: a standalone exercise has its own Sets
// field, a round-group member doesn't (its rounds live on the group's
// header row instead, shared across all members for that occurrence).
function ProgressionCellFields({
  cell,
  showSets,
  onChange,
}: {
  cell: ProgressionCell
  showSets: boolean
  onChange: (fields: Partial<ProgressionCell>) => void
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {showSets && (
        <input
          type="number"
          min={1}
          value={cell.setsCount}
          onChange={(e) => onChange({ setsCount: Math.max(1, Number(e.target.value) || 1) })}
          title="Sets"
          className="w-10 bg-zinc-900 border border-zinc-800 rounded px-1 py-1 text-xs text-white"
        />
      )}
      <input
        value={cell.reps}
        onChange={(e) => onChange({ reps: e.target.value })}
        placeholder="reps"
        title="Reps"
        className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1 py-1 text-xs text-white placeholder-zinc-700"
      />
      <input
        value={cell.restSeconds ?? ''}
        onChange={(e) => {
          const v = e.target.value.trim()
          onChange({ restSeconds: v === '' ? null : Math.max(0, Number(v) || 0) })
        }}
        placeholder="rest"
        title="Rest (s)"
        className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1 py-1 text-xs text-white placeholder-zinc-700"
      />
      <input
        value={cell.timerSeconds ?? ''}
        onChange={(e) => {
          const v = e.target.value.trim()
          onChange({ timerSeconds: v === '' ? null : Math.max(0, Number(v) || 0) })
        }}
        placeholder="timer"
        title="Timer (s)"
        className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1 py-1 text-xs text-white placeholder-zinc-700"
      />
    </div>
  )
}

// Column header for one occurrence - just "Week N" when that week only
// has one occurrence of this label (the common case), or "Week N (k)"
// when the same label repeats within a single week (confirmed real in
// Foundations - "Basic Prep" shows up three times, not once per week),
// so occurrences are never ambiguously double-labeled.
function occurrenceLabel(group: DayGroup, index: number): string {
  const week = group.weeks[index].week
  const sameWeekCount = group.weeks.filter((w) => w.week === week).length
  if (sameWeekCount === 1) return `Week ${week}`
  const posWithinWeek = group.weeks.slice(0, index + 1).filter((w) => w.week === week).length
  return `Week ${week} (${posWithinWeek})`
}

function defaultCell(): ProgressionCell {
  return { setsCount: 1, reps: '', restSeconds: null, timerSeconds: null }
}

// The day-group editor itself - a shared structure section (identical
// editing surface to the single-day editor: grouping, renaming,
// reordering, add/remove, all via the same BlockItemEditor/picker
// components) plus a progression grid below it for the numbers that
// are allowed to differ per occurrence. Saving writes every occurrence
// in one batch via updateProgramDayGroup.
function DayGroupEditor({
  programId,
  group,
  exercisePool,
}: {
  programId: string
  group: DayGroup
  exercisePool: ExercisePoolEntry[]
}) {
  const router = useRouter()
  const occurrenceCount = group.weeks.length

  const [templateBlocks, setTemplateBlocks] = useState<EditableBlock[]>(() => group.weeks[0].blocks)
  const [progression, setProgression] = useState<Record<string, ProgressionCell[]>>(() => {
    const rows = buildProgressionRows(group)
    const map: Record<string, ProgressionCell[]> = {}
    for (const row of rows) map[row.blockId] = row.cells
    return map
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [dragFrom, setDragFrom] = useState<{ phase: Phase; index: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ phase: Phase; index: number } | null>(null)

  function cellsFor(blockId: string): ProgressionCell[] {
    return progression[blockId] || Array.from({ length: occurrenceCount }, defaultCell)
  }

  function updateBlock(id: string, fields: Partial<EditableBlock>) {
    setTemplateBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)))
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Same grouping behavior as the single-day editor - default rounds
  // to the max of the selected exercises' own per-occurrence set
  // counts, so the group's initial displayed rounds isn't an arbitrary
  // pick right after grouping.
  function handleGroup(phase: Phase) {
    const targets = templateBlocks.filter((b) => b.phase === phase && selected.has(b.id) && b.groupId == null)
    if (targets.length < 2) return
    const ids = targets.map((b) => b.id)
    const groupId = `g${Date.now()}${Math.random().toString(36).slice(2, 6)}`

    setTemplateBlocks((prev) => prev.map((b) => (ids.includes(b.id) ? { ...b, groupId } : b)))
    setProgression((prev) => {
      const next = { ...prev }
      for (let i = 0; i < occurrenceCount; i++) {
        const maxRounds = Math.max(...ids.map((id) => (next[id] || cellsFor(id))[i]?.setsCount ?? 1), 1)
        for (const id of ids) {
          const cells = (next[id] || cellsFor(id)).slice()
          cells[i] = { ...cells[i], setsCount: maxRounds }
          next[id] = cells
        }
      }
      return next
    })
    setSelected(new Set())
  }

  function handleUngroup(groupId: string) {
    setTemplateBlocks((prev) => prev.map((b) => (b.groupId === groupId ? { ...b, groupId: null } : b)))
  }

  function addExerciseWithName(phase: Phase, name: string) {
    const id = `new${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    setTemplateBlocks((prev) => [
      ...prev,
      {
        id,
        name,
        setsCount: 1,
        reps: '',
        restSeconds: null,
        timerSeconds: null,
        trackWeight: true,
        phase,
        groupId: null,
      },
    ])
    setProgression((prev) => ({ ...prev, [id]: Array.from({ length: occurrenceCount }, defaultCell) }))
  }

  function removeBlock(id: string) {
    setTemplateBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function moveItemTo(phase: Phase, fromIndex: number, toIndex: number) {
    setTemplateBlocks((prev) => {
      const phaseIndices = prev.map((b, i) => (b.phase === phase ? i : -1)).filter((i) => i !== -1)
      const items = itemsForPhase(prev.filter((b) => b.phase === phase))
      if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return prev
      const reordered = [...items]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      const flatPhaseBlocks = reordered.flatMap((i) => i.blocks)
      const next = [...prev]
      phaseIndices.forEach((originalIdx, i) => {
        next[originalIdx] = flatPhaseBlocks[i]
      })
      return next
    })
  }

  function moveItem(phase: Phase, idx: number, direction: -1 | 1) {
    moveItemTo(phase, idx, idx + direction)
  }

  function updateCell(blockId: string, occurrenceIndex: number, fields: Partial<ProgressionCell>) {
    setProgression((prev) => {
      const cells = cellsFor(blockId).slice()
      cells[occurrenceIndex] = { ...cells[occurrenceIndex], ...fields }
      return { ...prev, [blockId]: cells }
    })
  }

  // Updates every member of a round group's rounds count for ONE
  // occurrence at once - the per-occurrence counterpart to
  // updateGroupSetsCount in the single-day editor.
  function updateGroupCellRounds(groupId: string, occurrenceIndex: number, setsCount: number) {
    const memberIds = templateBlocks.filter((b) => b.groupId === groupId).map((b) => b.id)
    setProgression((prev) => {
      const next = { ...prev }
      for (const id of memberIds) {
        const cells = (next[id] || cellsFor(id)).slice()
        cells[occurrenceIndex] = { ...cells[occurrenceIndex], setsCount }
        next[id] = cells
      }
      return next
    })
  }

  function renderPhaseRows(phase: Phase) {
    const phaseBlocks = templateBlocks.filter((b) => b.phase === phase)
    if (phaseBlocks.length === 0) return [] as React.ReactNode[]
    const items = itemsForPhase(phaseBlocks)
    const rows: React.ReactNode[] = []

    for (const item of items) {
      if (item.type === 'single') {
        const b = item.blocks[0]
        rows.push(
          <tr key={b.id} className="border-t border-zinc-900">
            <td className="py-1 pr-3 text-zinc-300 whitespace-nowrap">{b.name}</td>
            {group.weeks.map((_, i) => (
              <td key={i} className="py-1 pr-3">
                <ProgressionCellFields
                  cell={cellsFor(b.id)[i]}
                  showSets
                  onChange={(fields) => updateCell(b.id, i, fields)}
                />
              </td>
            ))}
          </tr>
        )
        continue
      }

      rows.push(
        <tr key={`${item.groupId}-header`} className="border-t border-zinc-900">
          <td className="py-1 pr-3 text-orange-400 font-medium whitespace-nowrap">Round group</td>
          {group.weeks.map((_, i) => (
            <td key={i} className="py-1 pr-3">
              <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                Rounds
                <input
                  type="number"
                  min={1}
                  value={cellsFor(item.blocks[0].id)[i]?.setsCount ?? 1}
                  onChange={(e) =>
                    updateGroupCellRounds(item.groupId, i, Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
                />
              </label>
            </td>
          ))}
        </tr>
      )
      for (const b of item.blocks) {
        rows.push(
          <tr key={b.id} className="border-t border-zinc-900/50">
            <td className="py-1 pr-3 pl-4 text-zinc-400 whitespace-nowrap">{b.name}</td>
            {group.weeks.map((_, i) => (
              <td key={i} className="py-1 pr-3">
                <ProgressionCellFields
                  cell={cellsFor(b.id)[i]}
                  showSets={false}
                  onChange={(fields) => updateCell(b.id, i, fields)}
                />
              </td>
            ))}
          </tr>
        )
      }
    }
    return rows
  }

  async function handleSave() {
    setIsSaving(true)
    const progressionByBlockId: Record<string, ProgressionCell[]> = {}
    for (const b of templateBlocks) {
      progressionByBlockId[b.id] = cellsFor(b.id)
    }
    await updateProgramDayGroup(
      programId,
      group.weeks.map((w) => ({ week: w.week, day: w.day })),
      templateBlocks,
      progressionByBlockId
    )
    setIsSaving(false)
    router.refresh()
  }

  return (
    <div className="glass rounded-xl p-3 mt-2 space-y-4">
      <div>
        <p className="text-xs text-zinc-500 mb-2">
          Structure - shared across all {occurrenceCount} occurrences of &quot;{group.label}
          &quot;. Renaming, grouping, reordering, or adding/removing an exercise here applies
          everywhere it&apos;s used.
        </p>
        {PHASES.map((phase) => {
          const phaseBlocks = templateBlocks.filter((b) => b.phase === phase)
          // Always render every phase, even empty ones - see the same
          // fix/comment in AdminProgramsList.tsx's DayEditor for why.
          const items = itemsForPhase(phaseBlocks)
          const hasSelectionInPhase = [...selected].some(
            (id) => templateBlocks.find((b) => b.id === id)?.phase === phase
          )

          return (
            <div key={phase} className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">{PHASE_LABELS[phase]}</p>
                <div className="flex items-center gap-3">
                  {hasSelectionInPhase && (
                    <button
                      type="button"
                      onClick={() => handleGroup(phase)}
                      className="text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
                    >
                      Group selected
                    </button>
                  )}
                  <AddExerciseControl pool={exercisePool} onAdd={(name) => addExerciseWithName(phase, name)} />
                </div>
              </div>
              <div className="space-y-1.5">
                {items.length === 0 && <p className="text-xs text-zinc-700 italic">Nothing here yet.</p>}
                {items.map((item, idx) => (
                  <BlockItemEditor
                    key={item.type === 'group' ? item.groupId : item.blocks[0].id}
                    item={item}
                    pool={exercisePool}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onUpdateBlock={updateBlock}
                    onUpdateGroupSetsCount={() => {}}
                    onUngroup={handleUngroup}
                    onRemove={removeBlock}
                    onMoveUp={() => moveItem(phase, idx, -1)}
                    onMoveDown={() => moveItem(phase, idx, 1)}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < items.length - 1}
                    onDragStart={() => setDragFrom({ phase, index: idx })}
                    onDragOverItem={() => setDragOver({ phase, index: idx })}
                    onDropItem={() => {
                      if (dragFrom && dragFrom.phase === phase) moveItemTo(phase, dragFrom.index, idx)
                      setDragFrom(null)
                      setDragOver(null)
                    }}
                    onDragEndItem={() => {
                      setDragFrom(null)
                      setDragOver(null)
                    }}
                    isDragOver={dragOver?.phase === phase && dragOver.index === idx}
                    showProgressionFields={false}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">
          Progression - sets/reps/rest/timer for each occurrence. Edit any cell directly.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-zinc-500 font-medium pb-1 pr-3">Exercise</th>
                {group.weeks.map((_, i) => (
                  <th key={i} className="text-left text-zinc-500 font-medium pb-1 pr-3 whitespace-nowrap">
                    {occurrenceLabel(group, i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{PHASES.flatMap((phase) => renderPhaseRows(phase))}</tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {isSaving ? 'Saving...' : `Save all ${occurrenceCount} occurrences`}
        </button>
      </div>
    </div>
  )
}

// Top-level picker - lists every day label used in the program as a
// chip (with its occurrence count), and opens the DayGroupEditor for
// whichever one is selected. Labels that appear only once have
// nothing to combine into a shared structure; labels whose occurrences
// have already drifted structurally get a plain warning instead of the
// editor, pointing back at the regular single-day "Edit day" flow to
// reconcile them first - this view never silently forces one
// occurrence's shape onto another.
export function DayGroupSection({
  programId,
  days,
  exercisePool,
}: {
  programId: string
  days: WorkoutPlanDay[]
  exercisePool: ExercisePoolEntry[]
}) {
  const groups = buildDayGroups(days)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  if (groups.length === 0) {
    return <p className="text-xs text-zinc-600 italic mt-3">No workout days to group yet.</p>
  }

  const selected = groups.find((g) => g.label === selectedLabel) || null

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {groups.map((g) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setSelectedLabel(g.label)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
              selectedLabel === g.label
                ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            {g.label} · {g.weeks.length}
            {g.weeks.length === 1 ? ' time' : ' times'}
            {!g.aligned && <span className="ml-1 text-red-400">⚠</span>}
          </button>
        ))}
      </div>

      {selected && selected.weeks.length < 2 && (
        <p className="text-xs text-zinc-600 italic">
          &quot;{selected.label}&quot; only appears once in this program - nothing to combine into
          a shared structure yet.
        </p>
      )}

      {selected && selected.weeks.length >= 2 && !selected.aligned && (
        <p className="text-xs text-red-400/90">
          The occurrences of &quot;{selected.label}&quot; in week
          {selected.misalignedWeeks.length === 1 ? '' : 's'} {selected.misalignedWeeks.join(', ')}{' '}
          don&apos;t currently have the same exercises as the others. Edit those individually via
          &quot;Edit day&quot; until they match, then this view will combine them.
        </p>
      )}

      {selected && selected.weeks.length >= 2 && selected.aligned && (
        <DayGroupEditor key={selected.label} programId={programId} group={selected} exercisePool={exercisePool} />
      )}
    </div>
  )
}
