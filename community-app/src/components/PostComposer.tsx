'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPost } from '@/app/feed/actions'
import { compressImage } from '@/lib/compressImage'

export default function PostComposer({
  isAdmin = false,
  initialLessonId = null,
  initialLessonTitle = null,
}: {
  isAdmin?: boolean
  initialLessonId?: string | null
  initialLessonTitle?: string | null
}) {
  const [content, setContent] = useState(
    initialLessonTitle ? `Just finished "${initialLessonTitle}"! ` : ''
  )
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [lessonId, setLessonId] = useState(initialLessonId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() && !file) return

    setUploading(true)
    const formData = new FormData()
    formData.set('content', content)
    formData.set('is_announcement', String(isAdmin && isAnnouncement))
    if (lessonId) formData.set('lesson_id', lessonId)

    if (file) {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Images get resized/re-encoded before upload (see
        // compressImage.ts); videos pass through untouched.
        const uploadFile = file.type.startsWith('image/') ? await compressImage(file) : file
        const ext = uploadFile.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('post-media').upload(path, uploadFile)

        if (!error) {
          const { data } = supabase.storage.from('post-media').getPublicUrl(path)
          formData.set('media_url', data.publicUrl)
          formData.set('media_type', file.type.startsWith('video') ? 'video' : 'image')
        }
      }
    }

    await createPost(formData)
    setContent('')
    setFile(null)
    setIsAnnouncement(false)
    setLessonId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-4">
      {lessonId && initialLessonTitle && (
        <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-lg bg-orange-500/10 text-xs text-orange-400">
          <span>Sharing about: {initialLessonTitle}</span>
          <button
            type="button"
            onClick={() => setLessonId(null)}
            className="text-orange-400/70 hover:text-orange-300 transition"
          >
            ✕
          </button>
        </div>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share an update, win, or question with the group..."
        className="w-full resize-none border-0 focus:ring-0 text-sm p-2 outline-none bg-transparent text-white placeholder-zinc-500"
        rows={3}
      />
      {file && <p className="text-xs text-zinc-500 px-2">{file.name} selected</p>}
      {isAdmin && (
        <label className="flex items-center gap-2 px-2 mb-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isAnnouncement}
            onChange={(e) => setIsAnnouncement(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"
          />
          Post as announcement 📢
        </label>
      )}
      <div className="flex items-center justify-between border-t border-zinc-800 pt-3 mt-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-300 file:text-xs hover:file:bg-zinc-700"
        />
        <button
          type="submit"
          disabled={uploading || (!content.trim() && !file)}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-40 transition"
        >
          {uploading ? 'Posting...' : 'Post'}
        </button>
      </div>
    </form>
  )
}
