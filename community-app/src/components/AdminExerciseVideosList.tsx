'use client'

import { useMemo, useState } from 'react'
import {
  addExerciseVideo,
  addExerciseVideosBulk,
  deleteExerciseVideo,
  updateExerciseVideo,
} from '@/app/admin/actions'
import { normalize } from '@/lib/exerciseVideos'

interface ExerciseVideoRow {
  id: string
  exercise_name: string
  video_url: string
  created_at: string
}

export default function AdminExerciseVideosList({ videos }: { videos: ExerciseVideoRow[] }) {
  const [exerciseName, setExerciseName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [isBulkImporting, setIsBulkImporting] = useState(false)

  // Exact-match only (not the loose word-overlap matching used when
  // suggesting a video for a generated exercise) - this is just
  // catching accidental re-entry of the same exercise under slightly
  // different casing/punctuation, not flagging things that merely
  // sound similar ("Bench Press" vs "Incline Bench Press" should NOT
  // warn here).
  const duplicateMatch = useMemo(() => {
    const target = normalize(exerciseName)
    if (!target) return null
    return videos.find((v) => normalize(v.exercise_name) === target) || null
  }, [exerciseName, videos])

  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return videos
    return videos.filter((v) => v.exercise_name.toLowerCase().includes(q))
  }, [videos, search])

  // One row per line: "Exercise name, video url". No CSV quoting
  // support (no library, no escaping) - this is a small internal tool
  // for pasting a simple two-column list, not a general CSV parser.
  // Rows that duplicate an existing library entry, or repeat earlier
  // in the same paste, are counted as skipped and excluded from what
  // actually gets imported.
  const parsedBulkImport = useMemo(() => {
    const existingNormalized = new Set(videos.map((v) => normalize(v.exercise_name)))
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
  }, [bulkText, videos])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!exerciseName.trim() || !videoUrl.trim()) return

    setIsSubmitting(true)
    await addExerciseVideo(exerciseName, videoUrl)
    setExerciseName('')
    setVideoUrl('')
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
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit() {
    if (!editingId || !editName.trim() || !editUrl.trim()) return
    setIsSavingEdit(true)
    await updateExerciseVideo(editingId, editName, editUrl)
    setIsSavingEdit(false)
    setEditingId(null)
  }

  async function handleBulkImport() {
    if (parsedBulkImport.rows.length === 0) return
    setIsBulkImporting(true)
    await addExerciseVideosBulk(parsedBulkImport.rows)
    setIsBulkImporting(false)
    setBulkText('')
    setShowBulkImport(false)
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="glass rounded-2xl p-4 mb-4 space-y-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Exercise name</label>
          <input
            type="text"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="e.g. Barbell Bench Press"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          />
          {duplicateMatch && (
            <p className="text-amber-400 text-xs mt-1.5">
              Already have a video for &quot;{duplicateMatch.exercise_name}&quot; - adding this
              will create a second entry for the same exercise.
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
        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={isSubmitting || !exerciseName.trim() || !videoUrl.trim()}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            {isSubmitting ? 'Adding...' : 'Add video'}
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
          {videos.length} exercise{videos.length === 1 ? '' : 's'} with videos
        </span>
      </div>

      {videos.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">No videos added yet.</p>
      ) : filteredVideos.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">
          No exercises match &quot;{search}&quot;.
        </p>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-2.5">
                  Exercise
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-2.5">
                  Video link
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
                  <tr key={video.id} className="border-b border-zinc-900 last:border-0">
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
                          {video.exercise_name}
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
