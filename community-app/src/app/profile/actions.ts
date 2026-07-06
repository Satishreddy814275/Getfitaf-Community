'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Deliberately name + avatar only — no email editing here. Email is tied
// to how Supabase authenticates the account itself, and self-service
// changes to it would need a verification flow (confirm the new
// address) to avoid lockouts or account-hijack scenarios. That's a
// separate, more careful feature for later if it ever becomes a common
// request — for now, email changes stay a manual admin action.
export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const fullName = ((formData.get('full_name') as string) || '').trim()
  const avatarUrl = (formData.get('avatar_url') as string) || null

  const update: { full_name?: string; avatar_url?: string } = {}
  if (fullName) update.full_name = fullName
  if (avatarUrl) update.avatar_url = avatarUrl

  if (Object.keys(update).length === 0) return

  await supabase.from('profiles').update(update).eq('id', user.id)

  revalidatePath('/profile')
  revalidatePath('/feed')
  revalidatePath('/admin')
  revalidatePath('/leaderboard')
}
