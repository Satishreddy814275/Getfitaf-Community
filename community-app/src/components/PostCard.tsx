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
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold shrink-0">
          {post.profiles?.full_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <p className="text-sm font-semibold">{post.profiles?.full_name || 'Member'}</p>
          <p className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      {post.content && <p className="mt-3 text-sm whitespace-pre-wrap">{post.content}</p>}

      {post.media_url && post.media_type === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.media_url}
          alt=""
          className="mt-3 rounded-lg max-h-96 w-full object-cover"
        />
      )}
      {post.media_url && post.media_type === 'video' && (
        <video src={post.media_url} controls className="mt-3 rounded-lg max-h-96 w-full" />
      )}

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500">
        <button
          onClick={handleLike}
          disabled={pending}
          className={liked ? 'text-red-500 font-medium' : ''}
        >
          ♥ {likeCount > 0 ? likeCount : ''} Like
        </button>
        <button onClick={() => setShowComments((s) => !s)}>
          💬 {post.comments.length > 0 ? post.comments.length : ''} Comment
        </button>
      </div>

      {showComments && (
        <div className="mt-3 space-y-2">
          {post.comments.map((c) => (
            <div key={c.id} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-semibold">{c.profiles?.full_name || 'Member'}: </span>
              {c.content}
            </div>
          ))}
          <form onSubmit={handleComment} className="flex gap-2 mt-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            <button type="submit" className="text-sm font-medium text-black">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
