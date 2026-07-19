'use client'

import { useMemo, useState } from 'react'
import { updateExerciseMetadata, mergeTag, type TagBucket } from '@/app/admin/actions'
import type { ExerciseCatalogEntry } from '@/types'

// Four independent tag buckets - see the ExerciseCatalogEntry comment
// in types/index.ts for the reasoning. Each bucket's `starter` list is
// just a seed of suggested chips, not a hard enum: Satish's explicit
// call was "keep the list fixed like you did... but let me add new
// ones to any of these, or Other" - so every bucket (including Muscle,
// which used to be the only fixed one) is now equally extendable via
// the same starter-chips-plus-free-text pattern.
const BUCKET_CONFIG: Record<TagBucket, { label: string; field: keyof ExerciseCatalogEntry; starter: string[] }> = {
  muscle: {
    label: 'Muscles worked',
    field: 'muscleGroups',
    starter: [
      'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
      'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full body',
    ],
  },
  equipment: {
    label: 'Equipment',
    field: 'equipmentTags',
    starter: ['Gym', 'Dumbbell', 'Bands', 'Bodyweight'],
  },
  type: {
    label: 'Type of exercise',
    field: 'typeTags',
    starter: ['Strength training', 'Cardio', 'Stretching', 'Warm up'],
  },
  other: {
    label: 'Other',
    field: 'otherTags',
    starter: [],
  },
}
const BUCKETS = Object.keys(BUCKET_CONFIG) as TagBucket[]

const EMPTY_DRAFT: Record<TagBucket, string[]> = { muscle: [], equipment: [], type: [], other: [] }
const EMPTY_INPUTS: Record<TagBucket, string> = { muscle: '', equipment: '', type: '', other: '' }
const EMPTY_NUDGE: Record<TagBucket, string | null> = { muscle: null, equipment: null, type: null, other: null }

// Loose duplicate check - lowercase, trimmed, and a naive trailing-"s"
// strip so "Dumbbell"/"Dumbbells" or "Band"/"Bands" compare equal.
// Deliberately simple (not a real stemmer) since this only needs to
// catch the common plural-vs-singular case Satish flagged, not every
// possible near-duplicate.
function normalizeTagForCompare(tag: string): string {
  const t = tag.trim().toLowerCase()
  return t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t
}

