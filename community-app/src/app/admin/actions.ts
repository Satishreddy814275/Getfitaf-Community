'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, isAdmin: false as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return { supabase, isAdmin: !!profile?.is_admin }
}

function storagePathFromUrl(mediaUrl: string): string | null {
  const marker = '/object/public/post-media/'
  const idx = mediaUrl.indexOf(marker)
  if (idx === -1) return null
  return mediaUrl.slice(idx + marker.length)
}

export async function deletePost(postId: string, mediaUrl: string | null) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  // Best-effort cleanup of the uploaded media file. Comments/likes on
  // this post are removed automatically via the "on delete cascade"
  // foreign keys in schema.sql.
  if (mediaUrl) {
    const path = storagePathFromUrl(mediaUrl)
    if (path) {
      await supabase.storage.from('post-media').remove([path])
    }
  }

  await supabase.from('posts').delete().eq('id', postId)
  revalidatePath('/admin')
  revalidatePath('/feed')
}

export async function deleteComment(commentId: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase.from('comments').delete().eq('id', commentId)
  revalidatePath('/admin')
  revalidatePath('/feed')
}
