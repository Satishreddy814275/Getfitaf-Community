'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  await supabase.from('posts').insert({
    author_id: user.id,
    content,
    media_url: mediaUrl,
    media_type: mediaType,
    is_announcement: isAnnouncement,
    lesson_id: lessonId,
  })

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
