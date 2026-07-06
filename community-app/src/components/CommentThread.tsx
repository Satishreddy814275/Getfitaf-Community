'use client'

import { useState } from 'react'
import { addComment, toggleCommentLike } from '@/app/feed/actions'
import Avatar from './Avatar'
import LikeButton from './LikeButton'
import type { Comment } from '@/types'

// Renders a flat list of comments (top-level + replies, distinguished
// by parent_comment_id) as a two-tier thread: top-level comments, with
// their replies indented beneath. Replies deliberately can't be
// replied to themselves (allowReply=false below) — one level of
// nesting reads as "layered" without the complexity of a real
// recursive thread, and matches how most small communities actually
// use it (Facebook visually collapses past one level anyway).
export default function CommentThread({
  postId,
  comments,
  currentUserId,
}: {
  postId: string
  comments: Comment[]
  currentUserId: string
}) {
  const topLevel = comments.filter((c) => !c.parent_comment_id)
  const repliesByParent = comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (c.parent_comment_id) {
      acc[c.parent_comment_id] = acc[c.parent_comment_id] || []
      acc[c.parent_comment_id].push(c)
    }
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {topLevel.map((comment) => (
        <CommentRow
          key={comment.id}
          postId={postId}
          comment={comment}
          replies={repliesByParent[comment.id] || []}
          currentUserId={currentUserId}
          allowReply
        />
      ))}
    </div>
  )
}

function CommentRow({
  postId,
  comment,
  replies,
  currentUserId,
  allowReply,
}: {
  postId: string
  comment: Comment
  replies: Comment[]
  currentUserId: string
  allowReply: boolean
}) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')

  const liked = comment.comment_likes.some((l) => l.user_id === currentUserId)
  const likeCount = comment.comment_likes.length

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim()) return
    const formData = new FormData()
    formData.set('content', replyText)
    await addComment(postId, formData, comment.id)
    setReplyText('')
    setReplying(false)
  }

  return (
    <div>
      <div className="flex items-start gap-2 text-sm bg-zinc-900 rounded-lg px-3 py-2 text-zinc-200">
        <Avatar avatarUrl={comment.profiles?.avatar_url} name={comment.profiles?.full_name} size={22} />
        <div className="flex-1">
          <p>
            <span className="font-semibold text-white">
              {comment.profiles?.full_name || 'Member'}:{' '}
            </span>
            {comment.content}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <LikeButton
              liked={liked}
              count={likeCount}
              compact
              onToggle={() => toggleCommentLike(postId, comment.id, liked)}
            />
            {allowReply && (
              <button
                type="button"
                onClick={() => setReplying((r) => !r)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition"
              >
                Reply
              </button>
            )}
          </div>
        </div>
      </div>

      {replying && (
        <form onSubmit={handleReply} className="flex gap-2 mt-2 ml-8">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Reply to ${comment.profiles?.full_name || 'this comment'}...`}
            className="flex-1 text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
            autoFocus
          />
          <button type="submit" className="text-sm font-medium text-orange-500 hover:text-orange-400">
            Send
          </button>
        </form>
      )}

      {replies.length > 0 && (
        <div className="ml-8 mt-2 space-y-2">
          {replies.map((reply) => (
            <CommentRow
              key={reply.id}
              postId={postId}
              comment={reply}
              replies={[]}
              currentUserId={currentUserId}
              allowReply={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
