'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { deletePost, deleteComment } from '@/app/admin/actions'
import type { Post } from '@/types'

export default function AdminFeedList({ posts }: { posts: Post[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function handleDeletePost(postId: string, mediaUrl: string | null) {
    if (!confirm('Delete this post? This also removes its comments and likes. This cannot be undone.')) return
    setPendingId(postId)
    await deletePost(postId, mediaUrl)
    setPendingId(null)
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    setPendingId(commentId)
    await deleteComment(commentId)
    setPendingId(null)
  }

  if (posts.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-12">No posts yet.</p>
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div key={post.id} className="glass rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
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
            <button
              onClick={() => handleDeletePost(post.id, post.media_url)}
              disabled={pendingId === post.id}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition shrink-0 disabled:opacity-40"
            >
              {pendingId === post.id ? 'Deleting...' : 'Delete post'}
            </button>
          </div>

          {post.content && (
            <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-200">{post.content}</p>
          )}

          {post.media_url && post.media_type === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.media_url}
              alt=""
              className="mt-3 rounded-lg max-h-64 w-full object-cover"
            />
          )}
          {post.media_url && post.media_type === 'video' && (
            <video src={post.media_url} controls className="mt-3 rounded-lg max-h-64 w-full" />
          )}

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-500">
            <span>{post.likes.length} likes</span>
            <button
              onClick={() => setExpanded((e) => ({ ...e, [post.id]: !e[post.id] }))}
              className="hover:text-zinc-300 transition"
            >
              {post.comments.length} comments {expanded[post.id] ? '(hide)' : '(show)'}
            </button>
          </div>

          {expanded[post.id] && post.comments.length > 0 && (
            <div className="mt-3 space-y-2">
              {post.comments.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 text-sm bg-zinc-900 rounded-lg px-3 py-2 text-zinc-200"
                >
                  <p>
                    <span className="font-semibold text-white">
                      {c.profiles?.full_name || 'Member'}:{' '}
                    </span>
                    {c.content}
                  </p>
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    disabled={pendingId === c.id}
                    className="text-xs text-red-400 hover:text-red-300 transition shrink-0 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
