'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { FEED_PAGE_SIZE, FEED_POST_SELECT, SEARCH_RESULT_LIMIT } from '@/lib/feedPosts'
import type { Post } from '@/types'

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

  await supabase.from('posts').insert({
    author_id: user.id,
    content,
    media_url: mediaUrl,
    media_type: mediaType,
    is_announcement: isAnnouncement,
    lesson_id: lessonId,
    space,
  })

  revalidatePath('/feed')
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
