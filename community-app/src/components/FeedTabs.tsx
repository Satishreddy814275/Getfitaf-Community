'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import LeaderboardTeaser from './LeaderboardTeaser'
import type { Post, LeaderboardRow } from '@/types'

type Tab = 'posts' | 'announcements' | 'media'
type SpaceFilter = 'all' | 'premium' | 'low_ticket'

export default function FeedTabs({
  posts,
  currentUserId,
  isAdmin,
  initialLessonId,
  initialLessonTitle,
  initialContent,
  initialPostId,
  initialCommentId,
  leaderboardRows,
}: {
  posts: Post[]
  currentUserId: string
  isAdmin: boolean
  initialLessonId: string | null
  initialLessonTitle: string | null
  // Plain pre-fill text, independent of the lesson-completion pair
  // above - see PostComposer's own comment on why these stay separate
  // props rather than one being reused for the other.
  initialContent?: string | null
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
  // Admin-only - regular members' feed is already scoped to a single
  // space by RLS, so this control would have nothing to actually
  // filter for them.
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>('all')

  // Drives the overlay's fade/scale transition. Kept separate from
  // selectedPost itself: opening needs a render with the "hidden"
  // styles committed first, then a follow-up frame flipping to
  // "visible" for the transition to actually have something to
  // animate from — and closing needs the overlay to fade out before
  // selectedPost is cleared, otherwise the content would just vanish
  // mid-transition instead of fading with it.
  const [overlayEntered, setOverlayEntered] = useState(false)

  useEffect(() => {
    if (!selectedPost) return
    const id = requestAnimationFrame(() => setOverlayEntered(true))
    return () => cancelAnimationFrame(id)
  }, [selectedPost])

  function closeOverlay() {
    setOverlayEntered(false)
  }

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
  // React's own "adjust state when a prop changes" pattern (see
  // react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // instead of calling setState synchronously inside an effect - a state
  // variable (deliberately useState, not useRef - refs can't be read or
  // written during render) remembers the initialPostId seen on the
  // previous render, and the state updates below only run on the render
  // where it actually changed. Still gated on initialPostId alone (not
  // posts/initialCommentId), for the same reason as before: re-opening
  // the overlay should only ever be driven by a fresh notification
  // click, not by posts/comment data changing underneath an already-
  // open overlay.
  const [prevInitialPostId, setPrevInitialPostId] = useState<string | null | undefined>(undefined)
  if (initialPostId !== prevInitialPostId) {
    setPrevInitialPostId(initialPostId)
    if (initialPostId) {
      const match = posts.find((p) => p.id === initialPostId)
      if (match) {
        setSelectedPost(match)
        setActiveCommentId(initialCommentId || null)
      } else {
        setPostNotFound(true)
      }
    }
  }

  // Clearing the query param is a real side effect (URL navigation), so
  // it stays in an effect - it just no longer needs to touch any state,
  // so no set-state-in-effect concern here.
  useEffect(() => {
    if (!initialPostId) return
    router.replace('/feed')
  }, [initialPostId, router])

  // Single combined search — matches either the poster's name or the
  // post text, so one box covers "find a member" and "find a keyword"
  // without a second input crowding the tab row.
  const query = search.trim().toLowerCase()

  // Memoized so typing in an unrelated input, or any other re-render
  // that doesn't actually change posts/spaceFilter/query, doesn't
  // re-run four filter passes over the whole post list on every
  // render - each stage only recomputes when its own actual inputs
  // change.
  const spaceScopedPosts = useMemo(
    () => (spaceFilter === 'all' ? posts : posts.filter((p) => p.space === spaceFilter)),
    [posts, spaceFilter]
  )
  const filteredPosts = useMemo(
    () =>
      query
        ? spaceScopedPosts.filter(
            (p) =>
              p.content?.toLowerCase().includes(query) ||
              p.profiles?.full_name?.toLowerCase().includes(query)
          )
        : spaceScopedPosts,
    [spaceScopedPosts, query]
  )
  const announcements = useMemo(
    () => filteredPosts.filter((p) => p.is_announcement),
    [filteredPosts]
  )
  const mediaPosts = useMemo(() => filteredPosts.filter((p) => p.media_url), [filteredPosts])

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

        <div className="mt-2 lg:mt-0 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members or posts..."
            className="w-full glass rounded-full px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500/50 transition"
          />
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'All spaces' },
                  { key: 'premium', label: 'Premium' },
                  { key: 'low_ticket', label: 'Low-ticket' },
                ] as { key: SpaceFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSpaceFilter(opt.key)}
                  className={
                    spaceFilter === opt.key
                      ? 'px-3 py-1 rounded-full text-xs font-semibold bg-orange-500 text-white transition'
                      : 'px-3 py-1 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition'
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
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
            initialContent={initialContent}
          />
        </div>

        {tab === 'posts' && (
        <div className="space-y-6">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} isAdmin={isAdmin} />
          ))}
          {filteredPosts.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">
              {query
                ? `No posts or members match "${search.trim()}".`
                : 'No posts yet - be the first to share something with the group.'}
            </p>
          )}
        </div>
      )}

      {tab === 'announcements' && (
        <div className="space-y-6">
          {announcements.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId} isAdmin={isAdmin} />
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
                    // This grid cell is a fixed aspect-square box (see the
                    // button's className above), so fill has a real size to
                    // fill against - unlike PostCard/AdminFeedList's full
                    // post images, which render at their natural aspect
                    // ratio and don't have a safe fixed box to give this.
                    <Image
                      src={post.media_url!}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 33vw, 200px"
                      className="object-contain"
                    />
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
          the grid" behavior. Fades and scales in/out (overlayEntered)
          instead of snapping instantly; closeOverlay only starts the
          fade-out, and the actual unmount happens in onTransitionEnd
          once that's finished, so the content fades along with the
          backdrop instead of disappearing mid-transition. */}
      {selectedPost && (
        <div
          className={
            'fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8 transition-opacity duration-200' +
            (overlayEntered ? ' opacity-100' : ' opacity-0')
          }
          onClick={closeOverlay}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'opacity' && !overlayEntered) {
              setSelectedPost(null)
              setActiveCommentId(null)
            }
          }}
        >
          <div
            className={
              'w-full max-w-lg mt-8 transition-all duration-200 ease-out' +
              (overlayEntered ? ' opacity-100 scale-100' : ' opacity-0 scale-95')
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeOverlay}
              className="mb-3 text-sm text-zinc-400 hover:text-white transition"
            >
              ✕ Close
            </button>
            <PostCard
              post={selectedPost}
              currentUserId={currentUserId}
              initialCommentId={activeCommentId}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      )}
    </>
  )
}
