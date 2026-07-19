'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import {
  addExerciseVideo,
  addExerciseVideosBulk,
  deleteExerciseVideo,
  updateExerciseVideo,
} from '@/app/admin/actions'
import { normalize } from '@/lib/exerciseVideos'

type VideoType = 'tutorial' | 'demo'

interface ExerciseVideoRow {
  id: string
  exercise_name: string
  video_url: string
  coach_notes: string | null
  created_at: string
  added_by_name: string | null
  video_type: VideoType
  is_placeholder: boolean
}

interface NeedsVideoRow {
  name: string
  count: number
}

// Not a full sentence, just a compact toggle - shown next to the video
// link input on both add and edit, defaulting to checked on add since
// Satish's own framing is that grabbing a video straight from YouTube
// is usually a stand-in for footage he hasn't shot yet (see project
// memory). Existing rows from before this feature existed are NOT
// retroactively flagged - only new adds/edits touch this.
function PlaceholderToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-400 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-orange-500"
      />
      Not my footage yet - flag to replace later
    </label>
  )
}

export default function AdminExerciseVideosList({
  videos,
  needsVideoByType,
}: {
  videos: ExerciseVideoRow[]
  needsVideoByType: Record<VideoType, NeedsVideoRow[]>
}) {
  const [activeType, setActiveType] = useState<VideoType>('tutorial')

  const exerciseNameInputRef = useRef<HTMLInputElement>(null)
  const [exerciseName, setExerciseName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [coachNotes, setCoachNotes] = useState('')
  const [isPlaceholder, setIsPlaceholder] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editPlaceholder, setEditPlaceholder] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showNeedsVideo, setShowNeedsVideo] = useState(true)
  const [needsVideoSearch, setNeedsVideoSearch] = useState('')
  const [needsVideoSort, setNeedsVideoSort] = useState<'count' | 'name'>('count')
  const [showNeedsFootage, setShowNeedsFootage] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkPlaceholder, setBulkPlaceholder] = useState(true)
  const [isBulkImporting, setIsBulkImporting] = useState(false)

  const videosForType = useMemo(
    () => videos.filter((v) => v.video_type === activeType),
    [videos, activeType]
  )
  const needsVideo = useMemo(() => needsVideoByType[activeType] || [], [needsVideoByType, activeType])
  const needsFootage = useMemo(
    () => videosForType.filter((v) => v.is_placeholder),
    [videosForType]
  )

  // Exact-match only (not the loose word-overlap matching used when
  // suggesting a video for a generated exercise) - this is just
  // catching accidental re-entry of the same exercise under slightly
  // different casing/punctuation, not flagging things that merely
  // sound similar ("Bench Press" vs "Incline Bench Press" should NOT
  // warn here).
  const duplicateMatch = useMemo(() => {
    const target = normalize(exerciseName)
    if (!target) return null
    return videosForType.find((v) => normalize(v.exercise_name) === target) || null
  }, [exerciseName, videosForType])

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return videosForType
    return videosForType.filter((v) => v.exercise_name.toLowerCase().includes(q))
  }, [videosForType, search])

  const filteredNeedsVideo = useMemo(() => {
    const q = needsVideoSearch.trim().toLowerCase()
    let list = q ? needsVideo.filter((n) => n.name.toLowerCase().includes(q)) : needsVideo
    list = [...list].sort((a, b) =>
      needsVideoSort === 'count' ? b.count - a.count : a.name.localeCompare(b.name)
    )
    return list
  }, [needsVideo, needsVideoSearch, needsVideoSort])

  // One row per line: "Exercise name, video url". No CSV quoting
  // support (no library, no escaping) - this is a small internal tool
  // for pasting a simple two-column list, not a general CSV parser.
  // Rows that duplicate an existing library entry, or repeat earlier
  // in the same paste, are counted as skipped and excluded from what
  // actually gets imported.
  const parsedBulkImport = useMemo(() => {
    const existingNormalized = new Set(videosForType.map((v) => normalize(v.exercise_name)))
    const seen = new Set<string>()
    const rows: { exerciseName: string; videoUrl: string }[] = []
    let skipped = 0

    for (const rawLine of bulkText.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      const commaIdx = line.indexOf(',')
      if (commaIdx === -1) continue

      const name = line.slice(0, commaIdx).trim()
      const url = line.slice(commaIdx + 1).trim()
      if (!name || !url) continue

      const key = normalize(name)
      if (existingNormalized.has(key) || seen.has(key)) {
        skipped++
        continue
      }
      seen.add(key)
      rows.push({ exerciseName: name, videoUrl: url })
    }

    return { rows, skipped }
  }, [bulkText, videosForType])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!exerciseName.trim() || !videoUrl.trim()) return

    setIsSubmitting(true)
    await addExerciseVideo(exerciseName, videoUrl, coachNotes, activeType, isPlaceholder)
    setExerciseName('')
    setVideoUrl('')
    setCoachNotes('')
    setIsPlaceholder(true)
    setIsSubmitting(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove the video for "${name}"?`)) return
    setDeletingId(id)
    await deleteExerciseVideo(id)
    setDeletingId(null)
  }

  function startEdit(video: ExerciseVideoRow) {
    setEditingId(video.id)
    setEditName(video.exercise_name)
    setEditUrl(video.video_url)
    setEditNotes(video.coach_notes || '')
    setEditPlaceholder(video.is_placeholder)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit() {
    if (!editingId || !editName.trim() || !editUrl.trim()) return
    setIsSavingEdit(true)
    await updateExerciseVideo(editingId, editName, editUrl, editNotes, editPlaceholder)
    setIsSavingEdit(false)
    setEditingId(null)
  }

  function prefillFromSuggestion(name: string) {
    setExerciseName(name)
    exerciseNameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    exerciseNameInputRef.current?.focus()
  }

  async function handleBulkImport() {
    if (parsedBulkImport.rows.length === 0) return
    setIsBulkImporting(true)
    await addExerciseVideosBulk(parsedBulkImport.rows, activeType, bulkPlaceholder)
    setIsBulkImporting(false)
    setBulkText('')
    setShowBulkImport(false)
  }

  return (
    <div>
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 mb-4 w-fit">
        {(['tutorial', 'demo'] as VideoType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={
              activeType === type
                ? 'px-3.5 py-1.5 rounded-md bg-orange-500 text-black text-xs font-semibold transition capitalize'
                : 'px-3.5 py-1.5 rounded-md text-zinc-400 hover:text-white text-xs font-semibold transition capitalize'
            }
          >
            {type}
          </button>
        ))}
      </div>

      <form onSubmit={handleAdd} className="glass rounded-2xl p-4 mb-4 space-y-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Exercise name</label>
          <input
            ref={exerciseNameInputRef}
            type="text"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="e.g. Barbell Bench Press"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          />
          {duplicateMatch && (
            <p className="text-amber-400 text-xs mt-1.5">
              Already have a {activeType} video for &quot;{duplicateMatch.exercise_name}&quot; -
              adding this will create a second entry for the same exercise.
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Video link</label>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">
            Coach notes <span className="text-zinc-600">(optional - form cues, common mistakes)</span>
          </label>
          <textarea
            value={coachNotes}
            onChange={(e) => setCoachNotes(e.target.value)}
            placeholder="e.g. Keep your core braced, don't let your knees cave in..."
            rows={4}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
          />
        </div>
        <PlaceholderToggle checked={isPlaceholder} onChange={setIsPlaceholder} />
        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={isSubmitting || !exerciseName.trim() || !videoUrl.trim()}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            {isSubmitting ? 'Adding...' : `Add ${activeType} video`}
          </button>
          <button
            type="button"
            onClick={() => setShowBulkImport((v) => !v)}
            className="text-xs text-zinc-400 hover:text-white transition"
          >
            {showBulkImport ? 'Hide bulk import' : 'Bulk import'}
          </button>
        </div>
      </form>

      {needsVideo.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowNeedsVideo((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-white transition mb-2"
          >
            <span>{showNeedsVideo ? '▾' : '▸'}</span>
            <span>
              Needs a {activeType} video ({needsVideo.length})
            </span>
          </button>
          {showNeedsVideo && (
            <div className="glass rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={needsVideoSearch}
                  onChange={(e) => setNeedsVideoSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
                  {(['count', 'name'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNeedsVideoSort(s)}
                      className={
                        needsVideoSort === s
                          ? 'px-2 py-1 rounded bg-orange-500 text-black text-[10px] font-semibold transition capitalize'
                          : 'px-2 py-1 rounded text-zinc-500 hover:text-white text-[10px] font-semibold transition capitalize'
                      }
                    >
                      {s === 'count' ? 'Most used' : 'A-Z'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-zinc-900">
                {filteredNeedsVideo.length === 0 && (
                  <p className="text-xs text-zinc-600 italic py-3 text-center">No matches.</p>
                )}
                {filteredNeedsVideo.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => prefillFromSuggestion(item.name)}
                    className="w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-zinc-900/60 rounded transition px-1.5"
                  >
                    <span className="text-zinc-300 text-xs truncate">{item.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-600 text-[10px]">{item.count}x prescribed</span>
                      <span className="text-orange-400 text-[10px] font-medium">+ Add</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {needsFootage.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowNeedsFootage((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-white transition mb-2"
          >
            <span>{showNeedsFootage ? '▾' : '▸'}</span>
            <span>
              Needs your own footage ({needsFootage.length}) - has a placeholder {activeType} video
            </span>
          </button>
          {showNeedsFootage && (
            <div className="flex flex-wrap gap-2">
              {needsFootage.map((v) => (
                <a
                  key={v.id}
                  href={v.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 rounded-full pl-3 pr-2.5 py-1.5 text-xs transition"
                >
                  <span className="text-zinc-300">{v.exercise_name}</span>
                  <span className="text-orange-400">↗</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {showBulkImport && (
        <div className="glass rounded-2xl p-4 mb-6 space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">
              Paste one exercise per line: <span className="text-zinc-400">Exercise name, video url</span>
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Barbell Bench Press, https://...\nGoblet Squat, https://...'}
              rows={6}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>
          <PlaceholderToggle checked={bulkPlaceholder} onChange={setBulkPlaceholder} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-zinc-500 text-xs">
              {parsedBulkImport.rows.length} ready to import
              {parsedBulkImport.skipped > 0 &&
                ` - ${parsedBulkImport.skipped} skipped as already existing`}
            </p>
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={isBulkImporting || parsedBulkImport.rows.length === 0}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition whitespace-nowrap"
            >
              {isBulkImporting
                ? 'Importing...'
                : `Import ${parsedBulkImport.rows.length || ''} video${parsedBulkImport.rows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises..."
          className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
        />
        <span className="text-zinc-500 text-xs whitespace-nowrap">
          {videosForType.length} {activeType} video{videosForType.length === 1 ? '' : 's'}
        </span>
      </div>

      {videosForType.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">No {activeType} videos added yet.</p>
      ) : filteredVideos.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">
          No exercises match &quot;{search}&quot;.
        </p>
      ) : (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-2.5">
                  Exercise
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-2.5">
                  Video link
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-2.5 whitespace-nowrap">
                  Added by
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-2.5 whitespace-nowrap">
                  Added
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filteredVideos.map((video) => {
                const isEditing = editingId === video.id
                return (
                  <Fragment key={video.id}>
                  <tr className={isEditing ? '' : 'border-b border-zinc-900 last:border-0'}>
                    {isEditing ? (
                      <>
                        <td className="px-4 py-2.5 align-top">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
                          />
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <input
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
                          />
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs align-top whitespace-nowrap">
                          {video.added_by_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs align-top whitespace-nowrap">
                          {new Date(video.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 align-top text-right whitespace-nowrap">
                          <button
                            onClick={saveEdit}
                            disabled={isSavingEdit || !editName.trim() || !editUrl.trim()}
                            className="text-orange-400 hover:text-orange-300 disabled:opacity-50 text-xs font-medium transition mr-3"
                          >
                            {isSavingEdit ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isSavingEdit}
                            className="text-zinc-500 hover:text-white disabled:opacity-50 text-xs font-medium transition"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-white font-medium align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{video.exercise_name}</span>
                            {video.is_placeholder && (
                              <span className="text-[9px] uppercase tracking-wide text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded font-normal">
                                Placeholder
                              </span>
                            )}
                          </div>
                          {video.coach_notes && (
                            <p className="text-zinc-500 text-xs font-normal mt-0.5 line-clamp-2 max-w-[200px]">
                              {video.coach_notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top max-w-[220px]">
                          <a
                            href={video.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-400 hover:text-orange-300 text-xs transition truncate block"
                          >
                            {video.video_url}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs align-top whitespace-nowrap">
                          {video.added_by_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs align-top whitespace-nowrap">
                          {new Date(video.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <button
                            onClick={() => startEdit(video)}
                            className="text-zinc-400 hover:text-white text-xs font-medium transition mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(video.id, video.exercise_name)}
                            disabled={deletingId === video.id}
                            className="text-zinc-500 hover:text-red-400 disabled:opacity-50 text-xs font-medium transition"
                          >
                            Remove
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                  {isEditing && (
                    <tr className="border-b border-zinc-900 last:border-0">
                      <td colSpan={5} className="px-4 pb-3 pt-0 space-y-2.5">
                        <div>
                          <label className="text-xs text-zinc-500 mb-1 block">
                            Coach notes <span className="text-zinc-600">(optional)</span>
                          </label>
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            rows={4}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white"
                          />
                        </div>
                        <PlaceholderToggle checked={editPlaceholder} onChange={setEditPlaceholder} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
