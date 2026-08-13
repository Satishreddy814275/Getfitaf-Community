'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createPost } from '@/app/feed/actions'
import { compressImage } from '@/lib/compressImage'
import { useMarkdownShortcuts } from '@/lib/useMarkdownShortcuts'
import { useMentionAutocomplete } from '@/lib/useMentionAutocomplete'
import MentionDropdown from './MentionDropdown'
import type { Space } from '@/types'

// Matches the post-media storage bucket's own file_size_limit exactly
// (see the bucket config). Images aren't checked against this -
// compressImage always runs first and reliably brings them well under
// this limit, so this only ever gates video.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const FILE_TOO_LARGE_MESSAGE =
  "That video's too large to attach (25MB max). Share a Google Drive link instead — just make sure sharing is turned on so we can actually open it."
// Shown the moment ANY video is picked, before the size check even
// runs - most phones default to recording well above 25MB for even a
// few seconds of footage, so waiting to fail on a specific file (the
// previous version of this) meant most people hit the error message
// anyway. Leading with the Drive suggestion up front saves that
// round-trip. Short/heavily-compressed clips that do fit still attach
// normally in the background - this is guidance, not a block, unless
// the size check below actually rejects the file.
const VIDEO_HINT_MESSAGE =
  'Videos are usually too large to attach directly here — for anything longer than a few seconds, share a Google Drive link instead (make sure sharing is turned on). Short clips under 25MB will still attach normally.'

