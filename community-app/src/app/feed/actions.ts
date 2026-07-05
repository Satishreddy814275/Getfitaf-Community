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

export async function addComment(postId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const content = ((formData.get('content') as string) || '').trim()
  if (!content) return

  await supabase.from('comments').insert({
    post_id: postId,
    author_id: user.id,
    content,
  })

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
  }

  revalidatePath('/feed')
}
