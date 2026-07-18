'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { convertWeightToKgForStorage } from '@/lib/weightUnit'

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
  // Guarded against anything but the two real values, rather than
  // trusting the submitted string outright - the DB's own CHECK
  // constraint would reject a bad value anyway, but failing silently
  // here (falling back to the current preference) is friendlier than
  // a thrown error over a settings field this low-stakes.
  const weightUnitRaw = formData.get('weight_unit') as string | null
  const weightUnit = weightUnitRaw === 'kg' || weightUnitRaw === 'lbs' ? weightUnitRaw : null

  const update: { full_name?: string; avatar_url?: string; weight_unit?: string } = {}
  if (fullName) update.full_name = fullName
  if (avatarUrl) update.avatar_url = avatarUrl
  if (weightUnit) update.weight_unit = weightUnit

  if (Object.keys(update).length === 0) return

  await supabase.from('profiles').update(update).eq('id', user.id)

  revalidatePath('/profile')
  revalidatePath('/feed')
  revalidatePath('/admin')
  revalidatePath('/leaderboard')
  revalidatePath('/workouts')
}

// One entry per calendar day - logging again the same day overwrites
// (upsert on profile_id + logged_date) rather than adding a second
// point, since multiple weigh-ins in a day don't add anything to a
// trend line. logged_date is the member's own local calendar date,
// passed in from the client rather than computed from the server
// clock - "today" should follow the device the member is standing on
// the scale next to, not wherever the server happens to be.
export async function logBodyWeight(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const weightRaw = formData.get('weight') as string | null
  const unitRaw = formData.get('unit') as string | null
  const dateRaw = formData.get('logged_date') as string | null

  const weight = weightRaw ? parseFloat(weightRaw) : NaN
  if (!Number.isFinite(weight) || weight <= 0) return

  const unit = unitRaw === 'lbs' ? 'lbs' : 'kg'
  const loggedDate =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : new Date().toISOString().slice(0, 10)
  const weightKg = convertWeightToKgForStorage(weight, unit)

  await supabase.from('body_weight_logs').upsert(
    {
      profile_id: user.id,
      weight_kg: weightKg,
      logged_date: loggedDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,logged_date' }
  )

  revalidatePath('/profile')
  revalidatePath('/admin')
}
