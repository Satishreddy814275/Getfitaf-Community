'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addExerciseVideo,
  addProgramDay,
  addProgramDayFromTemplate,
  copyProgramDay,
  createProgram,
  deleteProgramDay,
  duplicateProgramWeek,
  propagateDayStructuralChanges,
  saveProgramDayAsTemplate,
  toggleProgramPublished,
  updateExerciseVideo,
  updateProgramDay,
  updateProgramMetadata,
  type DayCopyCollision,
} from '@/app/admin/actions'
import { collapseExercisesToBlocks, type EditableBlock } from '@/lib/workoutBlocks'
import { diffBlockStructure } from '@/lib/dayGroups'
import type { ExercisePoolEntry } from '@/lib/exercisePool'
import { renderRichText } from '@/lib/richText'
import { DayGroupSection } from './DayGroupEditor'
import type { WorkoutPlanDay, WorkoutTemplate } from '@/types'

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
// Read-only counterpart to BlockItemEditor/DayEditor - same
// phase-sectioned, round-grouped visual structure (so a day you've
// collapsed reads the same way it edits, once you've used the editor
// once), but with every interactive control - checkboxes, drag
// handles, inputs, buttons - stripped out, and one row per distinct
// exercise rather than one row per literal unrolled set/round (the
// previous flat list showed "Squats (1)", "Squats (2)", "Squats
// (Round 1)"... as separate lines, which is what made it hard to scan
// and didn't actually communicate the day's structure at a glance).
export function DayReadOnlyView({ exercises }: { exercises: WorkoutPlanDay['exercises'] }) {
  const blocks = collapseExercisesToBlocks(exercises)

  return (
    <div className="space-y-3 mb-2">
      {PHASES.map((phase) => {
        const phaseBlocks = blocks.filter((b) => b.phase === phase)
        if (phaseBlocks.length === 0) return null
        const items = itemsForPhase(phaseBlocks)

        return (
          <div key={phase}>
            <p className="text-[11px] uppercase tracking-wide text-zinc-600 mb-1">{PHASE_LABELS[phase]}</p>
            <div className="space-y-1">
              {items.map((item) =>
                item.type === 'single' ? (
                  <ReadOnlyBlockRow key={item.blocks[0].id} block={item.blocks[0]} />
                ) : (
                  <div key={item.groupId} className="border border-zinc-800 rounded-lg px-2 py-1.5 bg-zinc-900/20">
                    <p className="text-[11px] text-zinc-500 font-medium mb-1">
                      Round × {item.blocks[0].setsCount}
                    </p>
                    <div className="space-y-0.5 pl-1">
                      {item.blocks.map((b) => (
                        <ReadOnlyBlockRow key={b.id} block={b} hideSets />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReadOnlyBlockRow({ block, hideSets = false }: { block: EditableBlock; hideSets?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-zinc-900/40 rounded-lg px-2 py-1.5 text-xs">
      <span className="text-zinc-300">{block.name}</span>
      <span className="text-zinc-500 text-right shrink-0">
        {hideSets ? block.reps : `${block.setsCount}×${block.reps}`}
        {block.restSeconds ? <span className="text-zinc-600"> · rest {block.restSeconds}s</span> : null}
        {block.timerSeconds ? <span className="text-zinc-600"> · timer {block.timerSeconds}s</span> : null}
      </span>
    </div>
  )
}

export type PhaseItem =
  | { type: 'single'; blocks: [EditableBlock] }
  | { type: 'group'; groupId: string; blocks: EditableBlock[] }

// Groups a phase's flat block list into displayable items - a
// standalone block is its own item, and a round group collapses to
// one item covering all its members (rendered as a single boxed unit
// with a shared round-count control), in the order blocks first appear.
export function itemsForPhase(phaseBlocks: EditableBlock[]): PhaseItem[] {
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

// Searchable list backing both "Add exercise" and "swap this exercise" -
// sourced from the canonical pool (every name already used across any
// program, plus the video library) rather than a plain textbox, so a
// near-duplicate ("Squat" vs "Squats") gets caught by seeing the real
// entry in the list instead of quietly becoming a second, unmatched
// exercise. Typing something genuinely new is still one click away via
// the "Use as new exercise" row at the bottom, it's just a deliberate
// action rather than the default outcome of a stray keystroke.
//
// Each row also carries a "has video" badge and an inline add/edit
// action for that exercise's video, reusing the same addExerciseVideo/
// updateExerciseVideo actions the dedicated /admin/videos page uses -
// so a missing video can be filled in right where you notice it's
// missing, without leaving the day you're editing. Since exercise
// videos are a single shared table, saving one here updates it
// everywhere that exercise appears, same as it already does today.
function ExercisePicker({
  pool,
  onSelect,
  onClose,
}: {
  pool: ExercisePoolEntry[]
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [editingVideoFor, setEditingVideoFor] = useState<string | null>(null)
  const [videoUrlDraft, setVideoUrlDraft] = useState('')
  const [isSavingVideo, setIsSavingVideo] = useState(false)

  const q = query.trim().toLowerCase()
  const filtered = q ? pool.filter((e) => e.name.toLowerCase().includes(q)) : pool
  const exactMatch = pool.some((e) => e.name.toLowerCase() === q)

  async function handleSaveVideo(entry: ExercisePoolEntry) {
    const url = videoUrlDraft.trim()
    if (!url) return
    setIsSavingVideo(true)
    if (entry.videoId) {
      await updateExerciseVideo(entry.videoId, entry.name, url)
    } else {
      await addExerciseVideo(entry.name, url)
    }
    setIsSavingVideo(false)
    setEditingVideoFor(null)
    router.refresh()
  }

  return (
    <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl p-2">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercises..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white mb-2"
      />
      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {filtered.map((entry) => (
          <div key={entry.name} className="rounded hover:bg-zinc-900 px-1.5 py-1">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelect(entry.name)
                  onClose()
                }}
                className="flex-1 text-left text-xs text-zinc-200 truncate"
              >
                {entry.name}
              </button>
              <span className="flex items-center gap-1.5 shrink-0">
                {entry.videoUrl && (
                  <span className="text-[9px] uppercase tracking-wide text-orange-400">Video</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingVideoFor(entry.name)
                    setVideoUrlDraft(entry.videoUrl || '')
                  }}
                  className="text-[10px] text-zinc-600 hover:text-white transition"
                >
                  {entry.videoUrl ? 'Edit video' : '+ Video'}
                </button>
              </span>
            </div>
            {editingVideoFor === entry.name && (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  autoFocus
                  value={videoUrlDraft}
                  onChange={(e) => setVideoUrlDraft(e.target.value)}
                  placeholder="Video URL"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-white placeholder-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => handleSaveVideo(entry)}
                  disabled={isSavingVideo || !videoUrlDraft.trim()}
                  className="text-[10px] font-semibold text-orange-400 hover:text-orange-300 disabled:opacity-50 transition"
                >
                  {isSavingVideo ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingVideoFor(null)}
                  className="text-[10px] text-zinc-600 hover:text-white transition"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-[11px] text-zinc-600 italic px-1.5 py-1">No matches.</p>}
      </div>
      {query.trim() && !exactMatch && (
        <button
          type="button"
          onClick={() => {
            onSelect(query.trim())
            onClose()
          }}
          className="w-full text-left mt-2 pt-2 border-t border-zinc-800 text-xs text-orange-400 hover:text-orange-300 transition"
        >
          + Use &quot;{query.trim()}&quot; as a new exercise
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full text-center mt-2 text-[11px] text-zinc-600 hover:text-white transition"
      >
        Cancel
      </button>
    </div>
  )
}

// Inline "rename/swap this exercise" control - shows the current name
// as a plain label plus a small "Swap" trigger; toggling opens the
// same ExercisePicker used for adding exercises, right below the row,
// rather than a free text box. Selecting a name (existing or new)
// applies to every round instance of this block at once, same as any
// other field edit on a block.
export function ExerciseNameField({
  name,
  pool,
  onChange,
}: {
  name: string
  pool: ExercisePoolEntry[]
  onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex-1 min-w-[140px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white hover:border-orange-500/40 transition truncate"
      >
        {name}
      </button>
      {open && (
        <div className="mt-1">
          <ExercisePicker
            pool={pool}
            onSelect={(picked) => onChange(picked)}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

// "+ Add exercise" trigger for one phase - toggles the same
// ExercisePicker inline underneath the phase header rather than
// creating a blank "New exercise" placeholder immediately, so a new
// block always starts from a deliberate name choice.
export function AddExerciseControl({
  pool,
  onAdd,
}: {
  pool: ExercisePoolEntry[]
  onAdd: (name: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-zinc-500 hover:text-white transition"
      >
        + Add exercise
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1">
          <ExercisePicker
            pool={pool}
            onSelect={(name) => onAdd(name)}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

// Shared reps/rest/timer/trackWeight inputs for one block - identical
// whether the block is standalone or one member of a round group.
// `showSets` toggles the per-block "Sets" input, which only makes
// sense for standalone blocks (grouped blocks share one round-count
// input on the group header instead, since they must stay in sync).
export function BlockNumberFields({
  block,
  onUpdateBlock,
  showSets,
  showProgressionFields = true,
}: {
  block: EditableBlock
  onUpdateBlock: (id: string, fields: Partial<EditableBlock>) => void
  showSets: boolean
  // False inside the day-group structure editor (see DayGroupEditor.tsx)
  // - there, sets/reps/rest/timer are edited per-occurrence in the
  // progression grid instead, so only trackWeight (a structural
  // property, not a number that progresses week to week) stays visible
  // here.
  showProgressionFields?: boolean
}) {
  return (
    <>
      {showProgressionFields && showSets && (
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
      {showProgressionFields && (
        <label className="flex items-center gap-1 text-[11px] text-zinc-500">
          Reps
          <input
            value={block.reps}
            onChange={(e) => onUpdateBlock(block.id, { reps: e.target.value })}
            className="w-16 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          />
        </label>
      )}
      {showProgressionFields && (
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
      )}
      {showProgressionFields && (
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
      )}
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={block.trackWeight}
          onChange={(e) => onUpdateBlock(block.id, { trackWeight: e.target.checked })}
          className="accent-orange-500"
        />
        Weight
      </label>
      {/* Independent of the Weight checkbox and of Timer above -
          Timer only controls whether a timer button shows; this
          controls what the second number box actually means. A timed
          AMRAP move (timer set, "Reps" selected) still logs a rep
          count; an isometric hold (timer set, "Duration" selected)
          logs how many seconds it was actually held, which may differ
          from the prescribed Timer value. See WorkoutExercise.logAsDuration. */}
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        Log as
        <span className="inline-flex rounded border border-zinc-700 overflow-hidden">
          <button
            type="button"
            onClick={() => onUpdateBlock(block.id, { logAsDuration: false })}
            className={`px-1.5 py-1 text-[11px] transition ${
              !block.logAsDuration ? 'bg-orange-500 text-black font-medium' : 'text-zinc-500 hover:text-white'
            }`}
          >
            Reps
          </button>
          <button
            type="button"
            onClick={() => onUpdateBlock(block.id, { logAsDuration: true })}
            className={`px-1.5 py-1 text-[11px] transition ${
              block.logAsDuration ? 'bg-orange-500 text-black font-medium' : 'text-zinc-500 hover:text-white'
            }`}
          >
            Duration
          </button>
        </span>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <input
          type="checkbox"
          checked={block.perSide}
          onChange={(e) => onUpdateBlock(block.id, { perSide: e.target.checked })}
          className="accent-orange-500"
        />
        Each side
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
export function BlockItemEditor({
  item,
  pool,
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
  onDragStart,
  onDragOverItem,
  onDropItem,
  onDragEndItem,
  isDragOver,
  showProgressionFields = true,
}: {
  item: PhaseItem
  pool: ExercisePoolEntry[]
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
  onDragStart: () => void
  onDragOverItem: () => void
  onDropItem: () => void
  onDragEndItem: () => void
  isDragOver: boolean
  // False inside the day-group structure editor - rounds/sets/reps/
  // rest/timer are all per-occurrence there (see the progression grid
  // in DayGroupEditor.tsx), so this screen only edits what's shared:
  // name, grouping, order, trackWeight.
  showProgressionFields?: boolean
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

  // Drag handle - draggable itself (rather than the whole row) so
  // clicking inputs/buttons elsewhere in the row never accidentally
  // starts a drag. The row's outer container is the actual drop
  // target (onDragOver/onDrop below) so you don't have to land the
  // cursor precisely on the tiny handle to drop - only picking it up
  // requires that. Arrows stay alongside as the precise, click-only
  // alternative for anyone who'd rather not drag.
  const dragHandle = (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEndItem}
      className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-white select-none text-sm leading-none shrink-0 px-0.5"
      title="Drag to reorder"
    >
      ⠿
    </span>
  )

  const dropZoneProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      onDragOverItem()
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      onDropItem()
    },
  }

  if (item.type === 'single') {
    const b = item.blocks[0]
    return (
      <div
        {...dropZoneProps}
        className={`flex items-start gap-2 bg-zinc-900/40 rounded-lg px-2 py-1.5 border-t-2 transition ${
          isDragOver ? 'border-orange-500' : 'border-transparent'
        }`}
      >
        {dragHandle}
        {moveButtons}
        <input
          type="checkbox"
          checked={selected.has(b.id)}
          onChange={() => onToggleSelect(b.id)}
          className="mt-1.5 accent-orange-500"
        />
        {/* Remove now lives inside this same wrapping group (not as a
            separate sibling pinned to the row's far edge) so that when
            the fields wrap onto a second line on a narrower screen,
            Remove wraps down with them instead of floating alone next
            to whatever's still on the first line - everything about
            this one exercise stays visually together, same idea as
            the round-group rows below, which never had this split in
            the first place. Satish's call - the admin side doesn't
            need to look fancy, but it should still feel put-together
            for coaches using it every day. */}
        <div className="flex-1 flex flex-wrap items-center gap-1.5">
          <ExerciseNameField name={b.name} pool={pool} onChange={(name) => onUpdateBlock(b.id, { name })} />
          <BlockNumberFields
            block={b}
            onUpdateBlock={onUpdateBlock}
            showSets
            showProgressionFields={showProgressionFields}
          />
          <button
            type="button"
            onClick={() => onRemove(b.id)}
            className="text-zinc-600 hover:text-red-400 text-[11px] shrink-0"
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  const rounds = item.blocks[0].setsCount
  return (
    <div
      {...dropZoneProps}
      className={`border border-zinc-800 rounded-lg px-2 py-1.5 bg-zinc-900/20 border-t-2 transition ${
        isDragOver ? 'border-t-orange-500' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {dragHandle}
        {moveButtons}
        <span className="text-[11px] text-orange-400 font-medium">Round group</span>
        {showProgressionFields && (
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
        )}
        {!showProgressionFields && (
          <span className="text-[11px] text-zinc-600 italic">rounds vary by week - see below</span>
        )}
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
            <ExerciseNameField name={b.name} pool={pool} onChange={(name) => onUpdateBlock(b.id, { name })} />
            <BlockNumberFields
              block={b}
              onUpdateBlock={onUpdateBlock}
              showSets={false}
              showProgressionFields={showProgressionFields}
            />
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

export const PHASES: Array<'warmup' | 'main' | 'cooldown'> = ['warmup', 'main', 'cooldown']
export const PHASE_LABELS: Record<string, string> = {
  warmup: 'Warm-up',
  main: 'Workout',
  cooldown: 'Cool-down',
}

// The unified "Tier 2" day editor - everything from a quick number
// tweak to full restructuring (grouping into rounds, ungrouping,
// renaming/swapping an exercise) happens on this one screen, per
// Trainerize's own editor pattern: a table of exercises, checkbox
// multi-select, a Group action, an editable round count, Ungroup, and
// reordering via drag-and-drop (native HTML5 drag events, no extra
// dependency) or the up/down arrows - both call the same moveItemTo,
// so pick whichever's more convenient in the moment.
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
  label,
  exercises,
  notes,
  exercisePool,
  allDays,
  onClose,
}: {
  programId: string
  week: number
  day: number
  label: string
  exercises: WorkoutPlanDay['exercises']
  notes?: string
  exercisePool: ExercisePoolEntry[]
  allDays: WorkoutPlanDay[]
  onClose: () => void
}) {
  const router = useRouter()
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => collapseExercisesToBlocks(exercises))
  // Snapshot of the day's structure exactly as it was when this editor
  // was opened - never updated after that - so handleSave can diff
  // "what changed structurally this session" regardless of how many
  // renames/regroups/reorders happened along the way.
  const originalBlocksRef = useRef<EditableBlock[]>(collapseExercisesToBlocks(exercises))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notesText, setNotesText] = useState(notes || '')
  const [isSaving, setIsSaving] = useState(false)
  const [dragFrom, setDragFrom] = useState<{ phase: 'warmup' | 'main' | 'cooldown'; index: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ phase: 'warmup' | 'main' | 'cooldown'; index: number } | null>(null)

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
    // Only ever runs from the Group button's onClick, never during render
    // - same pattern/precedent as WorkoutDayPicker's resumedStartedAt.
    // eslint-disable-next-line react-hooks/purity
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

  function addExerciseWithName(phase: 'warmup' | 'main' | 'cooldown', name: string) {
    setBlocks((prev) => [
      ...prev,
      {
        id: `new${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name,
        setsCount: 1,
        reps: '10',
        restSeconds: null,
        timerSeconds: null,
        trackWeight: true,
        logAsDuration: false,
        perSide: false,
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
    moveItemTo(phase, itemIndex, itemIndex + direction)
  }

  // Generalized reorder - moves the item at fromIndex to sit at
  // toIndex within its phase (insert-at-position, not swap-adjacent),
  // so it powers both the arrow buttons (toIndex = fromIndex ± 1) and
  // drag-and-drop (toIndex = wherever it's dropped, possibly several
  // spots away in one move). Same phase-scoping reasoning as before -
  // expandBlocksToExercises always emits warm-up/workout/cool-down in
  // that fixed order regardless of storage order, so only order
  // *within* one phase's slice of `blocks` needs touching.
  function moveItemTo(phase: 'warmup' | 'main' | 'cooldown', fromIndex: number, toIndex: number) {
    setBlocks((prev) => {
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

  async function handleSave() {
    setIsSaving(true)

    // Captured before the save below - exercises still reflects how
    // this day looked when the editor opened (the prop never changes
    // during this session), so this is true only the moment a day goes
    // from nothing to something, never on a routine edit to a day that
    // already had content.
    const justBuiltFromScratch = exercises.length === 0 && blocks.length > 0

    // Structural-only diff (identity/grouping/phase - never sets/reps/
    // rest/timer) against how this day looked when the editor opened.
    // Per Satish, the same day label should always mean the same
    // exercise sequence everywhere it appears - a week that genuinely
    // needs something different gets its own label ("Upper Body B")
    // rather than diverging under this one - so any structural change
    // here silently propagates to every other day sharing this label,
    // no confirmation needed. Matched by exercise name; a sibling
    // that's missing a piece (or already has it) is just skipped for
    // that part, never guessed at.
    const changes = diffBlockStructure(originalBlocksRef.current, blocks)
    const siblings = allDays.filter(
      (d) => d.label === label && !(d.week === week && d.day === day) && d.exercises.length > 0
    )

    await updateProgramDay(programId, week, day, blocks, notesText.trim() || null)

    if (changes.length > 0 && siblings.length > 0) {
      await propagateDayStructuralChanges(programId, label, week, day, changes)
    }

    // Offered once, right when a day goes from blank to actually built
    // out - per Satish, most program-level workouts are template-worthy
    // to begin with, so this is a lower-friction path than requiring a
    // trip to the Workout Library to rebuild the same thing from
    // scratch. Never re-asked on later edits to this same day (that's
    // what the manual "Save to library" button on the collapsed day is
    // for), so tweaking sets/reps for progression next week never
    // triggers this.
    if (justBuiltFromScratch && confirm(`Save "${label}" as a new template in your Workout Library too?`)) {
      const name = window.prompt('Template name:', label)
      if (name && name.trim()) {
        await saveProgramDayAsTemplate(programId, week, day, name.trim())
      }
    }

    setIsSaving(false)
    router.refresh()
    onClose()
  }

  return (
    <div className="mt-2 space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1 block">
          Instructions shown to members
        </label>
        <textarea
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          placeholder="e.g. Circuit format - work through the moves below in order..."
          rows={2}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-700"
        />
      </div>

      {PHASES.map((phase) => {
        const phaseBlocks = blocks.filter((b) => b.phase === phase)
        // Always render every phase, even empty ones - warm-up and
        // cool-down used to only show up once they already had an
        // exercise in them, which meant there was no way to add the
        // *first* exercise to either one (their Add Exercise control
        // was hidden along with the empty section). Everything ended
        // up in "main" by default as a result.
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
                  onUpdateGroupSetsCount={updateGroupSetsCount}
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

// Shared by every copy/duplicate control below - all three follow the
// same two-step flow: call once with no overwrites approved, and if
// anything came back in `collisions` (a target that already has
// content), ask once via a single confirm listing every colliding slot
// rather than one popup per slot, then re-call with just those keys
// approved. A "no" on the confirm still counts as success for whatever
// slots WERE free and already got created on the first call - nothing
// rolls back, it just stops short of touching the slots that would
// have overwritten something.
async function runCopyWithConfirm(
  call: (
    overwriteKeys: string[]
  ) => Promise<
    | { ok: true; created: number; overwritten: number; collisions: DayCopyCollision[] }
    | { ok: false; error: string }
  >
): Promise<{ ok: true; created: number; overwritten: number } | { ok: false; error: string }> {
  const first = await call([])
  if (!first.ok) return first
  if (first.collisions.length === 0) {
    return { ok: true, created: first.created, overwritten: first.overwritten }
  }

  const list = first.collisions.map((c) => `Week ${c.week}, Day ${c.day} (${c.label})`).join('\n')
  const confirmed = confirm(
    `These already have content and will be overwritten:\n\n${list}\n\nOverwrite them?`
  )
  if (!confirmed) {
    return { ok: true, created: first.created, overwritten: 0 }
  }

  const keys = first.collisions.map((c) => `${c.week}-${c.day}`)
  const second = await call(keys)
  if (!second.ok) return second
  return { ok: true, created: first.created + second.created, overwritten: second.overwritten }
}

// Clones this day into the same day-of-week, N weeks forward - the
// direct fix for "build Monday once, repeat it for the next 3 weeks"
// instead of re-authoring each week's Monday from scratch.
function RepeatWeeklyControl({ programId, day }: { programId: string; day: WorkoutPlanDay }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [weeks, setWeeks] = useState('3')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGo() {
    const n = Number(weeks)
    if (!n || n < 1) {
      setError('Enter a number of weeks.')
      return
    }
    setIsSaving(true)
    setError(null)
    const targets = Array.from({ length: n }, (_, i) => ({ week: day.week + i + 1, day: day.day }))
    const result = await runCopyWithConfirm((overwriteKeys) =>
      copyProgramDay(programId, day.week, day.day, targets, overwriteKeys)
    )
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-zinc-400 hover:text-white transition"
      >
        Repeat weekly
      </button>
    )
  }

  return (
    <div className="bg-zinc-900/40 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-zinc-500">Repeat weekly for</span>
        <input
          type="number"
          min={1}
          value={weeks}
          onChange={(e) => {
            setWeeks(e.target.value)
            setError(null)
          }}
          className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
        />
        <span className="text-[11px] text-zinc-500">more week{weeks === '1' ? '' : 's'}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGo}
          disabled={isSaving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-[11px] font-semibold px-3 py-1 rounded-lg transition"
        >
          {isSaving ? 'Copying...' : 'Go'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-[11px] font-medium transition"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

// More general than RepeatWeeklyControl - copies this day into any
// hand-picked list of (week, day) slots, not necessarily the same day
// number or consecutive weeks. Covers "copy Tuesday's workout onto a
// different day-of-week" and "copy into just week 3, skipping 2."
function CopyToControl({ programId, day }: { programId: string; day: WorkoutPlanDay }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Array<{ week: string; day: string }>>([{ week: '', day: '' }])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateRow(i: number, field: 'week' | 'day', value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, { week: '', day: '' }])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleGo() {
    const targets = rows
      .map((r) => ({ week: Number(r.week), day: Number(r.day) }))
      .filter((t) => t.week > 0 && t.day > 0)
    if (targets.length === 0) {
      setError('Enter at least one valid week and day.')
      return
    }
    setIsSaving(true)
    setError(null)
    const result = await runCopyWithConfirm((overwriteKeys) =>
      copyProgramDay(programId, day.week, day.day, targets, overwriteKeys)
    )
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setRows([{ week: '', day: '' }])
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-zinc-400 hover:text-white transition"
      >
        Copy to...
      </button>
    )
  }

  return (
    <div className="bg-zinc-900/40 rounded-lg p-2 space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          <label className="flex flex-col text-[11px] text-zinc-500">
            Week
            <input
              type="number"
              min={1}
              value={r.week}
              onChange={(e) => updateRow(i, 'week', e.target.value)}
              className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
            />
          </label>
          <label className="flex flex-col text-[11px] text-zinc-500">
            Day
            <input
              type="number"
              min={1}
              value={r.day}
              onChange={(e) => updateRow(i, 'day', e.target.value)}
              className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
            />
          </label>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Remove target"
              className="text-zinc-600 hover:text-red-400 transition text-sm pb-1.5"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
      >
        + Add target
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGo}
          disabled={isSaving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-[11px] font-semibold px-3 py-1 rounded-lg transition"
        >
          {isSaving ? 'Copying...' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-[11px] font-medium transition"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

// The undo for a copy/repeat/duplicate landing in the wrong slot -
// previously a day could only ever be emptied out by hand, never
// actually removed.
function DeleteDayButton({ programId, day }: { programId: string; day: WorkoutPlanDay }) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    if (
      !confirm(
        `Delete Day ${day.day}: ${day.label}? This can't be undone - members' already-logged history for it is unaffected, but the day itself is gone.`
      )
    ) {
      return
    }
    setIsDeleting(true)
    const result = await deleteProgramDay(programId, day.week, day.day)
    setIsDeleting(false)
    if (!result.ok) {
      alert(result.error)
      return
    }
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-[11px] font-medium text-zinc-600 hover:text-red-400 disabled:opacity-50 transition"
    >
      {isDeleting ? 'Deleting...' : 'Delete day'}
    </button>
  )
}

// Manual promotion of an already-built day into the Workout Library -
// the same underlying action (saveProgramDayAsTemplate) DayEditor's
// first-save prompt uses, exposed here for anytime after that (an
// older day that predates this feature, or one that's evolved enough
// since to be worth saving as a fresh template). Always creates a new
// template row; doesn't touch the day itself or any existing template.
function SaveToLibraryControl({ programId, day }: { programId: string; day: WorkoutPlanDay }) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    const name = window.prompt('Save as a new template named:', day.label)
    if (!name || !name.trim()) return
    setIsSaving(true)
    const result = await saveProgramDayAsTemplate(programId, day.week, day.day, name.trim())
    setIsSaving(false)
    if (!result.ok) {
      alert(result.error)
      return
    }
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={isSaving}
      className="text-[11px] font-medium text-zinc-400 hover:text-white disabled:opacity-50 transition"
    >
      {isSaving ? 'Saving...' : 'Save to library'}
    </button>
  )
}

function DayPreview({
  programId,
  day,
  exercisePool,
  allDays,
}: {
  programId: string
  day: WorkoutPlanDay
  exercisePool: ExercisePoolEntry[]
  allDays: WorkoutPlanDay[]
}) {
  const [open, setOpen] = useState(false)
  const [isEditingDay, setIsEditingDay] = useState(false)
  // An empty exercise list could mean an intentional rest day, or a
  // brand-new day that just hasn't been built out yet via "+ Add day" -
  // both are always openable/editable now (previously this disabled
  // the whole row, which blocked building out a new program from
  // scratch since every freshly-added day starts empty).
  const isEmpty = day.exercises.length === 0

  return (
    <div className="border-t border-zinc-800 first:border-t-0 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm text-zinc-300">
          Day {day.day} — {day.label}
          {day.isCardio && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-orange-400">Cardio</span>
          )}
        </span>
        <span className="text-xs text-zinc-600">
          {isEmpty ? 'Rest / empty' : `${day.exercises.length} exercises`} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="mt-2 pl-2">
          {day.notes && <p className="text-xs text-zinc-500 italic mb-1.5">{day.notes}</p>}
          {isEditingDay ? (
            <DayEditor
              programId={programId}
              week={day.week}
              day={day.day}
              label={day.label}
              exercises={day.exercises}
              notes={day.notes}
              exercisePool={exercisePool}
              allDays={allDays}
              onClose={() => setIsEditingDay(false)}
            />
          ) : (
            <>
              {!isEmpty && <DayReadOnlyView exercises={day.exercises} />}
              {isEmpty && <p className="text-xs text-zinc-700 italic mb-2">No exercises yet.</p>}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsEditingDay(true)}
                  className="text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
                >
                  Edit day
                </button>
                {!isEmpty && (
                  <>
                    <RepeatWeeklyControl programId={programId} day={day} />
                    <CopyToControl programId={programId} day={day} />
                    <SaveToLibraryControl programId={programId} day={day} />
                  </>
                )}
                <DeleteDayButton programId={programId} day={day} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Clones every day in one week into a different week number in one
// shot - for when a whole week is "basically last week, with a couple
// of changes," rather than repeating/copying it day by day.
function DuplicateWeekControl({ programId, week }: { programId: string; week: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetWeek, setTargetWeek] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGo() {
    const w = Number(targetWeek)
    if (!w || w < 1) {
      setError('Enter a valid week number.')
      return
    }
    setIsSaving(true)
    setError(null)
    const result = await runCopyWithConfirm((overwriteKeys) =>
      duplicateProgramWeek(programId, week, w, overwriteKeys)
    )
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setTargetWeek('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-zinc-400 hover:text-white transition"
      >
        Duplicate week
      </button>
    )
  }

  return (
    <div className="bg-zinc-900/40 rounded-lg p-2 space-y-1.5 inline-block">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-zinc-500">Duplicate into week</span>
        <input
          type="number"
          min={1}
          value={targetWeek}
          onChange={(e) => {
            setTargetWeek(e.target.value)
            setError(null)
          }}
          className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGo}
          disabled={isSaving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-[11px] font-semibold px-3 py-1 rounded-lg transition"
        >
          {isSaving ? 'Duplicating...' : 'Go'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-[11px] font-medium transition"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

function WeekPreview({
  programId,
  week,
  days,
  exercisePool,
  allDays,
}: {
  programId: string
  week: number
  days: WorkoutPlanDay[]
  exercisePool: ExercisePoolEntry[]
  allDays: WorkoutPlanDay[]
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
            <DayPreview key={d.day} programId={programId} day={d} exercisePool={exercisePool} allDays={allDays} />
          ))}
          <div className="pt-2 mt-1 border-t border-zinc-800">
            <DuplicateWeekControl programId={programId} week={week} />
          </div>
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
// "+ Add day" for building out a program's calendar shape one entry at
// a time - the other half of self-service program creation alongside
// createProgram, since a brand-new program starts with zero days.
// Refuses (server-side, in addProgramDay) to clobber a (week, day)
// that already has content, so a mistyped week/day number can't wipe
// out real authored material.
// Defaults the "+ Add day" form to the next open slot after whatever's
// already in the program - the latest week that exists, with the day
// number one past its highest existing day (or Week 1 / Day 1 if the
// program has no days yet) - so opening the form doesn't default to
// Week 1 / Day 1 when that's almost always already taken, which is
// exactly what silently swallowed every attempt before this fix.
function nextOpenSlot(days: WorkoutPlanDay[]): { week: number; day: number } {
  if (days.length === 0) return { week: 1, day: 1 }
  const maxWeek = Math.max(...days.map((d) => d.week))
  const maxDayInThatWeek = Math.max(...days.filter((d) => d.week === maxWeek).map((d) => d.day))
  return { week: maxWeek, day: maxDayInThatWeek + 1 }
}

function AddDayControl({
  programId,
  days,
  templates,
}: {
  programId: string
  days: WorkoutPlanDay[]
  templates: WorkoutTemplate[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [week, setWeek] = useState('1')
  const [day, setDay] = useState('1')
  const [label, setLabel] = useState('')
  // '' means "Blank day" - anything else is a workout_templates id to
  // seed the new day's content from (a one-time copy, see
  // addProgramDayFromTemplate).
  const [templateId, setTemplateId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpen() {
    const slot = nextOpenSlot(days)
    setWeek(String(slot.week))
    setDay(String(slot.day))
    setTemplateId('')
    setError(null)
    setOpen(true)
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    setError(null)
    // Pre-fills the label with the template's name (still editable) -
    // switching back to "Blank day" clears it again rather than
    // leaving a stale template name behind.
    const t = templates.find((tpl) => tpl.id === id)
    setLabel(t ? t.name : '')
  }

  async function handleAdd() {
    const w = Number(week)
    const d = Number(day)
    if (!w || !d || !label.trim()) return
    setIsSaving(true)
    setError(null)
    const result = templateId
      ? await addProgramDayFromTemplate(programId, w, d, templateId, label.trim())
      : await addProgramDay(programId, w, d, label.trim())
    setIsSaving(false)
    if (!result.ok) {
      // Stay open, keep whatever was typed - the trainer needs to see
      // why it didn't work and adjust, not have the form vanish as if
      // it had succeeded.
      setError(result.error)
      return
    }
    setLabel('')
    setTemplateId('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
      >
        + Add day
      </button>
    )
  }

  return (
    <div className="bg-zinc-900/40 rounded-lg p-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[11px] text-zinc-500">
          Week
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => {
              setWeek(e.target.value)
              setError(null)
            }}
            className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          />
        </label>
        <label className="flex flex-col text-[11px] text-zinc-500">
          Day
          <input
            type="number"
            min={1}
            value={day}
            onChange={(e) => {
              setDay(e.target.value)
              setError(null)
            }}
            className="w-14 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          />
        </label>
        <label className="flex flex-col text-[11px] text-zinc-500 min-w-[150px]">
          Start from
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white"
          >
            <option value="">Blank day</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-[11px] text-zinc-500 flex-1 min-w-[140px]">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Upper Body A"
            className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-xs text-white placeholder-zinc-700"
          />
        </label>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isSaving || !label.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-[11px] font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {isSaving ? 'Adding...' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-[11px] font-medium transition"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

function WorkoutPreview({
  programId,
  days,
  exercisePool,
  templates,
}: {
  programId: string
  days: WorkoutPlanDay[]
  exercisePool: ExercisePoolEntry[]
  templates: WorkoutTemplate[]
}) {
  const weeks = Array.from(new Set(days.map((d) => d.week))).sort((a, b) => a - b)

  return (
    <div className="mt-3 space-y-2">
      {days.length === 0 && <p className="text-xs text-zinc-600 italic">No workout content yet.</p>}
      {weeks.map((w) => (
        <WeekPreview
          key={w}
          programId={programId}
          week={w}
          days={days.filter((d) => d.week === w)}
          exercisePool={exercisePool}
          allDays={days}
        />
      ))}
      <AddDayControl programId={programId} days={days} templates={templates} />
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

function ProgramCard({
  program,
  exercisePool,
  templates,
}: {
  program: ProgramRow
  exercisePool: ExercisePoolEntry[]
  templates: WorkoutTemplate[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublished, setIsPublished] = useState(program.is_published)
  const [isTogglePending, setIsTogglePending] = useState(false)
  const [showWorkouts, setShowWorkouts] = useState(false)
  const [showDayGroups, setShowDayGroups] = useState(false)

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
          <button
            onClick={() => setShowDayGroups((v) => !v)}
            className="text-xs font-medium text-zinc-400 hover:text-white transition"
          >
            {showDayGroups ? 'Hide day groups' : 'Edit day groups'}
          </button>
        </div>
        {showWorkouts && (
          <WorkoutPreview
            programId={program.id}
            days={program.structured_plan?.days ?? []}
            exercisePool={exercisePool}
            templates={templates}
          />
        )}
        {showDayGroups && (
          <DayGroupSection
            programId={program.id}
            days={program.structured_plan?.days ?? []}
            exercisePool={exercisePool}
          />
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

// Self-service program creation - the first authoring path that
// doesn't require a manual SQL insert. Creates the row with just
// title/level/equipment/duration/description via createProgram
// (structured_plan starts empty), then the admin builds out the
// calendar with "+ Add day" and fills each day in with the same
// editor already used for everything else.
function NewProgramForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const [equipmentTier, setEquipmentTier] = useState('')
  const [durationWeeks, setDurationWeeks] = useState('4')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleCreate() {
    if (!name.trim() || !level.trim() || !equipmentTier.trim()) return
    setIsSaving(true)
    await createProgram({
      name,
      level,
      equipmentTier,
      durationWeeks: Number(durationWeeks) || 1,
      description,
    })
    setIsSaving(false)
    setName('')
    setLevel('')
    setEquipmentTier('')
    setDurationWeeks('4')
    setDescription('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        + New Program
      </button>
    )
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <p className="text-sm font-semibold text-white">New program</p>
      <div className="grid sm:grid-cols-2 gap-3">
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
      <div>
        <label className="text-xs text-zinc-500 mb-1 block">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Who is this program for?"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={isSaving || !name.trim() || !level.trim() || !equipmentTier.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {isSaving ? 'Creating...' : 'Create program'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-sm font-medium transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AdminProgramsList({
  programs,
  exercisePool,
  templates,
}: {
  programs: ProgramRow[]
  exercisePool: ExercisePoolEntry[]
  templates: WorkoutTemplate[]
}) {
  return (
    <div className="space-y-4">
      <NewProgramForm />
      {programs.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">No programs yet.</p>
      ) : (
        programs.map((program) => (
          <ProgramCard key={program.id} program={program} exercisePool={exercisePool} templates={templates} />
        ))
      )}
    </div>
  )
}
