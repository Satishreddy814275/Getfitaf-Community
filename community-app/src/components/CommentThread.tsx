'use client'

import { useState } from 'react'
import { addComment, toggleCommentLike } from '@/app/feed/actions'
import Avatar from './Avatar'
import LikeButton from './LikeButton'
import type { Comment } from '@/types'

// Renders comments as a two-tier thread: top-level comments, with
// every reply underneath them at one single indent level — no matter
// how many times someone replies to a reply, it never nests deeper
// than that one tier. "Reply" stays available on every row, including
// replies themselves; replying to a reply (rather than the original
// comment) auto-prefixes the text with an @mention so it's still
// clear who it's aimed at despite the flat layout — the same trick
// Instagram/Facebook use to avoid runaway nesting while still letting
// people reply to a specific reply.
export default function CommentThread({
  postId,
  comments,
  currentUserId,
}: {
  postId: string
  comments: Comment[]
  currentUserId: string
}) {
  const byId = comments.reduce<Record<string, Comment>>((acc, c) => {
    acc[c.id] = c
    return acc
  }, {})

  function topLevelIdOf(comment: Comment): string {
    let current = comment
    while (current.parent_comment_id) {
      const parent = byId[current.parent_comment_id]
      if (!parent) break
      current = parent
    }
    return current.id
  }

  const topLevel = comments.filter((c) => !c.parent_comment_id)

  const repliesByTopLevel: Record<string, Comment[]> = {}
  comments.forEach((c) => {
    if (!c.parent_comment_id) return
    const topId = topLevelIdOf(c)
    repliesByTopLevel[topId] = repliesByTopLevel[topId] || []
    repliesByTopLevel[topId].push(c)
  })
  Object.values(repliesByTopLevel).forEach((arr) =>
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  )

  return (
    <div className="space-y-3">
      {topLevel.map((comment) => (
        <div key={comment.id}>
          <CommentRow
            postId={postId}
            comment={comment}
            topLevelId={comment.id}
            currentUserId={currentUserId}
          />
          {(repliesByTopLevel[comment.id] || []).length > 0 && (
            <div className="ml-8 mt-2 space-y-2">
              {repliesByTopLevel[comment.id].map((reply) => (
                <CommentRow
                  key={reply.id}
                  postId={postId}
                  comment={reply}
                  topLevelId={comment.id}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CommentRow({
  postId,
  comment,
  topLevelId,
  currentUserId,
}: {
  postId: string
  comment: Comment
  topLevelId: string
  currentUserId: string
}) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')

  const liked = comment.comment_likes.some((l) => l.user_id === currentUserId)
  const likeCount = comment.comment_likes.length
  // True when this row is itself a reply (not the original top-level
  // comment) — replying to one of these is what needs the @mention
  // prefix, since the flat layout would otherwise lose who it's aimed at.
  const isReply = comment.id !== topLevelId

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim()) return
    const content = isReply
      ? `@${comment.profiles?.full_name || 'Member'} ${replyText}`
      : replyText
    const formData = new FormData()
    formData.set('content', content)
    // parent_comment_id is always the exact row that was replied to
    // (even if that's itself a reply) — this keeps notification
    // recipients accurate (whoever you actually replied to gets
    // pinged) even though the rendering flattens everything visually.
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
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Reply
            </button>
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
    </div>
  )
}
