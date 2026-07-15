'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  updateWorkoutTemplate,
} from '@/app/admin/actions'
import {
  AddExerciseControl,
  BlockItemEditor,
  DayReadOnlyView,
  itemsForPhase,
  PHASES,
  PHASE_LABELS,
} from './AdminProgramsList'
import { collapseExercisesToBlocks, type EditableBlock } from '@/lib/workoutBlocks'
import type { ExercisePoolEntry } from '@/lib/exercisePool'
import type { WorkoutTemplate } from '@/types'

// Full block editor for one template's content - deliberately its own
// copy of the group/ungroup/reorder/add-exercise logic rather than
// sharing DayEditor's closures (which are scoped to a program's week/
// day/label), same "each editor owns its own block-manipulation
// helpers" pattern DayGroupEditor.tsx already uses for the same
// reason. Saves via updateWorkoutTemplate, which just writes
// name/notes/exercises straight onto the template row - no siblings,
// no propagation, no week/day identity to worry about.
function TemplateEditor({
  template,
  exercisePool,
  onClose,
}: {
  template: WorkoutTemplate
  exercisePool: ExercisePoolEntry[]
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => collapseExercisesToBlocks(template.exercises))
  const [notesText, setNotesText] = useState(template.notes || '')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<{ phase: 'warmup' | 'main' | 'cooldown'; index: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ phase: 'warmup' | 'main' | 'cooldown'; index: number } | null>(null)

  function updateBlock(id: string, fields: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...fields } : b)))
  }

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

  function handleGroup(phase: 'warmup' | 'main' | 'cooldown') {
    const targets = blocks.filter((b) => b.phase === phase && selected.has(b.id) && b.groupId == null)
    if (targets.length < 2) return
    const ids = new Set(targets.map((b) => b.id))
    const groupId = `g${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const defaultRounds = Math.max(...targets.map((b) => b.setsCount), 1)
    setBlocks((prev) => prev.map((b) => (ids.has(b.id) ? { ...b, groupId, setsCount: defaultRounds } : b)))
    setSelected(new Set())
  }

  function handleUngroup(groupId: string) {
    setBlocks((prev) => prev.map((b) => (b.groupId === groupId ? { ...b, groupId: null } : b)))
  }

  function addExerciseWithName(phase: 'warmup' | 'main' | 'cooldown', exerciseName: string) {
    setBlocks((prev) => [
      ...prev,
      {
        id: `new${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        name: exerciseName,
        setsCount: 1,
        reps: '10',
        restSeconds: null,
        timerSeconds: null,
        trackWeight: true,
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

  function moveItem(phase: 'warmup' | 'main' | 'cooldown', itemIndex: number, direction: -1 | 1) {
    moveItemTo(phase, itemIndex, itemIndex + direction)
  }

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
    setError(null)
    const result = await updateWorkoutTemplate(template.id, name, blocks, notesText.trim() || null)
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
    onClose()
  }

  return (
    <div className="mt-2 space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1 block">
          Template name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
        />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1 block">
          Instructions shown to members (carried over when copied into a program)
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
                <AddExerciseControl pool={exercisePool} onAdd={(n) => addExerciseWithName(phase, n)} />
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

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-xs font-semibold px-4 py-2 rounded-lg transition"
        >
          {isSaving ? 'Saving...' : 'Save template'}
        </button>
        <button
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

function TemplateRow({
  template,
  exercisePool,
}: {
  template: WorkoutTemplate
  exercisePool: ExercisePoolEntry[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isEmpty = template.exercises.length === 0

  async function handleDelete() {
    if (!confirm(`Delete the "${template.name}" template? This can't be undone - it won't affect any program that already used a copy of it.`)) {
      return
    }
    setIsDeleting(true)
    const result = await deleteWorkoutTemplate(template.id)
    setIsDeleting(false)
    if (!result.ok) {
      alert(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="border-t border-zinc-800 first:border-t-0 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm text-zinc-300">{template.name}</span>
        <span className="text-xs text-zinc-600">
          {isEmpty ? 'Empty' : `${template.exercises.length} exercises`} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="mt-2 pl-2">
          {isEditing ? (
            <TemplateEditor template={template} exercisePool={exercisePool} onClose={() => setIsEditing(false)} />
          ) : (
            <>
              {!isEmpty && <DayReadOnlyView exercises={template.exercises} />}
              {isEmpty && <p className="text-xs text-zinc-700 italic mb-2">No exercises yet.</p>}
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-[11px] font-medium text-orange-400 hover:text-orange-300 transition"
                >
                  Edit template
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-[11px] font-medium text-zinc-600 hover:text-red-400 disabled:opacity-50 transition"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NewTemplateControl() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    setIsSaving(true)
    setError(null)
    const result = await createWorkoutTemplate(name.trim())
    setIsSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName('')
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
        + New template
      </button>
    )
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-2">
      <label className="text-xs text-zinc-500 mb-1 block">Template name</label>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="e.g. Upper Body 1"
          autoFocus
          className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={isSaving || !name.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {isSaving ? 'Creating...' : 'Create'}
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
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function AdminTemplatesList({
  templates,
  exercisePool,
}: {
  templates: WorkoutTemplate[]
  exercisePool: ExercisePoolEntry[]
}) {
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? templates.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : templates

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
        />
        <NewTemplateControl />
      </div>

      <div className="glass rounded-2xl p-4">
        {filtered.length === 0 && (
          <p className="text-xs text-zinc-600 italic">
            {templates.length === 0 ? 'No templates yet.' : 'No templates match that search.'}
          </p>
        )}
        {filtered.map((t) => (
          <TemplateRow key={t.id} template={t} exercisePool={exercisePool} />
        ))}
      </div>
    </div>
  )
}
