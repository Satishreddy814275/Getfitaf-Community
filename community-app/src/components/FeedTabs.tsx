'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  initialPostId,
  initialCommentId,
  leaderboardRows,
}: {
  posts: Post[]
  currentUserId: string
  isAdmin: boolean
  initialLessonId: string | null
  initialLessonTitle: string | null
  initialPostId?: string | null
  initialCommentId?: string | null
  leaderboardRows: LeaderboardRow[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('posts')
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  // Captured into state (not read straight from the initialCommentId
  // prop) because router.replace below clears the query param shortly
  // after this runs, which would otherwise flip the prop back to null
  // out from under the open overlay.
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [postNotFound, setPostNotFound] = useState(false)
  const [search, setSearch] = useState('')

  // Arriving from a notification link (?post=<id>&comment=<id>) — open
  // that exact post in the overlay immediately, with comments already
  // expanded and scrolled to the specific one, regardless of which tab
  // it'd normally live under. Posts are loaded unpaginated in
  // feed/page.tsx, so the target is already in `posts` unless it's
  // been deleted.
  //
  // Keyed on initialPostId, not run-once-on-mount: the bell lives in
  // the header on every page, so most clicks happen while you're
  // already sitting on /feed — Next.js then only updates the search
  // param instead of remounting this component. A mount-only effect
  // would silently never fire again in that case, which is exactly
  // why clicking a notification looked like it did nothing.
  useEffect(() => {
    if (!initialPostId) return
    const match = posts.find((p) => p.id === initialPostId)
    if (match) {
      setSelectedPost(match)
      setActiveCommentId(initialCommentId || null)
    } else {
      setPostNotFound(true)
    }
    // Clear the query params so a refresh or closing the overlay
    // doesn't keep re-triggering this.
    router.replace('/feed')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId])

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
      {postNotFound && (
        <div className="lg:col-span-3 mb-4 text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
          <span>That post is no longer available.</span>
          <button
            onClick={() => setPostNotFound(false)}
            className="text-zinc-500 hover:text-white transition"
          >
            ✕
          </button>
        </div>
      )}

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
          onClick={() => {
            setSelectedPost(null)
            setActiveCommentId(null)
          }}
        >
          <div className="w-full max-w-lg mt-8" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setSelectedPost(null)
                setActiveCommentId(null)
              }}
              className="mb-3 text-sm text-zinc-400 hover:text-white transition"
            >
              ✕ Close
            </button>
            <PostCard
              post={selectedPost}
              currentUserId={currentUserId}
              initialCommentId={activeCommentId}
            />
          </div>
        </div>
      )}
    </>
  )
}
