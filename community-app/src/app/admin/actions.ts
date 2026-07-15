'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkoutPlan } from '@/lib/workoutPlan'
import { revalidatePath } from 'next/cache'
import type { WorkoutHistoryGroup, WorkoutHistorySet, WorkoutPlanDay } from '@/types'
import {
  collapseExercisesToBlocks,
  expandBlocksToExercises,
  replaceDayExercises,
  type EditableBlock,
} from '@/lib/workoutBlocks'
import {
  applyWeekOverrides,
  applyStructuralDiffToBlocks,
  type ProgressionCell,
  type StructuralDiffEntry,
} from '@/lib/dayGroups'

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
export async function addExerciseVideo(exerciseName: string, videoUrl: string, coachNotes?: string) {
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
    coach_notes: coachNotes?.trim() || null,
    added_by: user?.id || null,
  })

  revalidatePath('/admin/videos')
  revalidatePath('/workouts')
}

// `coachNotes` is optional and, when omitted (undefined), leaves the
// existing note untouched rather than clearing it - callers like the
// inline video editors in AdminProgramsList.tsx only ever edit
// name/url and have no notes field of their own, so they shouldn't be
// able to silently wipe out a note added elsewhere. Passing an empty
// string, on the other hand, explicitly clears it - that only happens
// from the real edit form in AdminExerciseVideosList.tsx.
export async function updateExerciseVideo(
  id: string,
  exerciseName: string,
  videoUrl: string,
  coachNotes?: string
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const trimmedName = exerciseName.trim()
  const trimmedUrl = videoUrl.trim()
  if (!trimmedName || !trimmedUrl) return

  const update: { exercise_name: string; video_url: string; coach_notes?: string | null } = {
    exercise_name: trimmedName,
    video_url: trimmedUrl,
  }
  if (coachNotes !== undefined) update.coach_notes = coachNotes.trim() || null

  await supabase.from('exercise_videos').update(update).eq('id', id)

  revalidatePath('/admin/videos')
  revalidatePath('/workouts')
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

// Editable metadata + description for an existing program, from
// /admin/programs - self-service so Satish can update a program's
// title, level, equipment tier, duration, or description whenever,
// without going through a SQL insert. Deliberately does NOT touch
// structured_plan (the actual day-by-day exercise content) - see
// updateProgramExercise below for the (currently numbers-only) editor
// for that. Description is stored as plain text with the small
// markdown-like syntax the formatting toolbar produces (see
// src/lib/richText.tsx); null/empty just means the program card shows
// no description yet.
export async function updateProgramMetadata(
  id: string,
  fields: {
    name: string
    level: string
    equipmentTier: string
    durationWeeks: number
    description: string
  }
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const name = fields.name.trim()
  const level = fields.level.trim()
  const equipmentTier = fields.equipmentTier.trim()
  const description = fields.description.trim()
  if (!name || !level || !equipmentTier) return

  await supabase
    .from('program_templates')
    .update({
      name,
      level,
      equipment_tier: equipmentTier,
      duration_weeks: Math.max(1, Math.round(fields.durationWeeks) || 1),
      description: description || null,
    })
    .eq('id', id)

  revalidatePath('/admin/programs')
  revalidatePath('/programs')
}

// Publish/unpublish toggle - previously only settable via a manual SQL
// update after seeding a program's content. Unpublished programs stay
// admin-visible (see program_templates_select policy) but drop out of
// the member-facing /programs picker.
export async function toggleProgramPublished(id: string, isPublished: boolean) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase.from('program_templates').update({ is_published: isPublished }).eq('id', id)

  revalidatePath('/admin/programs')
  revalidatePath('/programs')
}

// Creates a brand-new program directly from /admin/programs - the
// first program-authoring path that doesn't require a manual SQL
// insert. Starts unpublished with an empty structured_plan (no days
// yet); the admin builds it out afterward via "+ Add day" and the
// existing day editor, so everything from here on reuses tooling
// that's already built rather than needing anything new. Returns the
// new row's id (or null on failure/validation) in case a caller wants
// it, though the current UI just refreshes the list.
export async function createProgram(fields: {
  name: string
  level: string
  equipmentTier: string
  durationWeeks: number
  description: string
}): Promise<string | null> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return null

  const name = fields.name.trim()
  const level = fields.level.trim()
  const equipmentTier = fields.equipmentTier.trim()
  const description = fields.description.trim()
  if (!name || !level || !equipmentTier) return null

  const { data, error } = await supabase
    .from('program_templates')
    .insert({
      name,
      level,
      equipment_tier: equipmentTier,
      duration_weeks: Math.max(1, Math.round(fields.durationWeeks) || 1),
      description: description || null,
      is_published: false,
      structured_plan: { days: [] },
    })
    .select('id')
    .single()

  if (error) return null

  revalidatePath('/admin/programs')
  return data.id as string
}

