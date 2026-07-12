'use client'

import { useState } from 'react'
import { addExerciseVideo, deleteExerciseVideo } from '@/app/admin/actions'

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

  return (
    <div>
      <form onSubmit={handleAdd} className="glass rounded-2xl p-4 mb-6 space-y-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Exercise name</label>
          <input
            type="text"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="e.g. Barbell Bench Press"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          />
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
        <button
          type="submit"
          disabled={isSubmitting || !exerciseName.trim() || !videoUrl.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {isSubmitting ? 'Adding...' : 'Add video'}
        </button>
      </form>

      {videos.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">No videos added yet.</p>
      ) : (
        <div className="space-y-2">
          {videos.map((video) => (
            <div
              key={video.id}
              className="flex items-center justify-between gap-3 glass rounded-xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{video.exercise_name}</p>
                <a
                  href={video.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 text-xs transition truncate block"
                >
                  {video.video_url}
                </a>
              </div>
              <button
                onClick={() => handleDelete(video.id, video.exercise_name)}
                disabled={deletingId === video.id}
                className="text-zinc-500 hover:text-red-400 disabled:opacity-50 text-xs font-medium transition shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
