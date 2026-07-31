'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Pin } from 'lucide-react'
import PostCard from './PostCard'
import PostComposer from './PostComposer'
import LeaderboardTeaser from './LeaderboardTeaser'
import { loadMorePosts, searchPosts } from '@/app/feed/actions'
import type { Post, LeaderboardRow, Space } from '@/types'

type Tab = 'posts' | 'announcements' | 'media'
type SpaceFilter = 'all' | Space

export default function FeedTabs({
  posts,
  hasMorePosts,
  currentUserId,
  isAdmin,
  availableSpaces,
  initialLessonId,
  initialLessonTitle,
  initialContent,
  initialPostId,
  initialCommentId,
  leaderboardRows,
}: {
  // Always the current first page from the server - stays authoritative
  // after a create/edit/delete triggers a re-render (see combinedPosts
  // below), unlike scrolledPosts which is purely additive client state.
  posts: Post[]
  // Whether a second page exists at all, as of the first page load -
  // see scrolledHasMore below for what drives further loads after that.
  hasMorePosts: boolean
  currentUserId: string
  isAdmin: boolean
  // Which spaces this specific person has real access to (see
  // feed/page.tsx) - drives whether the space switcher below shows up
  // at all (only when there's more than one) and which options it
  // offers. Single-space members (the vast majority) never see it,
  // same experience as before this existed.
  availableSpaces: Space[]
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
  // Only meaningful for someone with access to more than one space -
  // regular single-space members' feed is already fully scoped by RLS,
  // so this has nothing to actually switch for them (canFilterSpace
  // below stays false and the whole control never renders). Admins
  // default to the merged "All spaces" view (unchanged from before);
  // a non-admin with real dual access instead defaults straight into
  // their primary space, since "all" has no obvious post-target for
  // them and would just mean an extra tap before they can post at all.
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>(
    isAdmin ? 'all' : availableSpaces[0] || 'premium'
  )
  // Restored from localStorage below, once mounted - a plain
  // deterministic default here (rather than reading localStorage
  // directly in the initializer) avoids a server/client hydration
  // mismatch, since this is still server-rendered once before the
  // browser takes over. A one-frame flash of the default before the
  // effect corrects it is an acceptable tradeoff for that.
  const spaceStorageKey = `space-filter-${currentUserId}`

  // Without this, a page refresh (or just navigating back to /feed
  // later) always reset back to the hardcoded default above - "All
  // spaces" for admins, or your first available space for a
  // dual-access member - even if you'd deliberately switched to
  // something else. Only trusts the stored value if it's still valid
  // for this person (an admin's stored 'low_ticket', or a dual-access
  // member's stored space) - falls back to the same default otherwise,
  // e.g. on a first-ever visit or if their access changed since.
  useEffect(() => {
    const stored = window.localStorage.getItem(spaceStorageKey)
    if (!stored) return
    const isValid = stored === 'all' ? isAdmin : availableSpaces.includes(stored as Space)
    if (isValid) setSpaceFilter(stored as SpaceFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keeps localStorage in sync with whatever's currently selected,
  // including the correction the effect above might just have made.
  useEffect(() => {
    window.localStorage.setItem(spaceStorageKey, spaceFilter)
  }, [spaceFilter, spaceStorageKey])

  const canFilterSpace = availableSpaces.length > 1
  // What a new post from this composer should be tagged with. Null
  // specifically means "ambiguous" (admin sitting on the merged "All
  // spaces" view) - PostComposer treats null as "pick a space first"
  // rather than silently guessing, which is the exact bug this whole
  // feature replaces.
  const postSpace: Space | null = spaceFilter === 'all' ? null : spaceFilter

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

  // --- Infinite scroll ---
  // scrolledPosts is purely additive client state - everything loaded
  // via loadMore, beyond the first page the server already sent. It's
  // deliberately NOT the source of truth for the first page's own
  // content: creating/editing/deleting a post re-renders this component
  // with a fresh `posts` prop (Next's implicit post-server-action
  // refresh), and combinedPosts below always prefers that fresh prop
  // over anything stale sitting in scrolledPosts.
  const [scrolledPosts, setScrolledPosts] = useState<Post[]>([])
  // Seeded once from the initial page length - deliberately NOT reset
  // when the `posts` prop changes later (e.g. after creating a post),
  // since that would make the next loadMore() call re-fetch posts
  // already showing. A post created/deleted between here and the next
  // scroll can shift this by one either way - the same acceptable
  // drift already covered by the pagination comment in feed/page.tsx.
  const [offset, setOffset] = useState(posts.length)
  const [hasMore, setHasMore] = useState(hasMorePosts)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Always posts (fresh from the server) first, then whatever's been
  // scrolled in beyond it - deduped by id so a post that arrived in
  // both (e.g. it was already scrolled into view, then the whole first
  // page refreshed after an unrelated create/edit elsewhere) isn't
  // rendered twice.
  const combinedPosts = useMemo(() => {
    const seen = new Set(posts.map((p) => p.id))
    return [...posts, ...scrolledPosts.filter((p) => !seen.has(p.id))]
  }, [posts, scrolledPosts])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const result = await loadMorePosts(offset)
    setScrolledPosts((prev) => [...prev, ...result.posts])
    setOffset((prev) => prev + result.posts.length)
    setHasMore(result.hasMore)
    setLoadingMore(false)
  }

  // Only wired up for the Posts tab - Announcements/Media are filtered
  // views over whatever's already loaded there, rather than each
  // getting their own independent pagination. Re-subscribes whenever
  // the values loadMore's own guard reads change, so the closure it
  // fires never sees a stale hasMore/loadingMore/offset.
  useEffect(() => {
    // Also off while a search query is active - search results (see
    // below) replace this list entirely and aren't paginated the same
    // way, so scrolling to the bottom of a short result set shouldn't
    // try to load more of the normal feed underneath it.
    if (tab !== 'posts' || !hasMore || search.trim()) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasMore, loadingMore, offset, search])

  // Single combined search — matches either the poster's name or the
  // post text, so one box covers "find a member" and "find a keyword"
  // without a second input crowding the tab row. Reaches across a
  // member's ENTIRE post history via searchPosts (see feed/actions.ts),
  // not just whatever's currently loaded in the scroll - a search that
  // only found things already on screen couldn't do the one thing
  // search exists for, finding something you're NOT currently looking
  // at.
  const query = search.trim().toLowerCase()
  const [searchResults, setSearchResults] = useState<Post[]>([])
  const [searching, setSearching] = useState(false)

  // Debounced - fires 350ms after typing settles, not on every
  // keystroke. Cleanup cancels a pending fetch if the text changes
  // again before it would have fired, so a fast typist never triggers
  // more than one real request per pause.
  useEffect(() => {
    const trimmed = search.trim()
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      const results = await searchPosts(trimmed)
      setSearchResults(results)
      setSearching(false)
    }, 350)
    return () => clearTimeout(handle)
  }, [search])

  // Memoized so typing in an unrelated input, or any other re-render
  // that doesn't actually change posts/spaceFilter/query, doesn't
  // re-run four filter passes over the whole post list on every
  // render - each stage only recomputes when its own actual inputs
  // change.
  const spaceScopedPosts = useMemo(
    () => (spaceFilter === 'all' ? combinedPosts : combinedPosts.filter((p) => p.space === spaceFilter)),
    [combinedPosts, spaceFilter]
  )
  const spaceScopedSearchResults = useMemo(
    () => (spaceFilter === 'all' ? searchResults : searchResults.filter((p) => p.space === spaceFilter)),
    [searchResults, spaceFilter]
  )
  // Search results replace the normal paginated/scrolled list entirely
  // while a query is active, rather than filtering on top of it - the
  // whole point is reaching posts that scrolling hasn't loaded yet.
  const filteredPosts = useMemo(
    () => (query ? spaceScopedSearchResults : spaceScopedPosts),
    [query, spaceScopedSearchResults, spaceScopedPosts]
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
        {/* Space filter now sits on the same row as the content tabs
            (right-aligned, styled as a muted segmented control rather
            than the tabs' own solid-orange treatment) instead of its
            own row stacked under the search box - one fewer row of
            nav-shaped chrome above the composer. Only ever shown to
            someone with more than one space (canFilterSpace) -
            realistically just admins on the merged view, or the rare
            dual-access member - so most members never see this at all. */}
        <div className="lg:col-span-2 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-orange-500 text-white transition'
                    : 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition'
                }
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    className={
                      tab === t.key
                        ? 'rounded-full bg-black/25 px-1.5 py-0.5 text-[11px] font-bold'
                        : 'rounded-full bg-zinc-800 px-1.5 py-0.5 text-[11px] font-bold text-zinc-400'
                    }
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {canFilterSpace && (
            <div className="flex items-center gap-1 bg-zinc-900 rounded-full p-1">
              {(
                (isAdmin
                  ? [
                      { key: 'all', label: 'All spaces' },
                      { key: 'premium', label: 'Premium' },
                      { key: 'low_ticket', label: 'Low-ticket' },
                    ]
                  : availableSpaces.map((s) => ({
                      key: s,
                      label: s === 'premium' ? 'Premium' : 'Low-Ticket Community',
                    }))) as { key: SpaceFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSpaceFilter(opt.key)}
                  className={
                    spaceFilter === opt.key
                      ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-100 transition'
                      : 'px-3 py-1.5 rounded-full text-xs font-medium text-zinc-500 hover:text-zinc-300 transition'
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
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
            postSpace={postSpace}
            initialLessonId={initialLessonId}
            initialLessonTitle={initialLessonTitle}
            initialContent={initialContent}
          />
        </div>

        {tab === 'posts' && (
        <div className="space-y-6">
          {/* A pinned post collapses to a one-line banner instead of
              rendering full-length inline - the welcome post especially
              was pushing everything else below the fold before anyone
              had done anything. Opens through the same selectedPost
              overlay a media thumbnail or notification link already
              uses, so it's still a real post underneath: likes,
              comments, and (for its author/admins) inline editing all
              still work exactly as before, just one tap away instead
              of always fully expanded. */}
          {filteredPosts.map((post) =>
            post.pinned ? (
              <button
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition text-left"
              >
                <Pin className="w-4 h-4 text-orange-400 rotate-45 shrink-0" strokeWidth={2.5} />
                <span className="flex-1 min-w-0 truncate text-sm text-zinc-200">
                  <span className="font-semibold text-orange-400">Pinned — </span>
                  {(post.content || '').split('\n')[0].replace(/\*\*/g, '')}
                </span>
                <span className="text-xs text-zinc-500 shrink-0">Read more &rarr;</span>
              </button>
            ) : (
              <PostCard key={post.id} post={post} currentUserId={currentUserId} isAdmin={isAdmin} />
            )
          )}
          {query && searching && filteredPosts.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">Searching...</p>
          )}
          {filteredPosts.length === 0 && !(query && searching) && (
            <p className="text-center text-sm text-zinc-500 py-12">
              {query
                ? `No posts or members match "${search.trim()}".`
                : 'No posts yet - be the first to share something with the group.'}
            </p>
          )}
          {/* Load-more trigger - hidden entirely while a search query
              is active, since results (see spaceScopedSearchResults
              above) come from their own capped, non-paginated fetch,
              not from this scroll. */}
          {!query && filteredPosts.length > 0 && hasMore && (
            <div ref={sentinelRef} className="py-6 text-center text-xs text-zinc-500">
              {loadingMore ? 'Loading more...' : ''}
            </div>
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
