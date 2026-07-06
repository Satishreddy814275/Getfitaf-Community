'use client'

import { useState } from 'react'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import LeaderboardTeaser from './LeaderboardTeaser'
import type { Post, LeaderboardRow } from '@/types'

type Tab = 'posts' | 'announcements' | 'media'

export default function FeedTabs({
  posts,
  currentUserId,
  isAdmin,
  initialLessonId,
  initialLessonTitle,
  leaderboardRows,
}: {
  posts: Post[]
  currentUserId: string
  isAdmin: boolean
  initialLessonId: string | null
  initialLessonTitle: string | null
  leaderboardRows: LeaderboardRow[]
}) {
  const [tab, setTab] = useState<Tab>('posts')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [search, setSearch] = useState('')

  // Single combined search — matches either the poster's name or the
  // post text, so one box covers "find a member" and "find a keyword"
  // without a second input crowding the tab row.
  const query = search.trim().toLowerCase()
  const filteredPosts = query
    ? posts.filter(
        (p) =>
          p.content?.toLowerCase().includes(query) ||
          p.profiles?.full_name?.toLowerCase().includes(query)
      )
    : posts

  const announcements = filteredPosts.filter((p) => p.is_announcement)
  const mediaPosts = filteredPosts.filter((p) => p.media_url)

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'posts', label: 'Posts', count: filteredPosts.length },
    { key: 'announcements', label: 'Announcements', count: announcements.length },
    { key: 'media', label: 'Media', count: mediaPosts.length },
  ]

  return (
    <>
      {/* Tab bar spans the full grid width (both columns), so the main
          content below it and the sidebar next to it both start at the
          same row — otherwise the sidebar box lines up with this row
          instead of with the composer, which looks mismatched. Internally
          it mirrors the outer 2/3 + 1/3 grid split (same col-span-2 /
          gap-6 proportions) so the search box's left edge lines up with
          the leaderboard sidebar's left edge below it, instead of just
          drifting to the far right of the full-width row. */}
      <div className="lg:col-span-3 lg:grid lg:grid-cols-3 lg:gap-6 mb-6">
        <div className="lg:col-span-2 flex items-center gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? 'px-4 py-2 rounded-full text-sm font-semibold bg-orange-500 text-white transition'
                  : 'px-4 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition'
              }
            >
              {t.label}
              {t.count > 0 ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <div className="mt-2 lg:mt-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members or posts..."
            className="w-full glass rounded-full px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50 transition"
          />
        </div>
      </div>

      {/* Compact leaderboard teaser — mobile only, hidden entirely (no
          grid placement) at the lg breakpoint where the real sidebar
          takes over. */}
      <div className="lg:hidden">
        <LeaderboardTeaser rows={leaderboardRows} />
      </div>

      <div className="lg:col-span-2">
        <div className="mb-6">
          <PostComposer
            isAdmin={isAdmin}
            initialLessonId={initialLessonId}
            initialLessonTitle={initialLessonTitle}
          />
        </div>

        {tab === 'posts' && (
        <div className="space-y-6">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} />
          ))}
          {filteredPosts.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">
              {query
                ? `No posts or members match "${search.trim()}".`
                : 'No posts yet — be the first to share something with the group.'}
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
            <p className="text-center text-sm text-zinc-500 py-12">
              {query ? `No announcements match "${search.trim()}".` : 'No announcements yet.'}
            </p>
          )}
        </div>
      )}

      {tab === 'media' && (
        <>
          {mediaPosts.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-12">
              {query ? `No photos or videos match "${search.trim()}".` : 'No photos or videos yet.'}
            </p>
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
                      className="w-full h-full object-contain"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.media_url!} alt="" className="w-full h-full object-contain" />
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
      </div>

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
    </>
  )
}
