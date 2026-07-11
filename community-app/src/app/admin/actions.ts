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

export async function togglePin(postId: string, pinned: boolean) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase.from('posts').update({ pinned }).eq('id', postId)
  revalidatePath('/admin')
  revalidatePath('/feed')
}

export async function resetAvatar(userId: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  // Best-effort cleanup of the stored file — avatars always live at a
  // fixed "{userId}/avatar" path (no extension in the path itself; the
  // content-type header handles rendering), so this is a single known
  // path rather than needing to parse a stored URL.
  await supabase.storage.from('avatars').remove([`${userId}/avatar`])
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)

  revalidatePath('/admin/members')
  revalidatePath('/feed')
  revalidatePath('/admin')
}

// Manual assignment for the low-ticket (₹500/mo) space — this is the
// bridge until an automated payment flow exists. Once someone's paid
// (Stripe Payment Link for domestic, or the satish@getfitaf.fitness
// contact path for international), grant it here.
export async function grantLowTicketAccess(userId: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase
    .from('space_memberships')
    .upsert({ profile_id: userId, space: 'low_ticket' }, { onConflict: 'profile_id,space' })

  revalidatePath('/admin/members')
}

export async function revokeLowTicketAccess(userId: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase
    .from('space_memberships')
    .delete()
    .eq('profile_id', userId)
    .eq('space', 'low_ticket')

  revalidatePath('/admin/members')
}
