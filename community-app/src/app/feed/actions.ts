'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { FEED_PAGE_SIZE, FEED_POST_SELECT, SEARCH_RESULT_LIMIT } from '@/lib/feedPosts'
import { sendPushToProfile } from '@/lib/push'
import type { Post, Space } from '@/types'

// Infinite-scroll continuation of the first page feed/page.tsx already
// loaded - same select, same three-key order, just offset forward by
// however many posts the caller already has. Goes through the normal
// (RLS-scoped) client, same as the initial load, so a scrolled-in post
// respects the same space access a member already has - nothing extra
// to check here.
export async function loadMorePosts(offset: number): Promise<{ posts: Post[]; hasMore: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { posts: [], hasMore: false }

  const { data } = await supabase
    .from('posts')
    .select(FEED_POST_SELECT)
    .order('pinned', { ascending: false })
    .order('is_announcement', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + FEED_PAGE_SIZE - 1)

  const posts = (data as unknown as Post[] | null) || []
  return { posts, hasMore: posts.length === FEED_PAGE_SIZE }
}

// Reaches across a member's ENTIRE post history, unlike the paginated
// feed load above - that's the whole point of a search box (finding
// something you're not currently looking at), so it deliberately
// doesn't share loadMorePosts' "just the next page" scope. Content and
// poster-name matches are two separate, safely-built queries merged
// and deduped here, rather than one query trying to OR a base-table
// column against an embedded table's column - PostgREST doesn't
// support that cleanly, and building a raw OR filter string out of
// whatever someone typed (which could contain commas, parens, etc.)
// risks corrupting the filter syntax itself.
export async function searchPosts(query: string): Promise<Post[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const trimmed = query.trim()
  if (!trimmed) return []

  const pattern = `%${trimmed}%`

  const { data: matchingAuthors } = await supabase.from('profiles').select('id').ilike('full_name', pattern)
  const authorIds = (matchingAuthors || []).map((a) => a.id)

  const [contentRes, authorRes] = await Promise.all([
    supabase
      .from('posts')
      .select(FEED_POST_SELECT)
      .ilike('content', pattern)
      .order('pinned', { ascending: false })
      .order('is_announcement', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(SEARCH_RESULT_LIMIT),
    authorIds.length > 0
      ? supabase
          .from('posts')
          .select(FEED_POST_SELECT)
          .in('author_id', authorIds)
          .order('pinned', { ascending: false })
          .order('is_announcement', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(SEARCH_RESULT_LIMIT)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const seen = new Set<string>()
  const merged: Post[] = []
  for (const row of [...(contentRes.data || []), ...(authorRes.data || [])] as unknown as Post[]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    merged.push(row)
  }

  // Interleaving two separately-ordered result sets doesn't preserve a
  // single consistent order, so re-sort the merged set with the same
  // three-key rule used everywhere else in the feed.
  merged.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.is_announcement !== b.is_announcement) return a.is_announcement ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return merged.slice(0, SEARCH_RESULT_LIMIT)
}

export async function createPost(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const content = ((formData.get('content') as string) || '').trim() || null
  const mediaUrl = (formData.get('media_url') as string) || null
  const mediaType = (formData.get('media_type') as string) || null
  const isAnnouncement = formData.get('is_announcement') === 'true'
  const lessonId = (formData.get('lesson_id') as string) || null

  if (!content && !mediaUrl) return

  // Tag the post with whichever space the composer says it's for (see
  // migration-spaces.sql for the RLS side). FeedTabs now passes this
  // explicitly based on whichever space tab is active (and refuses to
  // render a submittable composer at all when that's ambiguous - see
  // PostComposer) - this matters for anyone with access to more than
  // one space (admins today, dual-access members after an upgrade),
  // since a post's correct space can no longer be guessed correctly
  // from membership rows alone once someone has more than one.
  const requestedSpace = formData.get('space') as string | null
  let space: string
  if (requestedSpace === 'premium' || requestedSpace === 'low_ticket') {
    space = requestedSpace
  } else {
    // Defensive fallback for any caller that doesn't pass an explicit
    // space (there shouldn't be one after this change, but this avoids
    // a hard failure if one ever shows up) - same lookup as before.
    const { data: membership } = await supabase
      .from('space_memberships')
      .select('space')
      .eq('profile_id', user.id)
      .limit(1)
      .maybeSingle()
    space = membership?.space || 'premium'
  }

  const { data: inserted } = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
      content,
      media_url: mediaUrl,
      media_type: mediaType,
      is_announcement: isAnnouncement,
      lesson_id: lessonId,
      space,
    })
    .select('id')
    .single()

  revalidatePath('/feed')

  // Push notification for admin posts only (Satish, 2026-08-02) - ANY
  // post from an admin, not just ones flagged is_announcement, reaches
  // everyone with access to that post's space as a real push, not just
  // the in-app bell/tab badge a regular member's post gets. Admin posts
  // are rare enough (this only fires for is_admin authors) that this
  // doesn't risk turning into per-post spam the way pushing every
  // member's post would.
  //
  // Scheduled via after() instead of awaited inline (Satish 2026-08-04:
  // clicking Post as an admin sometimes just sat on "Posting..."
  // forever, even though the post had actually already landed in the
  // DB - confirmed by checking the posts table directly). Root cause:
  // this whole push fanout used to run INSIDE createPost's own request/
  // response cycle, so the client's "Posting..." spinner didn't clear
  // until every recipient's webpush.sendNotification call had finished
  // - one slow or hanging push endpoint held up the entire response,
  // and PostComposer had no timeout/error handling to recover from that
  // (separately fixed below). after() runs this once the response has
  // already been sent back to the browser, so the post finishing is no
  // longer gated on push delivery at all - the two are decoupled the
  // way the old inline comment here assumed they couldn't be, but
  // after() (stable since Next 15, this app is on Next 16) is exactly
  // the API Vercel added to make this actually reliable, unlike a bare
  // un-awaited call which risks being killed the moment the response
  // goes out.
  if (inserted) {
    const { data: authorProfile } = await supabase
      .from('profiles')
      .select('is_admin, full_name')
      .eq('id', user.id)
      .single()

    if (authorProfile?.is_admin) {
      const postId = inserted.id
      const notifySpace = space as Space
      const authorId = user.id
      const authorName = authorProfile.full_name || 'GetFit AF'
      after(() =>
        notifyAdminPost({
          postId,
          space: notifySpace,
          authorId,
          authorName,
          content,
        })
      )
    }
  }
}

// Push fanout for an admin's post - see the after() call above for why
// this no longer needs to be awaited inline. Scoped
// to whoever actually has access to that post's space - a low_ticket
// post pushing every premium member (or vice versa) would be pushing
// people about a post they can't even see. Mirrors the same
// per-space-audience logic feed/page.tsx uses for availableSpaces, just
// resolved to profile ids here via the admin client instead of a
// single signed-in user's own RLS-scoped view.
async function notifyAdminPost({
  postId,
  space,
  authorId,
  authorName,
  content,
}: {
  postId: string
  space: Space
  authorId: string
  authorName: string
  content: string | null
}) {
  const admin = createAdminClient()

  const spaceRecipientIds =
    space === 'low_ticket'
      ? (
          await admin.from('space_memberships').select('profile_id').eq('space', 'low_ticket')
        ).data?.map((r) => r.profile_id) || []
      : (await admin.from('profiles').select('id').eq('approved', true)).data?.map((r) => r.id) || []

  // Admins/coaches always get every admin post's push regardless of
  // their own space membership - every other tier-gated feature in
  // this app already treats is_admin as "sees everything" (Workouts,
  // Lessons, Programs all check isAdmin || ...), this was the one place
  // that didn't. Real bug, not hypothetical: since the beta launched
  // every admin post has gone to the low_ticket space, and two admins
  // (Rishita, Naresh - both approved/premium, neither has a low_ticket
  // membership row) never once appeared in spaceRecipientIds, so they
  // never received a single push despite having notifications enabled -
  // caught and confirmed 2026-08-03.
  const { data: adminProfiles } = await admin.from('profiles').select('id').eq('is_admin', true)
  const adminIds = adminProfiles?.map((r) => r.id) || []

  const recipientIds = Array.from(new Set([...spaceRecipientIds, ...adminIds]))
  const targets = recipientIds.filter((id) => id !== authorId)
  if (targets.length === 0) return

  // Same first-line/strip-markdown preview style already used for the
  // pinned-post banner (FeedTabs.tsx) - a push notification's body has
  // even less room than that banner does.
  const preview = (content || '').split('\n')[0].replace(/\*\*/g, '').slice(0, 120)

  await Promise.all(
    targets.map((profileId) =>
      sendPushToProfile(profileId, {
        title: `${authorName} posted`,
        body: preview || 'Tap to see the new post.',
        url: `/feed?post=${postId}`,
      })
    )
  )
}

export async function editPost(postId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const content = ((formData.get('content') as string) || '').trim()
  if (!content) return

  // RLS (posts_update - see migration-pinned-posts.sql) already scopes
  // this to the post's own author or an admin, same policy the pin
  // toggle uses - this update simply no-ops (0 rows affected) rather
  // than erroring if someone who isn't either somehow calls it.
  await supabase
    .from('posts')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', postId)

  revalidatePath('/feed')
}

export async function addComment(
  postId: string,
  formData: FormData,
  parentCommentId: string | null = null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const content = ((formData.get('content') as string) || '').trim()
  if (!content) return

  // Server-side double-submit guard, on top of the client-side one in
  // PostCard/CommentThread (added 2026-08-04 after two real duplicate
  // pairs turned up in production — one from Satish, one from a
  // client reply, both a few seconds apart on the same post). The
  // client guard covers the normal case; this covers what it can't
  // — a second tab, a retried request, anything that reaches this
  // action a second time before the first has visibly resolved. If
  // this exact author already posted this exact text on this exact
  // post/parent in the last 10 seconds, treat it as the same
  // submission and hand back that row instead of inserting a copy.
  const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
  const parentFilter = parentCommentId
    ? { column: 'parent_comment_id' as const, value: parentCommentId }
    : null
  let recentDupeQuery = supabase
    .from('comments')
    .select('id')
    .eq('post_id', postId)
    .eq('author_id', user.id)
    .eq('content', content)
    .gte('created_at', tenSecondsAgo)
  recentDupeQuery = parentFilter
    ? recentDupeQuery.eq('parent_comment_id', parentFilter.value)
    : recentDupeQuery.is('parent_comment_id', null)
  const { data: recentDupe } = await recentDupeQuery.limit(1).maybeSingle()
  if (recentDupe) {
    revalidatePath('/feed')
    return
  }

  const { data: comment } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      author_id: user.id,
      content,
      parent_comment_id: parentCommentId,
    })
    .select('id')
    .single()

  // Notify — but which recipient depends on whether this is a
  // top-level comment (notify the post's author) or a reply (notify
  // the parent comment's author only). A reply deliberately does NOT
  // also notify the post author separately — otherwise one reply on
  // someone else's post generates two pings for the same action.
  if (comment) {
    if (parentCommentId) {
      const { data: parent } = await supabase
        .from('comments')
        .select('author_id')
        .eq('id', parentCommentId)
        .single()

      if (parent && parent.author_id !== user.id) {
        await supabase.from('notifications').insert({
          recipient_id: parent.author_id,
          actor_id: user.id,
          type: 'comment_reply',
          post_id: postId,
          comment_id: comment.id,
        })
      }
    } else {
      const { data: post } = await supabase
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .single()

      if (post && post.author_id !== user.id) {
        await supabase.from('notifications').insert({
          recipient_id: post.author_id,
          actor_id: user.id,
          type: 'post_comment',
          post_id: postId,
          comment_id: comment.id,
        })
      }
    }
  }

  revalidatePath('/feed')
}

