'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleProgramPublished, updateProgramDay, updateProgramMetadata } from '@/app/admin/actions'
import { collapseExercisesToBlocks, type EditableBlock } from '@/lib/workoutBlocks'
import { renderRichText } from '@/lib/richText'
import type { WorkoutPlanDay } from '@/types'

interface ProgramRow {
  id: string
  name: string
  level: string
  equipment_tier: string
  duration_weeks: number
  description: string | null
  is_published: boolean
  // Editable here via "Edit day" (see DayEditor) - grouping into
  // rounds, ungrouping, renaming/swapping exercises, and tweaking
  // sets/reps/rest/timer/trackWeight all live in that one screen, so
  // Satish never has to bounce between separate edit surfaces or fall
  // back to Claude + SQL just to restructure a day.
  structured_plan: { days: WorkoutPlanDay[] } | null
}

// Compact read-only row - name + sets×reps + rest, round shown as a
// small tag when present. This is just the at-a-glance view; all
// editing (numbers, grouping, renaming) happens in DayEditor below so
// there's exactly one place to make changes, not a quick-edit surface
// here plus a "real" editor elsewhere.
function ReadOnlyExerciseRow({ e }: { e: WorkoutPlanDay['exercises'][number] }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs border-b border-zinc-900 last:border-b-0">
      <span className="text-zinc-300">
        {e.name}
        {e.round ? <span className="text-zinc-600"> · Round {e.round}</span> : null}
      </span>
      <span className="text-zinc-500 text-right shrink-0">
        {e.sets}×{e.reps}
        {e.restSeconds ? <span className="text-zinc-600"> · rest {e.restSeconds}s</span> : null}
      </span>
    </div>
  )
}

type PhaseItem =
  | { type: 'single'; blocks: [EditableBlock] }
  | { type: 'group'; groupId: string; blocks: EditableBlock[] }

// Groups a phase's flat block list into displayable items - a
// standalone block is its own item, and a round group collapses to
// one item covering all its members (rendered as a single boxed unit
// with a shared round-count control), in the order blocks first appear.
function itemsForPhase(phaseBlocks: EditableBlock[]): PhaseItem[] {
  const items: PhaseItem[] = []
  const seenGroups = new Set<string>()
  for (const b of phaseBlocks) {
    if (b.groupId == null) {
      items.push({ type: 'single', blocks: [b] })
      continue
    }
    if (seenGroups.has(b.groupId)) continue
    seenGroups.add(b.groupId)
    items.push({
      type: 'group',
      groupId: b.groupId,
      blocks: phaseBlocks.filter((x) => x.groupId === b.groupId),
    })
  }
  return items
}