export default function AdminExercisesList({ exercises }: { exercises: ExerciseCatalogEntry[] }) {
  const [rows, setRows] = useState(exercises)
  const [search, setSearch] = useState('')
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [draft, setDraft] = useState<Record<TagBucket, string[]>>(EMPTY_DRAFT)
  const [newTagInputs, setNewTagInputs] = useState<Record<TagBucket, string>>(EMPTY_INPUTS)
  const [pendingNudge, setPendingNudge] = useState<Record<TagBucket, string | null>>(EMPTY_NUDGE)
  const [isDirty, setIsDirty] = useState(false)

  const [showMergeTool, setShowMergeTool] = useState(false)
  const [mergeBucket, setMergeBucket] = useState<TagBucket>('equipment')
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)
  const [mergeTo, setMergeTo] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)

  // Every tag actually in use per bucket, computed live from `rows` -
  // reflects edits/merges immediately without waiting on a server
  // round trip, and doubles as the merge tool's source list.
  const liveTagsByBucket = useMemo(() => {
    const acc: Record<TagBucket, string[]> = { muscle: [], equipment: [], type: [], other: [] }
    for (const b of BUCKETS) {
      const set = new Set<string>()
      for (const r of rows) for (const t of r[BUCKET_CONFIG[b].field] as string[]) set.add(t)
      acc[b] = Array.from(set).sort((a, c) => a.localeCompare(c))
    }
    return acc
  }, [rows])

  function chipsForBucket(bucket: TagBucket): string[] {
    return Array.from(new Set([...BUCKET_CONFIG[bucket].starter, ...liveTagsByBucket[bucket]]))
  }

  function findNudgeMatch(bucket: TagBucket, raw: string): string | null {
    const target = normalizeTagForCompare(raw)
    const pool = chipsForBucket(bucket)
    const exact = pool.find((t) => t.toLowerCase() === raw.toLowerCase())
    if (exact) return exact
    return pool.find((t) => normalizeTagForCompare(t) === target) || null
  }

  const unlabeledCount = useMemo(
    () =>
      rows.filter(
        (e) =>
          e.muscleGroups.length === 0 &&
          e.equipmentTags.length === 0 &&
          e.typeTags.length === 0 &&
          e.otherTags.length === 0
      ).length,
    [rows]
  )

  const filtered = useMemo(() => {
    let list = rows
    if (onlyUnlabeled) {
      list = list.filter(
        (e) =>
          e.muscleGroups.length === 0 &&
          e.equipmentTags.length === 0 &&
          e.typeTags.length === 0 &&
          e.otherTags.length === 0
      )
    }
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q))
    return list
  }, [rows, search, onlyUnlabeled])

  function confirmDiscardIfDirty(): boolean {
    const hasPendingText = Object.values(newTagInputs).some((v) => v.trim())
    if (!isDirty && !hasPendingText) return true
    const current = rows.find((e) => e.id === expandedId)
    return confirm(
      `Discard unsaved changes to "${current?.name || 'this exercise'}"? They were never saved.`
    )
  }

  function startEdit(entry: ExerciseCatalogEntry) {
    if (expandedId && expandedId !== entry.id && !confirmDiscardIfDirty()) return
    setExpandedId(entry.id)
    setDraft({
      muscle: entry.muscleGroups,
      equipment: entry.equipmentTags,
      type: entry.typeTags,
      other: entry.otherTags,
    })
    setNewTagInputs(EMPTY_INPUTS)
    setPendingNudge(EMPTY_NUDGE)
    setIsDirty(false)
  }

  function closeEdit() {
    if (!confirmDiscardIfDirty()) return
    setExpandedId(null)
    setIsDirty(false)
  }

  function toggleTag(bucket: TagBucket, tag: string) {
    setDraft((prev) => ({
      ...prev,
      [bucket]: prev[bucket].includes(tag) ? prev[bucket].filter((t) => t !== tag) : [...prev[bucket], tag],
    }))
    setIsDirty(true)
  }

  function commitTag(bucket: TagBucket, tag: string) {
    setDraft((prev) => (prev[bucket].includes(tag) ? prev : { ...prev, [bucket]: [...prev[bucket], tag] }))
    setNewTagInputs((prev) => ({ ...prev, [bucket]: '' }))
    setPendingNudge((prev) => ({ ...prev, [bucket]: null }))
    setIsDirty(true)
  }

  // Typing a new tag and hitting Add/Enter: an exact match to an
  // existing tag (any case) is just used directly, no friction. A
  // fuzzy plural/singular match ("Dumbbell" vs typed "Dumbbells")
  // doesn't get auto-substituted silently - it surfaces as a nudge so
  // the choice ("use the existing one" vs "these are genuinely
  // different, add both") stays explicit rather than assumed.
  function addNewTag(bucket: TagBucket) {
    const raw = newTagInputs[bucket].trim()
    if (!raw) return
    const nudge = findNudgeMatch(bucket, raw)
    if (nudge && nudge.toLowerCase() !== raw.toLowerCase()) {
      setPendingNudge((prev) => ({ ...prev, [bucket]: nudge }))
      return
    }
    commitTag(bucket, nudge || raw)
  }

  // Not a React hook despite the name pattern - renamed from
  // useNudgeSuggestion to avoid tripping the react-hooks/rules-of-hooks
  // lint rule, which treats any function starting with "use" as a hook
  // and flags it for being called from an onClick handler below.
  function applyNudgeSuggestion(bucket: TagBucket) {
    const suggestion = pendingNudge[bucket]
    if (suggestion) commitTag(bucket, suggestion)
  }

  function addAnyway(bucket: TagBucket) {
    const raw = newTagInputs[bucket].trim()
    if (!raw) return
    commitTag(bucket, raw)
  }

  // Same fold-in-pending-text fix as before the bucket split - typing
  // a tag and clicking Save without a separate "+ Add" click used to
  // silently drop it. Applied per bucket now.
  function resolveFinalTags(bucket: TagBucket): string[] {
    const raw = newTagInputs[bucket].trim()
    if (!raw) return draft[bucket]
    const tagToAdd = findNudgeMatch(bucket, raw) || raw
    return draft[bucket].includes(tagToAdd) ? draft[bucket] : [...draft[bucket], tagToAdd]
  }

  async function save(id: string) {
    const final: Record<TagBucket, string[]> = {
      muscle: resolveFinalTags('muscle'),
      equipment: resolveFinalTags('equipment'),
      type: resolveFinalTags('type'),
      other: resolveFinalTags('other'),
    }
    setSavingId(id)
    await updateExerciseMetadata(id, final.muscle, final.equipment, final.type, final.other)
    setRows((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, muscleGroups: final.muscle, equipmentTags: final.equipment, typeTags: final.type, otherTags: final.other }
          : e
      )
    )
    setSavingId(null)
    setExpandedId(null)
    setIsDirty(false)
    setNewTagInputs(EMPTY_INPUTS)
    setPendingNudge(EMPTY_NUDGE)
  }

  async function doMerge() {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return
    setIsMerging(true)
    await mergeTag(mergeBucket, mergeFrom, mergeTo)
    const field = BUCKET_CONFIG[mergeBucket].field
    setRows((prev) =>
      prev.map((e) => {
        const list = e[field] as string[]
        if (!list.includes(mergeFrom)) return e
        const next = Array.from(new Set(list.map((t) => (t === mergeFrom ? mergeTo : t))))
        return { ...e, [field]: next }
      })
    )
    setMergeFrom(null)
    setMergeTo(null)
    setIsMerging(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        {unlabeledCount > 0 ? (
          <button
            type="button"
            onClick={() => setOnlyUnlabeled((v) => !v)}
            className={
              onlyUnlabeled
                ? 'flex items-center gap-1.5 text-xs font-medium text-orange-400'
                : 'flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-white transition'
            }
          >
            <span>{onlyUnlabeled ? '▾' : '▸'}</span>
            <span>No tags yet ({unlabeledCount})</span>
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setShowMergeTool((v) => !v)}
          className="text-xs font-medium text-zinc-500 hover:text-white transition"
        >
          {showMergeTool ? 'Hide tag cleanup' : 'Clean up duplicate tags →'}
        </button>
      </div>

      {showMergeTool && (
        <div className="glass rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-xs text-zinc-500">
            Merge two tags into one - every exercise carrying the first tag gets switched to the
            second, and the first tag disappears from the list.
          </p>
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
            {BUCKETS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  setMergeBucket(b)
                  setMergeFrom(null)
                  setMergeTo(null)
                }}
                className={
                  mergeBucket === b
                    ? 'px-3 py-1.5 rounded-md bg-orange-500 text-black text-xs font-semibold transition'
                    : 'px-3 py-1.5 rounded-md text-zinc-400 hover:text-white text-xs font-semibold transition'
                }
              >
                {BUCKET_CONFIG[b].label}
              </button>
            ))}
          </div>

          {liveTagsByBucket[mergeBucket].length < 2 ? (
            <p className="text-xs text-zinc-600 italic">Need at least two tags in this bucket to merge.</p>
          ) : (
            <>
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">Merge this tag...</p>
                <div className="flex flex-wrap gap-1.5">
                  {liveTagsByBucket[mergeBucket].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setMergeFrom(tag === mergeFrom ? null : tag)}
                      className={
                        tag === mergeFrom
                          ? 'text-xs px-2.5 py-1 rounded-full bg-red-500/80 text-white font-medium transition'
                          : 'text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white transition'
                      }
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">...into this tag</p>
                <div className="flex flex-wrap gap-1.5">
                  {liveTagsByBucket[mergeBucket]
                    .filter((tag) => tag !== mergeFrom)
                    .map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setMergeTo(tag === mergeTo ? null : tag)}
                        disabled={!mergeFrom}
                        className={
                          tag === mergeTo
                            ? 'text-xs px-2.5 py-1 rounded-full bg-orange-500 text-black font-medium transition'
                            : 'text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-40 transition'
                        }
                      >
                        {tag}
                      </button>
                    ))}
                </div>
              </div>
              <button
                type="button"
                onClick={doMerge}
                disabled={!mergeFrom || !mergeTo || isMerging}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-xs font-semibold px-3 py-1.5 rounded-lg transition"
              >
                {isMerging ? 'Merging...' : mergeFrom && mergeTo ? `Merge "${mergeFrom}" into "${mergeTo}"` : 'Pick two tags'}
              </button>
            </>
          )}
        </div>
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
          const allTagsFlat = [...entry.muscleGroups, ...entry.equipmentTags, ...entry.typeTags, ...entry.otherTags]
          return (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium">{entry.name}</p>
                  {!isExpanded && (
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {allTagsFlat.length > 0 ? allTagsFlat.join(', ') : 'No tags yet'}
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
                <div className="mt-3 space-y-4">
                  {BUCKETS.map((bucket) => (
                    <div key={bucket}>
                      <p className="text-[11px] text-zinc-500 mb-1.5">{BUCKET_CONFIG[bucket].label}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {chipsForBucket(bucket).map((tag) => {
                          const active = draft[bucket].includes(tag)
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(bucket, tag)}
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
                        {draft[bucket]
                          .filter((t) => !chipsForBucket(bucket).includes(t))
                          .map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(bucket, tag)}
                              className="text-xs px-2.5 py-1 rounded-full bg-orange-500 text-black font-medium transition"
                            >
                              {tag}
                            </button>
                          ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newTagInputs[bucket]}
                          onChange={(e) => {
                            const v = e.target.value
                            setNewTagInputs((prev) => ({ ...prev, [bucket]: v }))
                            setPendingNudge((prev) => ({ ...prev, [bucket]: null }))
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              addNewTag(bucket)
                            }
                          }}
                          placeholder={bucket === 'other' ? 'New tag - anything that doesn’t fit above...' : 'New tag...'}
                          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white placeholder-zinc-600"
                        />
                        <button
                          type="button"
                          onClick={() => addNewTag(bucket)}
                          disabled={!newTagInputs[bucket].trim()}
                          className="text-xs font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 transition shrink-0"
                        >
                          + Add
                        </button>
                      </div>
                      {pendingNudge[bucket] && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <p className="text-amber-400 text-xs">
                            &quot;{pendingNudge[bucket]}&quot; already exists in {BUCKET_CONFIG[bucket].label} -
                            use it instead?
                          </p>
                          <button
                            type="button"
                            onClick={() => applyNudgeSuggestion(bucket)}
                            className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                          >
                            Use it
                          </button>
                          <button
                            type="button"
                            onClick={() => addAnyway(bucket)}
                            className="text-xs font-medium text-zinc-500 hover:text-white transition"
                          >
                            Add anyway
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

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
