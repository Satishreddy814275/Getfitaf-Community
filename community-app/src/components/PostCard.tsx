'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { addComment, toggleLike } from '@/app/feed/actions'
import type { Post } from '@/types'

export default function PostCard({
  post,
  currentUserId,
}: {
  post: Post
  currentUserId: string
}) {
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [pending, setPending] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)

  const liked = post.likes.some((l) => l.user_id === currentUserId)
  const likeCount = post.likes.length

  async function handleLike() {
    setPending(true)
    await toggleLike(post.id, liked)
    setPending(false)
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    const formData = new FormData()
    formData.set('content', commentText)
    await addComment(post.id, formData)
    setCommentText('')
  }

  return (
    <div
      className={
        post.is_announcement
          ? 'glass rounded-2xl p-4 border-l-4 border-l-orange-500 bg-orange-500/5'
          : 'glass rounded-2xl p-4'
      }
    >
      {post.is_announcement && (
        <p className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1.5">
          📢 Announcement from your coach
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm font-semibold shrink-0">
          {post.profiles?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            {post.profiles?.full_name || 'Member'}
          </p>
          <p className="text-xs text-zinc-500">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      {post.content && (
        <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-200">{post.content}</p>
      )}

      {post.media_url && post.media_type === 'image' && (
        <button
          type="button"
          onClick={() => setImageExpanded(true)}
          className="mt-3 block w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.media_url}
            alt=""
            className="rounded-lg max-h-96 w-full object-contain bg-black/20"
          />
        </button>
      )}
      {post.media_url && post.media_type === 'video' && (
        <video src={post.media_url} controls className="mt-3 rounded-lg max-h-96 w-full" />
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

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800 text-sm text-zinc-400">
        <button
          onClick={handleLike}
          disabled={pending}
          className={liked ? 'text-orange-500 font-medium' : 'hover:text-zinc-200 transition'}
        >
          ♥ {likeCount > 0 ? likeCount : ''} Like
        </button>
        <button
          onClick={() => setShowComments((s) => !s)}
          className="hover:text-zinc-200 transition"
        >
          💬 {post.comments.length > 0 ? post.comments.length : ''} Comment
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2">
          {post.comments.map((c) => (
            <div key={c.id} className="text-sm bg-zinc-900 rounded-lg px-3 py-2 text-zinc-200">
              <span className="font-semibold text-white">
                {c.profiles?.full_name || 'Member'}:{' '}
              </span>
              {c.content}
            </div>
          ))}
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
      )}
    </div>
  )
}