// Shared reps/rest/timer/trackWeight inputs for one block - identical
// whether the block is standalone or one member of a round group.
// `showSets` toggles the per-block "Sets" input, which only makes
// sense for standalone blocks (grouped blocks share one round-count
// input on the group header instead, since they must stay in sync).
function BlockNumberFields({
  block,
  onUpdateBlock,
  showSets,
}: {
  block: EditableBlock
  onUpdateBlock: (id: string, fields: Partial<EditableBlock>) => void
  showSets: boolean
}) {
  return (
    <>
      {showSets && (
        <label className="flex items-center gap-1 text-[11px] text-zinc-500">
          Sets
          <input
            type="number"
            min={1}
            value={block.setsCount}
            onChange={(e) =>
              onUpdateBlock(block.id, { setsCount: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          />
        </label>
      )}
      <label className="flex items-center gap-1 text-[11px] text-zinc-500">
        Reps
        <input
          value={block.reps}
          onChange={(e) => onUpdateBlock(block.id, { reps: e.target.value })}
          className="w-16 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-zinc-500">
        Rest
        <input
          value={block.restSeconds ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim()
            onUpdateBlock(block.id, { restSeconds: v === '' ? null : Math.max(0, Number(v) || 0) })
          }}
          placeholder="—"
          className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white placeholder-zinc-700"
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-zinc-500">
        Timer
        <input
          value={block.timerSeconds ?? ''}
          onChange={(e) => {
            const v = e.target.value.trim()
            onUpdateBlock(block.id, { timerSeconds: v === '' ? null : Math.max(0, Number(v) || 0) })
          }}
          placeholder="—"
          className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white placeholder-zinc-700"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={block.trackWeight}
          onChange={(e) => onUpdateBlock(block.id, { trackWeight: e.target.checked })}
          className="accent-orange-500"
        />
        Weight
      </label>
    </>
  )
}

// One phase item, rendered Trainerize-style: a standalone block is one
// row with a checkbox (for multi-select into a new group) and inline
// fields; a round group is a bordered box with a shared "Rounds" input
// on the header (editing it moves every member's round count at once)
// plus an Ungroup link, and one child row per exercise underneath -
// each with its own name/reps/rest/timer/weight, so editing e.g.
// "I/T/Ws" updates it everywhere it appears since there's only one row
// for it, not one row per round.
function BlockItemEditor({
  item,
  selected,
  onToggleSelect,
  onUpdateBlock,
  onUpdateGroupSetsCount,
  onUngroup,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  item: PhaseItem
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onUpdateBlock: (id: string, fields: Partial<EditableBlock>) => void
  onUpdateGroupSetsCount: (groupId: string, setsCount: number) => void
  onUngroup: (groupId: string) => void
  onRemove: (id: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const moveButtons = (
    <span className="flex flex-col leading-none shrink-0">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="text-zinc-600 hover:text-white disabled:opacity-30 text-[10px]"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="text-zinc-600 hover:text-white disabled:opacity-30 text-[10px]"
      >
        ▼
      </button>
    </span>
  )

  if (item.type === 'single') {
    const b = item.blocks[0]
    return (
      <div className="flex items-start gap-2 bg-zinc-900/40 rounded-lg px-2 py-1.5">
        {moveButtons}
        <input
          type="checkbox"
          checked={selected.has(b.id)}
          onChange={() => onToggleSelect(b.id)}
          className="mt-1.5 accent-orange-500"
        />
        <div className="flex-1 flex flex-wrap items-center gap-1.5">
          <input
            value={b.name}
            onChange={(e) => onUpdateBlock(b.id, { name: e.target.value })}
            className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          />
          <BlockNumberFields block={b} onUpdateBlock={onUpdateBlock} showSets />
        </div>
        <button
          type="button"
          onClick={() => onRemove(b.id)}
          className="text-zinc-600 hover:text-red-400 text-[11px] shrink-0 mt-1"
        >
          Remove
        </button>
      </div>
    )
  }

  const rounds = item.blocks[0].setsCount
  return (
    <div className="border border-zinc-800 rounded-lg px-2 py-1.5 bg-zinc-900/20">
      <div className="flex items-center gap-2 mb-1.5">
        {moveButtons}
        <span className="text-[11px] text-orange-400 font-medium">Round group</span>
        <label className="flex items-center gap-1 text-[11px] text-zinc-500">
          Rounds
          <input
            type="number"
            min={1}
            value={rounds}
            onChange={(e) =>
              onUpdateGroupSetsCount(item.groupId, Math.max(1, Number(e.target.value) || 1))
            }
            className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          />
        </label>
        <button
          type="button"
          onClick={() => onUngroup(item.groupId)}
          className="text-[11px] text-zinc-500 hover:text-white transition ml-auto"
        >
          Ungroup
        </button>
      </div>
      <div className="space-y-1 pl-1">
        {item.blocks.map((b) => (
          <div key={b.id} className="flex items-start gap-2">
            <input
              value={b.name}
              onChange={(e) => onUpdateBlock(b.id, { name: e.target.value })}
              className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
            />
            <BlockNumberFields block={b} onUpdateBlock={onUpdateBlock} showSets={false} />
            <button
              type="button"
              onClick={() => onRemove(b.id)}
              className="text-zinc-600 hover:text-red-400 text-[11px] shrink-0 mt-1"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const PHASES: Array<'warmup' | 'main' | 'cooldown'> = ['warmup', 'main', 'cooldown']
const PHASE_LABELS: Record<string, string> = { warmup: 'Warm-up', main: 'Workout', cooldown: 'Cool-down' }

// The unified "Tier 2" day editor - everything from a quick number
// tweak to full restructuring (grouping into rounds, ungrouping,
// renaming/swapping an exercise) happens on this one screen, per
// Trainerize's own editor pattern: a table of exercises, checkbox
// multi-select, a Group action, an editable round count, Ungroup, and
// reordering (here via up/down rather than drag, to keep this a
// dependency-free first build).
//
// Internally this operates on EditableBlock[] (see workoutBlocks.ts) -
// one row per exercise regardless of how many rounds/sets it repeats -
// and only expands back to the flat, unrolled exercise list inside
// updateProgramDay when saved. Phase is fixed per section (warm-up/
// workout/cool-down); blocks never move between phases here, matching
// "keep the phase the same" - only order and grouping within a phase
// change.
function DayEditor({
  programId,
  week,
  day,
  exercises,
  onClose,
}: {
  programId: string
  week: number
  day: number
  exercises: WorkoutPlanDay['exercises']
  onClose: () => void
}) {
  const router = useRouter()
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => collapseExercisesToBlocks(exercises))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)

  function updateBlock(id: string, fields: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)))
  }

  // A group's round count is shared by definition - editing it here
  // applies to every member at once, same reasoning as renaming a
  // block applying across every round it represents.
  function updateGroupSetsCount(groupId: string, setsCount: number) {
    setBlocks((prev) => prev.map((b) => (b.groupId === groupId ? { ...b, setsCount } : b)))
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Groups every selected (currently ungrouped) block in this phase
  // into a new round group. Default round count is the max of the
  // selected blocks' own set counts - e.g. combining three exercises
  // that were each 3 straight sets defaults to a 3-round circuit -
  // adjustable afterward via the group's "Rounds" input.
  function handleGroup(phase: 'warmup' | 'main' | 'cooldown') {
    const targets = blocks.filter((b) => b.phase === phase && selected.has(b.id) && b.groupId == null)
    if (targets.length < 2) return
    const ids = new Set(targets.map((b) => b.id))
    const groupId = `g${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const defaultRounds = Math.max(...targets.map((b) => b.setsCount), 1)
    setBlocks((prev) => prev.map((b) => (ids.has(b.id) ? { ...b, groupId, setsCount: defaultRounds } : b)))
    setSelected(new Set())
  }

  // Splits a round group back into standalone exercises, each keeping
  // the group's current round count as its own straight-set count -
  // e.g. ungrouping a 3-round circuit gives each exercise 3 straight
  // sets rather than resetting anything.
  function handleUngroup(groupId: string) {
    setBlocks((prev) => prev.map((b) => (b.groupId === groupId ? { ...b, groupId: null } : b)))
  }

  function addExercise(phase: 'warmup' | 'main' | 'cooldown') {
    setBlocks((prev) => [
      ...prev,
      {
        id: `new${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name: 'New exercise',
        setsCount: 1,
        reps: '10',
        restSeconds: null,
        timerSeconds: null,
        trackWeight: true,
        phase,
        groupId: null,
      },
    ])
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  // Reorders a whole item (a standalone block, or an entire group)
  // within its phase. expandBlocksToExercises always emits warm-up,
  // then workout, then cool-down regardless of storage order, so only
  // the relative order *within* one phase's slice of `blocks` actually
  // affects the saved result - reordering only needs to touch that slice.
  function moveItem(phase: 'warmup' | 'main' | 'cooldown', itemIndex: number, direction: -1 | 1) {
    setBlocks((prev) => {
      const phaseIndices = prev.map((b, i) => (b.phase === phase ? i : -1)).filter((i) => i !== -1)
      const items = itemsForPhase(prev.filter((b) => b.phase === phase))
      const targetIndex = itemIndex + direction
      if (targetIndex < 0 || targetIndex >= items.length) return prev

      const reordered = [...items]
      ;[reordered[itemIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[itemIndex]]
      const flatPhaseBlocks = reordered.flatMap((i) => i.blocks)

      const next = [...prev]
      phaseIndices.forEach((originalIdx, i) => {
        next[originalIdx] = flatPhaseBlocks[i]
      })
      return next
    })
  }

  async function handleSave() {
    setIsSaving(true)
    await updateProgramDay(programId, week, day, blocks)
    setIsSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="mt-2 space-y-4">
      {PHASES.map((phase) => {
        const phaseBlocks = blocks.filter((b) => b.phase === phase)
        if (phaseBlocks.length === 0 && phase !== 'main') return null
        const items = itemsForPhase(phaseBlocks)
        const hasSelectionInPhase = [...selected].some(
          (id) => blocks.find((b) => b.id === id)?.phase === phase
        )

        return (
          <div key={phase}>
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
                <button
                  type="button"
                  onClick={() => addExercise(phase)}
                  className="text-[11px] font-medium text-zinc-500 hover:text-white transition"
                >
                  + Add exercise
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              {items.length === 0 && <p className="text-xs text-zinc-700 italic">Nothing here yet.</p>}
              {items.map((item, idx) => (
                <BlockItemEditor
                  key={item.type === 'group' ? item.groupId : item.blocks[0].id}
                  item={item}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onUpdateBlock={updateBlock}
                  onUpdateGroupSetsCount={updateGroupSetsCount}
                  onUngroup={handleUngroup}
                  onRemove={removeBlock}
                  onMoveUp={() => moveItem(phase, idx, -1)}
                  onMoveDown={() => moveItem(phase, idx, 1)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < items.length - 1}
                />
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {isSaving ? 'Saving...' : 'Save day'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-xs font-medium transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function DayPreview({ programId, day }: { programId: string; day: WorkoutPlanDay }) {
  const [open, setOpen] = useState(false)
  const [isEditingDay, setIsEditingDay] = useState(false)
  const isRestDay = day.exercises.length === 0

  return (
    <div className="border-t border-zinc-800 first:border-t-0 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isRestDay}
        className="w-full flex items-center justify-between text-left disabled:cursor-default"
      >
        <span className="text-sm text-zinc-300">
          Day {day.day} — {day.label}
          {day.isCardio && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-orange-400">Cardio</span>
          )}
        </span>
        <span className="text-xs text-zinc-600">
          {isRestDay ? 'Rest' : `${day.exercises.length} exercises ${open ? '▲' : '▼'}`}
        </span>
      </button>
      {open && !isRestDay && (
        <div className="mt-2 pl-2">
          {day.notes && <p className="text-xs text-zinc-500 italic mb-1.5">{day.notes}</p>}
          {isEditingDay ? (
            <DayEditor
              programId={programId}
              week={day.week}
              day={day.day}
              exercises={day.exercises}
              onClose={() => setIsEditingDay(false)}
            />
          ) : (
            <>
              {day.exercises.map((e, i) => (
                <ReadOnlyExerciseRow key={i} e={e} />
              ))}
              <button
                type="button"
                onClick={() => setIsEditingDay(true)}
                className="mt-2 text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
              >
                Edit day
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function WeekPreview({
  programId,
  week,
  days,
}: {
  programId: string
  week: number
  days: WorkoutPlanDay[]
}) {
  const [open, setOpen] = useState(false)
  const sorted = [...days].sort((a, b) => a.day - b.day)

  return (
    <div className="glass rounded-xl p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-white">Week {week}</span>
        <span className="text-xs text-zinc-500">
          {days.length} day{days.length === 1 ? '' : 's'} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="mt-1">
          {sorted.map((d) => (
            <DayPreview key={d.day} programId={programId} day={d} />
          ))}
        </div>
      )}
    </div>
  )
}

// Week-by-week / day-by-day breakdown of a program's actual content,
// so Satish can check what's in a program before publishing it, and
// now also fully restructure a day - regroup into rounds, ungroup,
// rename/swap exercises, reorder, tweak sets/reps/rest/timer/
// trackWeight - via "Edit day" (see DayEditor), without asking Claude
// or opening Supabase. Collapsed by default at every level (weeks,
// then days) since a 4-week program can easily run 20-40+ exercises
// per day.
function WorkoutPreview({ programId, days }: { programId: string; days: WorkoutPlanDay[] }) {
  if (days.length === 0) {
    return <p className="text-xs text-zinc-600 italic mt-3">No workout content yet.</p>
  }
  const weeks = Array.from(new Set(days.map((d) => d.week))).sort((a, b) => a - b)

  return (
    <div className="mt-3 space-y-2">
      {weeks.map((w) => (
        <WeekPreview key={w} programId={programId} week={w} days={days.filter((d) => d.week === w)} />
      ))}
    </div>
  )
}

// Wraps (or unwraps) the current textarea selection with a marker pair
// - "**" for bold, "*" for italic. If nothing's selected, inserts a
// placeholder between the markers instead so there's something visible
// to type over, rather than leaving an empty "****" a user has to
// notice and delete.
function wrapSelection(
  textarea: HTMLTextAreaElement,
  marker: string,
  placeholder: string,
  onChange: (next: string) => void
) {
  const { selectionStart, selectionEnd, value } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const already = selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2
  const inserted = already ? selected.slice(marker.length, selected.length - marker.length) : `${marker}${selected || placeholder}${marker}`
  const next = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd)
  onChange(next)

  const cursorStart = selectionStart + (already ? 0 : marker.length)
  const cursorEnd = cursorStart + (already ? inserted.length : inserted.length - marker.length * 2)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorStart, cursorEnd)
  })
}

// Prefixes every selected line (expanding the selection out to full
// lines first) with "- ", or removes the prefix if every line already
// has one - same toggle-on/toggle-off feel as the bold/italic buttons.
function toggleBulletList(textarea: HTMLTextAreaElement, onChange: (next: string) => void) {
  const { selectionStart, selectionEnd, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const nextBreak = value.indexOf('\n', selectionEnd)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak

  const selectedLines = value.slice(lineStart, lineEnd).split('\n')
  const allPrefixed = selectedLines.every((l) => l.startsWith('- ') || l.trim() === '')
  const newLines = selectedLines.map((l) => {
    if (l.trim() === '') return l
    return allPrefixed ? l.replace(/^- /, '') : l.startsWith('- ') ? l : `- ${l}`
  })
  const replacement = newLines.join('\n')

  const next = value.slice(0, lineStart) + replacement + value.slice(lineEnd)
  onChange(next)

  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(lineStart, lineStart + replacement.length)
  })
}

function PublishToggle({
  isPublished,
  onToggle,
  pending,
}: {
  isPublished: boolean
  onToggle: () => void
  pending: boolean
}) {
  return (
    <button
      onClick={onToggle}
      disabled={pending}
      type="button"
      aria-label={isPublished ? 'Unpublish program' : 'Publish program'}
      className="flex items-center gap-2 disabled:opacity-50"
    >
      <span className={`text-xs font-medium ${isPublished ? 'text-orange-400' : 'text-zinc-500'}`}>
        {isPublished ? 'Published' : 'Draft'}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          isPublished ? 'bg-orange-500' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
            isPublished ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  )
}

function ProgramCard({ program }: { program: ProgramRow }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublished, setIsPublished] = useState(program.is_published)
  const [isTogglePending, setIsTogglePending] = useState(false)
  const [showWorkouts, setShowWorkouts] = useState(false)

  const [name, setName] = useState(program.name)
  const [level, setLevel] = useState(program.level)
  const [equipmentTier, setEquipmentTier] = useState(program.equipment_tier)
  const [durationWeeks, setDurationWeeks] = useState(String(program.duration_weeks))
  const [description, setDescription] = useState(program.description || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() {
    setName(program.name)
    setLevel(program.level)
    setEquipmentTier(program.equipment_tier)
    setDurationWeeks(String(program.duration_weeks))
    setDescription(program.description || '')
    setIsEditing(true)
  }

  async function handleToggle() {
    const next = !isPublished
    setIsTogglePending(true)
    setIsPublished(next)
    await toggleProgramPublished(program.id, next)
    setIsTogglePending(false)
  }

  async function handleSave() {
    setIsSaving(true)
    await updateProgramMetadata(program.id, {
      name,
      level,
      equipmentTier,
      durationWeeks: Number(durationWeeks) || program.duration_weeks,
      description,
    })
    setIsSaving(false)
    setIsEditing(false)
  }

  if (!isEditing) {
    return (
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <p className="text-white font-semibold">{program.name}</p>
            <p className="text-zinc-500 text-xs mt-1">
              {program.level} &middot; {program.equipment_tier} &middot; {program.duration_weeks} week
              {program.duration_weeks === 1 ? '' : 's'}
            </p>
          </div>
          <PublishToggle isPublished={isPublished} onToggle={handleToggle} pending={isTogglePending} />
        </div>
        {program.description ? (
          <div className="text-zinc-300 text-sm space-y-2">{renderRichText(program.description)}</div>
        ) : (
          <p className="text-zinc-600 text-sm italic">No description yet.</p>
        )}
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={startEdit}
            className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
          >
            Edit program
          </button>
          <button
            onClick={() => setShowWorkouts((v) => !v)}
            className="text-xs font-medium text-zinc-400 hover:text-white transition"
          >
            {showWorkouts ? 'Hide workouts' : 'View workouts'}
          </button>
        </div>
        {showWorkouts && (
          <WorkoutPreview programId={program.id} days={program.structured_plan?.days ?? []} />
        )}
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="grid sm:grid-cols-2 gap-3 flex-1 min-w-[280px]">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Program title</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Duration (weeks)</label>
            <input
              type="number"
              min={1}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Level</label>
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="e.g. beginner"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Equipment tier</label>
            <input
              type="text"
              value={equipmentTier}
              onChange={(e) => setEquipmentTier(e.target.value)}
              placeholder="e.g. minimal_equipment"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
          </div>
        </div>
        <PublishToggle isPublished={isPublished} onToggle={handleToggle} pending={isTogglePending} />
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => textareaRef.current && wrapSelection(textareaRef.current, '**', 'bold text', setDescription)}
            className="text-xs font-bold px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => textareaRef.current && wrapSelection(textareaRef.current, '*', 'italic text', setDescription)}
            className="text-xs italic px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
          >
            i
          </button>
          <button
            type="button"
            onClick={() => textareaRef.current && toggleBulletList(textareaRef.current, setDescription)}
            className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
          >
            • List
          </button>
          <span className="text-zinc-600 text-[11px] ml-1">
            Select text first, then tap a button to format it
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Who is this program for? What should someone know before picking it? A few sentences is great."
            rows={7}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
          />
          <div>
            <p className="text-zinc-600 text-[11px] mb-1">Preview - exactly how members will see it</p>
            <div className="glass rounded-xl p-3 min-h-[7rem]">
              <p className="text-white font-semibold text-sm">{name || 'Untitled program'}</p>
              <p className="text-zinc-500 text-xs mt-1 mb-2">
                {level || '-'} &middot; {equipmentTier || '-'} &middot; {durationWeeks || '-'} week
                {durationWeeks === '1' ? '' : 's'}
              </p>
              {description.trim() ? (
                <div className="text-zinc-300 text-sm space-y-2">{renderRichText(description)}</div>
              ) : (
                <p className="text-zinc-600 text-sm italic">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim() || !level.trim() || !equipmentTier.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => setIsEditing(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-sm font-medium transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AdminProgramsList({ programs }: { programs: ProgramRow[] }) {
  if (programs.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-12">No programs yet.</p>
  }

  return (
    <div className="space-y-4">
      {programs.map((program) => (
        <ProgramCard key={program.id} program={program} />
      ))}
    </div>
  )
}