// Appends one new, empty (week, day) entry to a program - the other
// half of self-service program creation, since createProgram starts
// with zero days. Refuses to clobber an existing (week, day) rather
// than overwriting it, since that would silently wipe out real
// authored content if an admin mistypes a week/day that's already in
// use. The new day starts with exercises: [] - it shows up in
// /admin/programs as an "empty" day (recently relaxed to be openable
// even with no exercises yet, see DayPreview) ready to build out via
// the same "Edit day" flow as any other day.
// Returns a result (rather than void) so the caller can actually tell
// the trainer why nothing happened - this used to fail silently on a
// (week, day) collision, closing the "+ Add day" form as if it had
// worked while quietly doing nothing, which is exactly the confusing
// "I clicked Add day and nothing happened" experience Satish hit
// (Week 1 / Day 1 already existed in that program).
export async function addProgramDay(
  programId: string,
  week: number,
  day: number,
  label: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const trimmedLabel = label.trim()
  if (!trimmedLabel) return { ok: false, error: 'Enter a label for this day.' }
  if (week < 1 || day < 1) return { ok: false, error: 'Week and day must be 1 or higher.' }

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return { ok: false, error: 'Could not load this program - try again.' }

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  if (plan.days.some((d) => d.week === week && d.day === day)) {
    return { ok: false, error: `Week ${week}, Day ${day} already has content - pick a different week/day, or edit that existing day instead.` }
  }

  plan.days = [...plan.days, { week, day, label: trimmedLabel, exercises: [] }]

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
  return { ok: true }
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

// "Tier 1" exercise editor - lets an admin tweak the numbers on an
// EXISTING exercise (sets, reps, restSeconds, timerSeconds,
// trackWeight) from /admin/programs, without touching name, round,
// phase, or the exercise list's shape (no add/remove/reorder yet -
// that's the harder "Tier 2" restructuring piece, deliberately left
// out of this first pass since it needs its own guardrails so nobody
// can accidentally desync "order" from array position, or leave a
// round-based day with a mismatched round count, and break the guided
// player for a real client mid-workout). Identifies the exercise by
// (week, day, order) since order is unique within a single day and
// is already how every program is authored.
//
// structured_plan is one JSONB blob per program (not a child table),
// so this reads the whole plan, mutates the one matching exercise in
// place, and writes the whole blob back - same pattern the SQL seed
// files already rely on, just done through the app instead of a
// manual insert.
export async function updateProgramExercise(
  programId: string,
  week: number,
  day: number,
  order: number,
  fields: {
    sets: string
    reps: string
    restSeconds: number | null
    timerSeconds: number | null
    trackWeight: boolean
  }
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  const dayEntry = plan.days.find((d) => d.week === week && d.day === day)
  const exercise = dayEntry?.exercises.find((e) => e.order === order)
  if (!exercise) return

  const sets = fields.sets.trim() || exercise.sets
  const reps = fields.reps.trim() || exercise.reps
  exercise.sets = sets
  exercise.reps = reps
  exercise.trackWeight = fields.trackWeight

  if (fields.restSeconds === null) delete exercise.restSeconds
  else exercise.restSeconds = Math.max(0, Math.round(fields.restSeconds))

  if (fields.timerSeconds === null) delete exercise.timerSeconds
  else exercise.timerSeconds = Math.max(0, Math.round(fields.timerSeconds))

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
}

// "Tier 2" restructuring editor - a single day's full exercise list,
// saved as a batch from the block-based editor (see workoutBlocks.ts).
// Unlike updateProgramExercise, the caller doesn't mutate one field on
// one existing row - it hands over the complete, already-edited block
// list for the day (grouped/ungrouped, renamed, reordered, whatever),
// and this always rebuilds that day's exercises from scratch via
// expandBlocksToExercises. That function is what actually guarantees
// order/phase/round invariants hold - this action just trusts its
// output and replaces the one day's exercises wholesale, same
// read-whole-blob/write-whole-blob pattern as updateProgramExercise.
//
// Also carries the day's `notes` - the free-text instructions shown to
// members above the exercise list in the guided player (e.g. "Circuit
// format - work through the moves below in order") - since it's the
// other piece of day-level content that previously had no edit surface
// at all. Passing null/empty clears it rather than leaving a stale
// value key present with an empty string.
export async function updateProgramDay(
  programId: string,
  week: number,
  day: number,
  blocks: EditableBlock[],
  notes: string | null
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  const dayEntry = plan.days.find((d) => d.week === week && d.day === day)
  if (!dayEntry) return

  const exercises = expandBlocksToExercises(blocks)
  const withExercises = replaceDayExercises(plan.days, week, day, exercises)
  const trimmedNotes = notes?.trim() || null

  plan.days = withExercises.map((d) => {
    if (d.week !== week || d.day !== day) return d
    if (trimmedNotes) return { ...d, notes: trimmedNotes }
    const { notes: _drop, ...rest } = d
    return rest as WorkoutPlanDay
  })

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
}

// "Day group" editor - writes a shared structure (which exercises,
// their order/grouping/names, from workoutBlocks/dayGroups) across
// every occurrence of the same day label in the program at once, plus
// each occurrence's own progression numbers (sets/reps/rest/timer).
// This is what makes editing e.g. "Upper Body A" in one place apply to
// every week that uses it - the day-by-day updateProgramDay above is
// still there for one-off edits, this is additive, not a replacement.
//
// `occurrences` must be given in the SAME order as the `cells` arrays
// inside `progressionByBlockId` were built (see dayGroups.ts's
// ProgressionRow.cells) - matched by array position, not by week
// number, since the same label can occur more than once within a
// single week (confirmed in real content) and a week-number key would
// silently collide two different days together.
export async function updateProgramDayGroup(
  programId: string,
  occurrences: Array<{ week: number; day: number }>,
  templateBlocks: EditableBlock[],
  progressionByBlockId: Record<string, ProgressionCell[]>
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }

  let days = plan.days
  for (let i = 0; i < occurrences.length; i++) {
    const { week, day } = occurrences[i]
    const dayEntry = days.find((d) => d.week === week && d.day === day)
    if (!dayEntry) continue

    const overridesForThisOccurrence: Record<string, ProgressionCell> = {}
    for (const blockId of Object.keys(progressionByBlockId)) {
      overridesForThisOccurrence[blockId] = progressionByBlockId[blockId][i]
    }

    const weekBlocks = applyWeekOverrides(templateBlocks, overridesForThisOccurrence)
    const exercises = expandBlocksToExercises(weekBlocks)
    days = replaceDayExercises(days, week, day, exercises)
  }
  plan.days = days

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
}

