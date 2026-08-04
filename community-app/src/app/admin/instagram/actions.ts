'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Kept separate from the shared requireAdmin() in admin/actions.ts on
// purpose - every other admin action just needs is_admin, but this
// page sends real messages to real Instagram users, so it's locked to
// Satish's email specifically. This is the real security boundary (the
// page-level check in page.tsx is only a UX convenience); RLS on
// instagram_campaigns still falls back to is_admin() as a floor.
const RESTRICTED_TO_EMAIL = 'satish0kinng@gmail.com'

async function requireRestrictedAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.email !== RESTRICTED_TO_EMAIL) {
    return { supabase, user: null, allowed: false as const }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  return { supabase, user, allowed: !!profile?.is_admin }
}

export interface CampaignFormInput {
  name: string
  keyword: string
  media_id: string
  public_reply_text: string
  dm_prompt_text: string
  confirm_trigger: string
  file_message_text: string
  file_url: string
}

export async function createCampaign(input: CampaignFormInput) {
  const { supabase, user, allowed } = await requireRestrictedAdmin()
  if (!allowed || !user) return { error: 'Not authorized' }

  const { error } = await supabase.from('instagram_campaigns').insert({
    ...input,
    created_by: user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/admin/instagram')
  return { error: null }
}

export async function updateCampaign(id: string, input: CampaignFormInput) {
  const { allowed, supabase } = await requireRestrictedAdmin()
  if (!allowed) return { error: 'Not authorized' }

  const { error } = await supabase
    .from('instagram_campaigns')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/instagram')
  return { error: null }
}

export async function setCampaignActive(id: string, active: boolean) {
  const { allowed, supabase } = await requireRestrictedAdmin()
  if (!allowed) return { error: 'Not authorized' }

  const { error } = await supabase
    .from('instagram_campaigns')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/instagram')
  return { error: null }
}
