'use client'

import { useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Pin } from 'lucide-react'
import { addComment, editPost, toggleLike } from '@/app/feed/actions'
import Avatar from './Avatar'
import LikeButton from './LikeButton'
import LikeSummary from './LikeSummary'
import CommentThread from './CommentThread'
import FormattedPostText from './FormattedPostText'
import { useMarkdownShortcuts } from '@/lib/useMarkdownShortcuts'
import type { Post } from '@/types'

export default function PostCard({
  post,
  currentUserId,
  initialCommentId,
  isAdmin,
}: {
  post: Post
  currentUserId: string
  initialCommentId?: string | null
  // Only admins see posts from both spaces merged into one feed
  // (regular members' own feed is already scoped to a single space by
  // RLS, so the label would be redundant noise for them) - this badge
  // is what makes that merged view legible instead of "one bracket"
  // with no way to tell which space a post actually belongs to.
  isAdmin?: boolean
}) {
  const [commentText, setCommentText] = useState('')
  // Opened via a notification pointing at a specific comment/reply —
  // start with comments already expanded instead of landing on the
  // post and still requiring a click to see what the notification was
  // actually about.
  const [showComments, setShowComments] = useState(!!initialCommentId)
  const [imageExpanded, setImageExpanded] = useState(false)
  // Editing own-post text - admins can edit any post, matching the
  // same trust level as their existing delete rights (see
  // migration-pinned-posts.sql's posts_update policy, which this
  // reuses as-is).
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content || '')
  const [savingEdit, setSavingEdit] = useState(false)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  // Same Cmd/Ctrl+B, Cmd/Ctrl+I shortcuts as PostComposer's textarea -
  // see useMarkdownShortcuts. Was missing here before, so bold/italic
  // only worked on new posts, not on edits to existing ones.
  const handleEditKeyDown = useMarkdownShortcuts(editContent, setEditContent, editTextareaRef)

  const liked = post.likes.some((l) => l.user_id === currentUserId)
  const likeCount = post.likes.length
  const hasMedia = !!post.media_url
  const canEdit = post.profiles?.id === currentUserId || isAdmin

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    const formData = new FormData()
    formData.set('content', commentText)
    await addComment(post.id, formData)
    setCommentText('')
  }

  function startEditing() {
    setEditContent(post.content || '')
    setEditing(true)
  }

  function cancelEditing() {
    setEditContent(post.content || '')
    setEditing(false)
  }

  async function handleSaveEdit() {
    const trimmed = editContent.trim()
    if (!trimmed) return
    setSavingEdit(true)
    const formData = new FormData()
    formData.set('content', trimmed)
    await editPost(post.id, formData)
    setSavingEdit(false)
    setEditing(false)
  }

  return (
    <div
      className={
        post.is_announcement
          ? 'glass rounded-2xl overflow-hidden border-l-4 border-l-orange-500 bg-orange-500/5'
          : 'glass rounded-2xl overflow-hidden'
      }
    >
      {/* Text section — header, pin/announcement labels, caption */}
      <div className="p-5">
        {post.pinned && (
          <span className="inline-flex items-center gap-1 mb-2 px-2.5 py-1 rounded-full text-xs font-semibold text-[#fb923c] bg-[rgba(249,115,22,0.12)] border border-[rgba(249,115,22,0.3)]">
            <Pin className="w-3 h-3 rotate-45" strokeWidth={2.5} />
            Pinned
          </span>
        )}
        {post.is_announcement && (
          <p className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1.5">
            📢 Announcement from your coach
          </p>
        )}
        <div className="flex items-center gap-2.5">
          <Avatar avatarUrl={post.profiles?.avatar_url} name={post.profiles?.full_name} size={40} />
          <div>
            <p className="text-[15px] font-semibold text-white">
              {post.profiles?.full_name || 'Member'}
            </p>
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              {post.edited_at && <span title={new Date(post.edited_at).toLocaleString()}>(edited)</span>}
              {isAdmin && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                    post.space === 'premium'
                      ? 'bg-zinc-800 text-zinc-400'
                      : 'bg-orange-500/10 text-orange-400'
                  }`}
                >
                  {post.space === 'premium' ? 'Premium' : 'Low-ticket'}
                </span>
              )}
            </p>
          </div>

          {canEdit && !editing && (
            <button
              type="button"
              onClick={startEditing}
              className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition shrink-0"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-3">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-lg bg-zinc-900 border border-zinc-700 text-sm p-2 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editContent.trim()}
                className="text-sm font-medium text-orange-500 hover:text-orange-400 disabled:opacity-40 transition"
              >
                {savingEdit ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={savingEdit}
                className="text-sm text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          post.content && (
            <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-200">
              <FormattedPostText text={post.content} />
            </p>
          )
        )}
      </div>

      {/* Media section — full-bleed, no hard divider line so it flows
          straight out of the text above instead of looking like a
          separate boxed-in block. max-h uses viewport height rather
          than a fixed px cap so photos render as large as they
          naturally can, closer to Facebook's scale. */}
      {hasMedia && post.media_type === 'image' && (
        <button
          type="button"
          onClick={() => setImageExpanded(true)}
          className="block w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.media_url!}
            alt=""
            className="w-full max-h-[80vh] object-contain bg-black/30"
          />
        </button>
      )}
      {hasMedia && post.media_type === 'video' && (
        <video src={post.media_url!} controls className="w-full max-h-[80vh]" />
      )}

      {imageExpanded && post.media_url && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setImageExpanded(false)}
        >
          <button
            onClick={() => setImageExpanded(false)}
            className="absolute top-4 right-4 text-white text-sm border border-zinc-600 rounded-lg px-3 py-1.5 hover:bg-white/10 transition"
          >
            ✕ Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.media_url}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Actions + comments section */}
      <div className={hasMedia ? 'p-5' : 'p-5 pt-3 border-t border-zinc-800'}>
        <LikeSummary likes={post.likes} currentUserId={currentUserId} />
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <LikeButton
            liked={liked}
            count={likeCount}
            onToggle={() => toggleLike(post.id, liked)}
          />
          <button
            onClick={() => setShowComments((s) => !s)}
            className="hover:text-zinc-200 transition"
          >
            💬 {post.comments.length > 0 ? post.comments.length : ''} Comment
          </button>
        </div>

        {/* Comments stay mounted at all times — collapsing hides them
            via a grid-row animation (globals.css) rather than
            unmounting instantly. Without the animation, collapsing
            snaps the whole block to zero height in one reflow, which
            makes everything below jump into place abruptly; animating
            it makes the same reflow read as an intentional collapse
            instead of a jarring jump. */}
        <div className={`comments-collapse mt-3${showComments ? ' comments-open' : ''}`}>
          <div className="space-y-2">
            <CommentThread
              postId={post.id}
              comments={post.comments}
              currentUserId={currentUserId}
              highlightCommentId={initialCommentId}
            />
            <form onSubmit={handleComment} className="flex gap-2 mt-2">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
              />
              <button type="submit" className="text-sm font-medium text-orange-500 hover:text-orange-400">
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
