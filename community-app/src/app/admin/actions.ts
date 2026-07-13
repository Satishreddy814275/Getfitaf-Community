'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkoutPlan } from '@/lib/workoutPlan'
import { revalidatePath } from 'next/cache'
import type { WorkoutHistoryGroup, WorkoutHistorySet } from '@/types'

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

// Manual assignment for the low-ticket (₹499/mo) space. Domestic
// signups are granted automatically by the Stripe webhook
// (src/app/api/stripe-webhook) once that's deployed — this stays as
// the fallback for international payments handled manually via the
// satish@getfitaf.fitness contact path, and as a manual override for
// anything the webhook doesn't catch.
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

// Approves a member into the premium space — same `approved` flag
// admin.html's Approve button on learn.getfitaf.fitness already
// manages. Duplicated here as a shortcut so a brand new signup can be
// handled (approved as premium, or granted low-ticket, or both) from
// this one screen instead of needing to jump between two admin pages.
export async function approveProfile(userId: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase.from('profiles').update({ approved: true }).eq('id', userId)

  revalidatePath('/admin/members')
}

// Exercise video library - added incrementally by Satish/coaches over
// time. Matching against AI-generated exercise names happens live in
// /workouts (src/lib/exerciseVideos.ts), not at generation time, so a
// video added here immediately becomes visible on every past plan
// that references a matching exercise name, no regeneration needed.
export async function addExerciseVideo(exerciseName: string, videoUrl: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const trimmedName = exerciseName.trim()
  const trimmedUrl = videoUrl.trim()
  if (!trimmedName || !trimmedUrl) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('exercise_videos').insert({
    exercise_name: trimmedName,
    video_url: trimmedUrl,
    added_by: user?.id || null,
  })

  revalidatePath('/admin/videos')
}

export async function updateExerciseVideo(id: string, exerciseName: string, videoUrl: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const trimmedName = exerciseName.trim()
  const trimmedUrl = videoUrl.trim()
  if (!trimmedName || !trimmedUrl) return

  await supabase
    .from('exercise_videos')
    .update({ exercise_name: trimmedName, video_url: trimmedUrl })
    .eq('id', id)

  revalidatePath('/admin/videos')
}

export async function deleteExerciseVideo(id: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase.from('exercise_videos').delete().eq('id', id)

  revalidatePath('/admin/videos')
}

// Bulk paste import - one row per line, "Exercise name, video url".
// Rows whose (normalized) exercise name already exists in the library,
// or that repeat earlier in the same paste, are silently skipped by
// the caller before this is invoked (see AdminExerciseVideosList's
// parsedBulkRows) rather than here, so the UI can show an accurate
// "N skipped as duplicates" count before the insert happens.
export async function addExerciseVideosBulk(rows: { exerciseName: string; videoUrl: string }[]) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const cleaned = rows
    .map((r) => ({
      exercise_name: r.exerciseName.trim(),
      video_url: r.videoUrl.trim(),
      added_by: user?.id || null,
    }))
    .filter((r) => r.exercise_name && r.video_url)

  if (cleaned.length === 0) return

  await supabase.from('exercise_videos').insert(cleaned)

  revalidatePath('/admin/videos')
}

// Full workout history for one member, fetched on-demand (only when
// an admin actually expands that member's row on /admin/members, not
// eagerly for everyone in the list) - mirrors the exact grouping logic
// in workouts/page.tsx, just parameterized by an arbitrary member
// instead of always the signed-in user, and going through the
// admin/service-role client since workout_sessions/workout_logged_sets
// are owner-scoped by RLS (profile_id = auth.uid()) and this needs to
// read another member's rows. Returns the same WorkoutHistoryGroup[]
// shape the member-facing WorkoutHistoryList component already
// renders, so no new display component was needed here.
export async function getMemberWorkoutHistory(memberId: string): Promise<WorkoutHistoryGroup[]> {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return []

  const admin = createAdminClient()

  const activePlan = await getActiveWorkoutPlan(memberId)

  const { data: allSessions } = await admin
    .from('workout_sessions')
    .select('id, generation_id, week_number, day_number, day_label, completed_at')
    .eq('profile_id', memberId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })

  const sessionIds = (allSessions || []).map((s) => s.id)
  const { data: allSetsData } =
    sessionIds.length > 0
      ? await admin
          .from('workout_logged_sets')
          .select('session_id, exercise_name, set_number, weight, reps')
          .in('session_id', sessionIds)
      : { data: [] as { session_id: string; exercise_name: string; set_number: number; weight: number | null; reps: number | null }[] }

  const setsBySession: Record<string, WorkoutHistorySet[]> = {}
  for (const row of allSetsData || []) {
    if (!setsBySession[row.session_id]) setsBySession[row.session_id] = []
    setsBySession[row.session_id].push({
      exerciseName: row.exercise_name,
      setNumber: row.set_number,
      weight: row.weight,
      reps: row.reps,
    })
  }

  const groupsByGeneration = new Map<string, WorkoutHistoryGroup>()
  for (const s of allSessions || []) {
    const group: WorkoutHistoryGroup = groupsByGeneration.get(s.generation_id) || {
      generationId: s.generation_id,
      isCurrent: s.generation_id === activePlan?.generationId,
      sessions: [],
    }
    group.sessions.push({
      id: s.id,
      week: s.week_number,
      day: s.day_number,
      label: s.day_label,
      completedAt: s.completed_at,
      sets: setsBySession[s.id] || [],
    })
    groupsByGeneration.set(s.generation_id, group)
  }

  return Array.from(groupsByGeneration.values()).sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return (b.sessions[0]?.completedAt || '').localeCompare(a.sessions[0]?.completedAt || '')
  })
}
