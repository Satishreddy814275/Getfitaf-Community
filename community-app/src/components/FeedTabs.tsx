'use client'

import { useState } from 'react'
import PostCard from './PostCard'
import type { Post } from '@/types'

type Tab = 'posts' | 'announcements' | 'media'

export default function FeedTabs({
  posts,
  currentUserId,
}: {
  posts: Post[]
  currentUserId: string
}) {
  const [tab, setTab] = useState<Tab>('posts')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  const announcements = posts.filter((p) => p.is_announcement)
  const mediaPosts = posts.filter((p) => p.media_url)

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'posts', label: 'Posts', count: posts.length },
    { key: 'announcements', label: 'Announcements', count: announcements.length },
    { key: 'media', label: 'Media', count: mediaPosts.length },
  ]

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-orange-500 text-white transition'
                : 'px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition'
            }
          >
            {t.label}
            {t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'posts' && (
        <div className="space-y-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} />
          ))}
          {posts.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">
              No posts yet — be the first to share something with the group.
            </p>
          )}
        </div>
      )}

      {tab === 'announcements' && (
        <div className="space-y-6">
          {announcements.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} />
          ))}
          {announcements.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">No announcements yet.</p>
          )}
        </div>
      )}

      {tab === 'media' && (
        <>
          {mediaPosts.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-12">No photos or videos yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {mediaPosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="relative aspect-square overflow-hidden rounded-lg bg-zinc-900 group"
                >
                  {post.media_type === 'video' ? (
                    <video
                      src={post.media_url!}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.media_url!} alt="" className="w-full h-full object-cover" />
                  )}
                  {post.media_type === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-2xl bg-black/20 group-hover:bg-black/30 transition">
                      ▶
                    </span>
                  )}
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Clicking a media thumbnail opens the full post here, with
          working likes/comments — this is the "go to the post from
          the grid" behavior. */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          onClick={() => setSelectedPost(null)}
        >
          <div className="w-full max-w-lg mt-8" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedPost(null)}
              className="mb-3 text-sm text-zinc-400 hover:text-white transition"
            >
              ✕ Close
            </button>
            <PostCard post={selectedPost} currentUserId={currentUserId} />
          </div>
        </div>
      )}
    </div>
  )
}