export default function PostComposer({
  isAdmin = false,
  postSpace,
  initialLessonId = null,
  initialLessonTitle = null,
  // Generic pre-fill, independent of the lesson-completion mechanism
  // above (initialLessonId/initialLessonTitle also attach a lesson_id
  // to the post and show the dismissible "Sharing about: X" chip -
  // this one is just plain starting text, e.g. from the workout
  // finish-celebration modal's "Post a win" button, with no lesson
  // association). If both are somehow present, the lesson-completion
  // wording wins - that path is the more specific/intentional one of
  // the two.
  initialContent = null,
}: {
  isAdmin?: boolean
  // Which space a new post gets tagged with, passed down explicitly
  // from FeedTabs' space filter rather than guessed server-side (see
  // feed/actions.ts createPost). Null specifically means "ambiguous" -
  // an admin sitting on the merged "All spaces" view - in which case
  // this renders a hint instead of a form, rather than silently
  // defaulting to one space like it used to.
  postSpace: Space | null
  initialLessonId?: string | null
  initialLessonTitle?: string | null
  initialContent?: string | null
}) {
  const [content, setContent] = useState(
    initialLessonTitle ? `Just finished "${initialLessonTitle}"! ` : initialContent || ''
  )
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  // Surfaces createPost failures instead of leaving the button stuck on
  // "Posting..." forever with no explanation (Satish 2026-08-04: hit
  // this exact thing - the post had actually gone through server-side,
  // but nothing here ever cleared the spinner or told him what
  // happened). See handleSubmit's try/finally below.
  const [postError, setPostError] = useState<string | null>(null)
  // Separate from postError - this is specifically about the picked
  // file (video-size guidance/rejection), shown right under the
  // filename rather than as a generic submit failure. 'hint' is
  // informational and doesn't block anything; 'error' means the file
  // was actually rejected, or a real upload failed.
  const [fileNote, setFileNote] = useState<{ type: 'hint' | 'error'; text: string } | null>(null)
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [lessonId, setLessonId] = useState(initialLessonId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // "Auto-open" for a composer that's always visible on the page (not
  // a real modal/toggle - see PostComposer's usage in FeedTabs) really
  // just means: scroll it into view and focus the textarea, so landing
  // on /feed with a pre-fill obviously ready to edit doesn't require
  // scrolling to find it first. Mount-only (empty deps) - deliberately
  // does not re-fire if content changes later from typing.
  useEffect(() => {
    if (!initialLessonTitle && !initialContent) return
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const textarea = textareaRef.current
    textarea?.focus()
    // Browsers place the cursor at the very start of a textarea's
    // pre-filled value on focus, not the end - without this, someone
    // continuing "Just finished leg day! 💪" would be typing in front
    // of that text instead of after it. setSelectionRange to the
    // content's own length moves the caret (and collapses any
    // selection) to the end.
    if (textarea) {
      const end = textarea.value.length
      textarea.setSelectionRange(end, end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-grow the textarea as content changes - resetting height to
  // 'auto' first (rather than only ever growing) lets it shrink back
  // down too, e.g. after deleting a few lines or clearing the field on
  // submit. The visual cap lives in CSS (max-h-[...] + overflow-y-auto
  // on the textarea below) rather than here, so this can freely ask
  // for whatever height the content needs and the browser just clips
  // it and starts scrolling once that CSS max is hit - no min/max math
  // to keep in sync in two places.
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [content])

  // @mention autocomplete (Satish 2026-08-04, approved mockup same
  // day; extended to comments/replies 2026-08-04 too - shared with
  // PostCard/CommentThread via this hook rather than three copies of
  // the same trigger-detection/fetch/insert logic).
  const mention = useMentionAutocomplete({ space: postSpace, content, setContent, inputRef: textareaRef })

  // Cmd/Ctrl+B and Cmd/Ctrl+I - lightweight markdown-style formatting
  // (**bold**, _italic_) rather than a full rich-text editor, since
  // content is still stored and posted as plain text. FormattedPostText
  // (used in PostCard) is what turns these markers back into real
  // bold/italic on the feed side. Also used by PostCard's edit-post
  // textarea - see useMarkdownShortcuts.
  const handleKeyDown = useMarkdownShortcuts(content, setContent, textareaRef)

  // Shared by the Cancel button and (already existing) post-on-submit
  // reset - a full wipe back to the composer's empty state, including
  // the lesson chip and the native file input's own internal value
  // (clearing the File state alone leaves the browser's file picker
  // still showing the previously chosen filename).
  function resetComposer() {
    setContent('')
    setFile(null)
    setFileNote(null)
    setIsAnnouncement(false)
    setLessonId(null)
    setPostError(null)
    mention.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Runs on selection, before anything is uploaded. Any video gets the
  // proactive Drive hint immediately, regardless of size - most phone
  // video is too big for this to ever succeed, so leading with the
  // suggestion beats waiting to fail first (see VIDEO_HINT_MESSAGE). A
  // video that's actually over MAX_UPLOAD_BYTES is additionally
  // rejected outright (replacing the hint with the harder error and
  // clearing the native input), rather than letting someone sit through
  // a slow mobile upload that was never going to succeed.
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] || null
    if (!picked) {
      setFileNote(null)
      setFile(null)
      return
    }
    if (picked.type.startsWith('video/')) {
      if (picked.size > MAX_UPLOAD_BYTES) {
        setFileNote({ type: 'error', text: FILE_TOO_LARGE_MESSAGE })
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      setFileNote({ type: 'hint', text: VIDEO_HINT_MESSAGE })
      setFile(picked)
      return
    }
    setFileNote(null)
    setFile(picked)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() && !file) return
    // Belt-and-suspenders alongside the disabled form below - the
    // submit button is already disabled while postSpace is null, but
    // this guards against any other way handleSubmit could fire.
    if (!postSpace) return

    setUploading(true)
    setPostError(null)
    // Everything below used to run with no try/catch at all - if
    // createPost (or the media upload before it) ever threw or
    // rejected for any reason, this function just stopped executing
    // mid-way: resetComposer() and setUploading(false) never ran, so
    // the button sat on "Posting..." forever with no error shown and
    // no way to tell if the post had actually gone through or not
    // (Satish 2026-08-04 - it turned out the post itself had usually
    // already been created; see the after()-scheduled push fanout fix
    // in feed/actions.ts for the actual thing that was hanging). This
    // wrap guarantees the spinner always clears and a real failure is
    // at least visible, regardless of what fails or why.
    try {
      const formData = new FormData()
      formData.set('content', mention.getSubmitContent())
      formData.set('is_announcement', String(isAdmin && isAnnouncement))
      formData.set('space', postSpace)
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
          // Upload raw bytes rather than handing the File/Blob object
          // straight to fetch — some browsers (Safari in particular)
          // don't reliably transmit a File that was constructed from a
          // canvas-generated Blob, silently sending an empty body. An
          // ArrayBuffer has no such issue. contentType is passed
          // explicitly too, rather than relying on it being inferred.
          const bytes = await uploadFile.arrayBuffer()
          const { error } = await supabase.storage.from('post-media').upload(path, bytes, {
            contentType: uploadFile.type || 'application/octet-stream',
          })

          if (!error) {
            const { data } = supabase.storage.from('post-media').getPublicUrl(path)
            formData.set('media_url', data.publicUrl)
            formData.set('media_type', file.type.startsWith('video') ? 'video' : 'image')
          } else {
            // This return doesn't skip the finally below - setUploading(false)
            // still runs. Previously this branch didn't exist at all: a
            // failed upload with no caption text meant the post
            // submission had neither content nor media_url, so
            // createPost silently no-op'd - the most likely explanation
            // for a client reporting they "can't upload a video" with
            // no error ever shown.
            setFileNote({
              type: 'error',
              text: error.message?.toLowerCase().includes('size')
                ? FILE_TOO_LARGE_MESSAGE
                : "That file couldn't be uploaded — try again, or share a Google Drive link instead (make sure sharing is turned on).",
            })
            return
          }
        }
      }

      await createPost(formData)
      resetComposer()
    } catch {
      setPostError("Something went wrong. If your post doesn't show up, try again.")
    } finally {
      setUploading(false)
    }
  }

  // Ambiguous target space (admin on the merged "All spaces" view) -
  // show a hint instead of a form nobody can safely submit, rather than
  // silently guessing which space a new post belongs to.
  if (!postSpace) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 text-sm text-zinc-400">
        Select Premium or Low-ticket above to post here.
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
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
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={mention.handleChange}
          onKeyDown={(e) => {
            if (mention.handleKeyDown(e)) return
            handleKeyDown(e)
          }}
          placeholder="Share an update, win, or question with the group... (type @ to mention someone)"
          className="w-full resize-none border-0 focus:ring-0 text-sm p-2 outline-none bg-transparent text-white placeholder-zinc-500 min-h-[96px] max-h-[320px] overflow-y-auto"
        />

        {mention.trigger && postSpace && (
          <MentionDropdown
            space={postSpace}
            loading={mention.loading}
            hasCandidates={mention.matches.length > 0}
            matches={mention.matches}
            onSelect={mention.select}
            anchorRef={textareaRef}
          />
        )}
      </div>
      {file && <p className="text-xs text-zinc-500 px-2">{file.name} selected</p>}
      {fileNote && (
        <p
          className={`text-xs px-2 leading-relaxed ${
            fileNote.type === 'error' ? 'text-red-400' : 'text-zinc-400'
          }`}
        >
          {fileNote.text}
        </p>
      )}
      {postError && <p className="text-xs text-red-400 px-2 mt-1">{postError}</p>}
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
          onChange={handleFileChange}
          className="text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-300 file:text-xs hover:file:bg-zinc-700"
        />
        <div className="flex items-center gap-2">
          {/* Only shown once there's actually something to discard -
              text, a file, or a lesson chip - rather than sitting there
              doing nothing on an empty composer. */}
          {(content.trim() || file || lessonId) && !uploading && (
            <button
              type="button"
              onClick={resetComposer}
              className="text-zinc-400 hover:text-white text-sm font-medium px-3 py-2 rounded-lg transition"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={uploading || (!content.trim() && !file)}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-40 transition"
          >
            {uploading ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}