export async function toggleLike(postId: string, liked: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  if (liked) {
    await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
  } else {
    await supabase.from('likes').insert({ post_id: postId, user_id: user.id })

    const { data: post } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single()

    if (post && post.author_id !== user.id) {
      await supabase.from('notifications').insert({
        recipient_id: post.author_id,
        actor_id: user.id,
        type: 'post_like',
        post_id: postId,
      })
    }
  }

  revalidatePath('/feed')
}

export async function toggleCommentLike(postId: string, commentId: string, liked: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  if (liked) {
    await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id)
  } else {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id })

    const { data: comment } = await supabase
      .from('comments')
      .select('author_id')
      .eq('id', commentId)
      .single()

    if (comment && comment.author_id !== user.id) {
      await supabase.from('notifications').insert({
        recipient_id: comment.author_id,
        actor_id: user.id,
        type: 'comment_like',
        post_id: postId,
        comment_id: commentId,
      })
    }
  }

  revalidatePath('/feed')
}

export async function markNotificationsRead() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', user.id)
    .eq('read', false)

  revalidatePath('/feed')
}

// Clears the Announcements tab's "new" badge (see FeedTabs.tsx) - one
// cursor per member, same "mark seen the moment the panel/tab opens"
// timing as markNotificationsRead above, not gated on an explicit
// dismiss action.
export async function markAnnouncementsSeen() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('profiles')
    .update({ last_seen_announcements_at: new Date().toISOString() })
    .eq('id', user.id)

  revalidatePath('/feed')
}
