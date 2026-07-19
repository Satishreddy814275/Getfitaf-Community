'use client'

import { useMemo, useState } from 'react'
import { updateExerciseMetadata } from '@/app/admin/actions'
import type { ExerciseCatalogEntry } from '@/types'

// Major-muscle-group checklist, not exhaustive exercise-science detail -
// matches Satish's own phrasing ("major muscles worked"). Fixed list
// (not free text) so filtering/search on this later stays reliable -
// see project memory for why free text was ruled out.
const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Full body',
]

export default function AdminExercisesList({
  exercises,
  allTags,
  hasTutorialIds,
  hasDemoIds,
}: {
  exercises: ExerciseCatalogEntry[]
  allTags: string[]
  hasTutorialIds: string[]
  hasDemoIds: string[]
}) {
  const [rows, setRows] = useState(exercises)
  const [search, setSearch] = useState('')
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [draftMuscles, setDraftMuscles] = useState<string[]>([])
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  // Tracks whether the currently-open row has un-saved edits - without
  // this, clicking Edit on a different exercise (or Cancel on this
  // one) silently threw away whatever was just typed/toggled, with no
  // warning at all. Satish hit this directly: added a new tag, it
  // never made it into the DB because the row got switched away from
  // before Save was clicked on that specific row.
  const [isDirty, setIsDirty] = useState(false)

  const tutorialSet = useMemo(() => new Set(hasTutorialIds), [hasTutorialIds])
  const demoSet = useMemo(() => new Set(hasDemoIds), [hasDemoIds])

  const unlabeledCount = useMemo(
    () => rows.filter((e) => e.muscleGroups.length === 0 && e.categoryTags.length === 0).length,
    [rows]
  )

  const filtered = useMemo(() => {
    let list = rows
    if (onlyUnlabeled) {
      list = list.filter((e) => e.muscleGroups.length === 0 && e.categoryTags.length === 0)
    }
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q))
    return list
  }, [rows, search, onlyUnlabeled])

  // Returns true if it's safe to abandon whatever's currently open
  // (nothing unsaved, or the user explicitly confirmed discarding it).
  // Also counts unconfirmed text still sitting in the new-tag box as
  // dirty - same class of silent-loss risk as an un-saved toggle.
  function confirmDiscardIfDirty(): boolean {
    if (!isDirty && !newTagInput.trim()) return true
    const current = rows.find((e) => e.id === expandedId)
    return confirm(
      `Discard unsaved changes to "${current?.name || 'this exercise'}"? They were never saved.`
    )
  }

  function startEdit(entry: ExerciseCatalogEntry) {
    if (expandedId && expandedId !== entry.id && !confirmDiscardIfDirty()) return
    setExpandedId(entry.id)
    setDraftMuscles(entry.muscleGroups)
    setDraftTags(entry.categoryTags)
    setNewTagInput('')
    setIsDirty(false)
  }

  function closeEdit() {
    if (!confirmDiscardIfDirty()) return
    setExpandedId(null)
    setIsDirty(false)
  }

  function toggleMuscle(muscle: string) {
    setDraftMuscles((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]
    )
    setIsDirty(true)
  }

  function toggleTag(tag: string) {
    setDraftTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
    setIsDirty(true)
  }

  function addNewTag() {
    const tag = newTagInput.trim()
    if (!tag || draftTags.includes(tag)) return
    setDraftTags((prev) => [...prev, tag])
    setNewTagInput('')
    setIsDirty(true)
  }

  async function save(id: string) {
    // Typing a tag and clicking Save (without a separate "+ Add" click
    // first) silently dropped the typed text - it lived only in
    // newTagInput, which save() never read. Save now folds in
    // whatever's still sitting in the box itself, so there's no longer
    // a second confirmation step required for a typed tag to count.
    const pendingTag = newTagInput.trim()
    const finalTags =
      pendingTag && !draftTags.includes(pendingTag) ? [...draftTags, pendingTag] : draftTags

    setSavingId(id)
    await updateExerciseMetadata(id, draftMuscles, finalTags)
    setRows((prev) =>
      prev.map((e) => (e.id === id ? { ...e, muscleGroups: draftMuscles, categoryTags: finalTags } : e))
    )
    setSavingId(null)
    setExpandedId(null)
    setIsDirty(false)
    setNewTagInput('')
  }

  return (
    <div>
      {unlabeledCount > 0 && (
        <button
          type="button"
          onClick={() => setOnlyUnlabeled((v) => !v)}
          className={
            onlyUnlabeled
              ? 'mb-3 flex items-center gap-1.5 text-xs font-medium text-orange-400'
              : 'mb-3 flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-white transition'
          }
        >
          <span>{onlyUnlabeled ? '▾' : '▸'}</span>
          <span>No muscle groups or tags yet ({unlabeledCount})</span>
        </button>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises..."
        className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white mb-3"
      />

      <div className="glass rounded-2xl divide-y divide-zinc-900">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-12">No exercises match.</p>
        )}
        {filtered.map((entry) => {
          const isExpanded = expandedId === entry.id
          return (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-white font-medium">{entry.name}</p>
                    {tutorialSet.has(entry.id) && (
                      <span className="text-[9px] uppercase tracking-wide text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                        Tutorial
                      </span>
                    )}
                    {demoSet.has(entry.id) && (
                      <span className="text-[9px] uppercase tracking-wide text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                        Demo
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {entry.muscleGroups.length > 0 ? entry.muscleGroups.join(', ') : 'No muscle groups'}
                      {entry.categoryTags.length > 0 && ` · ${entry.categoryTags.join(', ')}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => (isExpanded ? closeEdit() : startEdit(entry))}
                  className="text-xs font-medium text-zinc-400 hover:text-white transition shrink-0"
                >
                  {isExpanded ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[11px] text-zinc-500 mb-1.5">Muscles worked</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MUSCLE_GROUPS.map((muscle) => {
                        const active = draftMuscles.includes(muscle)
                        return (
                          <button
                            key={muscle}
                            type="button"
                            onClick={() => toggleMuscle(muscle)}
                            className={
                              active
                                ? 'text-xs px-2.5 py-1 rounded-full bg-orange-500 text-black font-medium transition'
                                : 'text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white transition'
                            }
                          >
                            {muscle}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-zinc-500 mb-1.5">Category tags</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {allTags.map((tag) => {
                        const active = draftTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={
                              active
                                ? 'text-xs px-2.5 py-1 rounded-full bg-orange-500 text-black font-medium transition'
                                : 'text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white transition'
                            }
                          >
                            {tag}
                          </button>
                        )
                      })}
                      {draftTags
                        .filter((t) => !allTags.includes(t))
                        .map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className="text-xs px-2.5 py-1 rounded-full bg-orange-500 text-black font-medium transition"
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addNewTag()
                          }
                        }}
                        placeholder="New tag - e.g. Resistance, Pull-down..."
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={addNewTag}
                        disabled={!newTagInput.trim()}
                        className="text-xs font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 transition shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => save(entry.id)}
                      disabled={savingId === entry.id}
                      className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      {savingId === entry.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