// Companion to the day-group grid above, for the opposite case: days
// sharing a label whose exercises DON'T all match structurally, so
// there's no shared template to edit in one place (see
// diffBlockStructure in dayGroups.ts). Called after a normal
// updateProgramDay save, only when the admin explicitly confirms - it
// replicates just the identity/grouping change onto every OTHER day in
// this program sharing `label`, matched by exercise name, and skips
// any sibling day that doesn't already have a matching exercise
// (never adds/removes exercises on a sibling). Deliberately leaves
// sets/reps/rest/timer untouched everywhere - those stay per-day.
export async function propagateDayStructuralChanges(
  programId: string,
  label: string,
  sourceWeek: number,
  sourceDay: number,
  changes: StructuralDiffEntry[]
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return
  if (changes.length === 0) return

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  let days = plan.days

  for (const d of days) {
    if (d.label !== label) continue
    if (d.week === sourceWeek && d.day === sourceDay) continue
    if (!d.exercises || d.exercises.length === 0) continue

    const blocks = collapseExercisesToBlocks(d.exercises)
    const { blocks: nextBlocks, changed } = applyStructuralDiffToBlocks(blocks, changes)
    if (!changed) continue

    const exercises = expandBlocksToExercises(nextBlocks)
    days = replaceDayExercises(days, d.week, d.day, exercises)
  }

  plan.days = days
  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
}
