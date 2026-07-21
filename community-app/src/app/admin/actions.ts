'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveWorkoutPlan } from '@/lib/workoutPlan'
import { buildLogAsDurationLookup } from '@/lib/workoutBlocks'
import { revalidatePath } from 'next/cache'
import type {
  WorkoutExercise,
  WorkoutHistoryGroup,
  WorkoutHistorySet,
  WorkoutPlanDay,
  BodyWeightEntry,
} from '@/types'
import {
  collapseExercisesToBlocks,
  expandBlocksToExercises,
  replaceDayExercises,
  baseExerciseName,
  type EditableBlock,
} from '@/lib/workoutBlocks'
import { normalize } from '@/lib/exerciseVideos'
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

// Finds the canonical exercises row matching a name (same
// normalize()+baseExerciseName() dedup the pool/catalog backfill used -
// see migration-exercises-catalog.sql), creating one if nothing matches
// yet. Keeps the exercises catalog current as new videos are added,
// without a separate manual "register this exercise" step. Videos
// themselves still match to program content by name at display time
// (src/lib/exerciseVideos.ts), completely unrelated to this - this id
// is only for the admin-side catalog/muscle-groups/category-tags join.
async function findOrCreateExerciseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawName: string
): Promise<string | null> {
  const name = baseExerciseName(rawName)
  if (!name) return null

  const { data: existing } = await supabase.from('exercises').select('id, name')
  const target = normalize(name)
  const match = (existing || []).find((e) => normalize(e.name) === target)
  if (match) return match.id

  const { data: created } = await supabase
    .from('exercises')
    .insert({ name })
    .select('id')
    .single()
  return created?.id ?? null
}

// Exercise video library - added incrementally by Satish/coaches over
// time. Matching against AI-generated exercise names happens live in
// /workouts (src/lib/exerciseVideos.ts), not at generation time, so a
// video added here immediately becomes visible on every past plan
// that references a matching exercise name, no regeneration needed.
//
// videoType splits this into two independently-tracked libraries -
// 'tutorial' (used in the member workout view) and 'demo' (admin-only
// for now). isPlaceholder flags footage that isn't Satish's own yet -
// defaults to true since that's the common case for a freshly-added
// video (see project memory); the quick "+ Video" add inside the
// day/exercise picker (AdminProgramsList.tsx) doesn't pass these at
// all, so it gets the same tutorial/placeholder defaults.
export async function addExerciseVideo(
  exerciseName: string,
  videoUrl: string,
  coachNotes?: string,
  videoType: 'tutorial' | 'demo' = 'tutorial',
  isPlaceholder: boolean = true
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const trimmedName = exerciseName.trim()
  const trimmedUrl = videoUrl.trim()
  if (!trimmedName || !trimmedUrl) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const exerciseId = await findOrCreateExerciseId(supabase, trimmedName)

  await supabase.from('exercise_videos').insert({
    exercise_name: trimmedName,
    video_url: trimmedUrl,
    coach_notes: coachNotes?.trim() || null,
    added_by: user?.id || null,
    video_type: videoType,
    is_placeholder: isPlaceholder,
    exercise_id: exerciseId,
  })

  revalidatePath('/admin/videos')
  revalidatePath('/admin/exercises')
  revalidatePath('/workouts')
}

// `coachNotes` and `isPlaceholder` are both optional and, when omitted
// (undefined), leave the existing value untouched rather than
// clearing/resetting it - callers like the inline video editors in
// AdminProgramsList.tsx only ever edit name/url and have no notes or
// placeholder field of their own, so they shouldn't be able to
// silently wipe either one out. videoType is deliberately NOT editable
// here at all - a video's type is fixed at creation (which tab it was
// added from), editing shouldn't be able to move it to the other
// library by accident.
export async function updateExerciseVideo(
  id: string,
  exerciseName: string,
  videoUrl: string,
  coachNotes?: string,
  isPlaceholder?: boolean
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const trimmedName = exerciseName.trim()
  const trimmedUrl = videoUrl.trim()
  if (!trimmedName || !trimmedUrl) return

  const exerciseId = await findOrCreateExerciseId(supabase, trimmedName)

  const update: {
    exercise_name: string
    video_url: string
    exercise_id: string | null
    coach_notes?: string | null
    is_placeholder?: boolean
  } = {
    exercise_name: trimmedName,
    video_url: trimmedUrl,
    exercise_id: exerciseId,
  }
  if (coachNotes !== undefined) update.coach_notes = coachNotes.trim() || null
  if (isPlaceholder !== undefined) update.is_placeholder = isPlaceholder

  await supabase.from('exercise_videos').update(update).eq('id', id)

  revalidatePath('/admin/videos')
  revalidatePath('/admin/exercises')
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
export async function addExerciseVideosBulk(
  rows: { exerciseName: string; videoUrl: string }[],
  videoType: 'tutorial' | 'demo' = 'tutorial',
  isPlaceholder: boolean = true
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const validRows = rows
    .map((r) => ({ exercise_name: r.exerciseName.trim(), video_url: r.videoUrl.trim() }))
    .filter((r) => r.exercise_name && r.video_url)

  if (validRows.length === 0) return

  const cleaned = await Promise.all(
    validRows.map(async (r) => ({
      ...r,
      added_by: user?.id || null,
      video_type: videoType,
      is_placeholder: isPlaceholder,
      exercise_id: await findOrCreateExerciseId(supabase, r.exercise_name),
    }))
  )

  await supabase.from('exercise_videos').insert(cleaned)

  revalidatePath('/admin/videos')
  revalidatePath('/admin/exercises')
}

// Four independent tag buckets, all living directly on the canonical
// exercises row (see migration-exercises-catalog.sql +
// migration-exercises-tag-buckets) - a plain array overwrite per
// bucket each save, no diffing needed since AdminExercisesList always
// shows/edits the full set for all four at once.
export async function updateExerciseMetadata(
  id: string,
  muscleGroups: string[],
  equipmentTags: string[],
  typeTags: string[],
  otherTags: string[]
) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  await supabase
    .from('exercises')
    .update({
      muscle_groups: muscleGroups,
      equipment_tags: equipmentTags,
      type_tags: typeTags,
      other_tags: otherTags,
    })
    .eq('id', id)

  revalidatePath('/admin/videos')
}

const TAG_BUCKET_COLUMNS = {
  muscle: 'muscle_groups',
  equipment: 'equipment_tags',
  type: 'type_tags',
  other: 'other_tags',
} as const
export type TagBucket = keyof typeof TAG_BUCKET_COLUMNS

// Cleanup tool for near-duplicate tags that already made it into the
// catalog (e.g. "Dumbbell" and "Dumbbells" both existing) - rewrites
// every exercise carrying `fromTag` in the given bucket to carry
// `toTag` instead (deduping if the exercise already had both), then
// drops fromTag from that bucket's option list entirely since nothing
// references it anymore. Scoped to whichever single bucket the tag
// lives in - the same tag text could theoretically exist in two
// different buckets (e.g. "Cardio" as a type tag vs someone typing it
// into Other) and those are intentionally independent, not merged
// together.
export async function mergeTag(bucket: TagBucket, fromTag: string, toTag: string) {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const from = fromTag.trim()
  const to = toTag.trim()
  if (!from || !to || from === to) return

  const column = TAG_BUCKET_COLUMNS[bucket]
  const { data: rows } = await supabase
    .from('exercises')
    .select(`id, ${column}`)
    .contains(column, [from])

  for (const row of (rows || []) as unknown as ({ id: string } & Record<string, string[]>)[]) {
    const current = row[column] || []
    const next = Array.from(new Set(current.map((t) => (t === from ? to : t))))
    await supabase
      .from('exercises')
      .update({ [column]: next })
      .eq('id', row.id)
  }

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

export interface DayCopyCollision {
  week: number
  day: number
  label: string
}

// Shared core for copyProgramDay and duplicateProgramWeek below - both
// are really "clone one source day's full content (label, notes,
// exercises - everything) into some target (week, day) slots," they
// just differ in how the target list gets built. Never overwrites a
// target that already has content unless its "week-day" key is in
// overwriteKeys - anything else that collides comes back in
// `collisions` instead, for the caller to surface as a confirm prompt
// and re-call with those specific keys approved. Copying a source onto
// itself is silently skipped rather than erroring, since "repeat
// weekly starting from week 2" naturally includes week 2 itself in a
// simple target-range construction.
function applyDayCopies(
  days: WorkoutPlanDay[],
  source: WorkoutPlanDay,
  targets: Array<{ week: number; day: number }>,
  overwriteKeys: string[]
): { days: WorkoutPlanDay[]; created: number; overwritten: number; collisions: DayCopyCollision[] } {
  const overwriteSet = new Set(overwriteKeys)
  const collisions: DayCopyCollision[] = []
  let created = 0
  let overwritten = 0
  const nextDays = [...days]

  for (const t of targets) {
    if (t.week === source.week && t.day === source.day) continue
    const key = `${t.week}-${t.day}`
    const existingIdx = nextDays.findIndex((d) => d.week === t.week && d.day === t.day)
    const clone: WorkoutPlanDay = {
      week: t.week,
      day: t.day,
      label: source.label,
      notes: source.notes,
      exercises: source.exercises.map((e) => ({ ...e })),
    }
    if (existingIdx === -1) {
      nextDays.push(clone)
      created++
    } else if (overwriteSet.has(key)) {
      nextDays[existingIdx] = clone
      overwritten++
    } else {
      collisions.push({ week: t.week, day: t.day, label: nextDays[existingIdx].label })
    }
  }

  return { days: nextDays, created, overwritten, collisions }
}

// Backs both "Copy to..." (an arbitrary, hand-picked target list) and
// "Repeat weekly" (a same-day-of-week run across N future weeks) - the
// UI just builds a different `targets` array for each case and calls
// this one action. First call with overwriteKeys=[] to see what's
// free vs. colliding; if `collisions` comes back non-empty, show the
// admin exactly which slots already have content and, if they confirm,
// call again with those slots' keys in overwriteKeys.
export async function copyProgramDay(
  programId: string,
  sourceWeek: number,
  sourceDay: number,
  targets: Array<{ week: number; day: number }>,
  overwriteKeys: string[] = []
): Promise<
  | { ok: true; created: number; overwritten: number; collisions: DayCopyCollision[] }
  | { ok: false; error: string }
> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }
  if (targets.length === 0) return { ok: false, error: 'Pick at least one target.' }

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return { ok: false, error: 'Could not load this program - try again.' }

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  const source = plan.days.find((d) => d.week === sourceWeek && d.day === sourceDay)
  if (!source) return { ok: false, error: 'Could not find the day to copy from.' }

  const result = applyDayCopies(plan.days, source, targets, overwriteKeys)
  plan.days = result.days

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
  return { ok: true, created: result.created, overwritten: result.overwritten, collisions: result.collisions }
}

// Clones every day in sourceWeek into targetWeek, day-for-day (Day 1 ->
// Day 1, Day 2 -> Day 2, ...). Loops applyDayCopies once per source day
// (each has its own content to clone) rather than reusing
// copyProgramDay directly, so the whole week is read and written back
// in one round trip instead of one per day. Same confirm-then-retry
// collision flow as copyProgramDay - overwriteKeys here are also
// "week-day" keys, scoped to targetWeek.
export async function duplicateProgramWeek(
  programId: string,
  sourceWeek: number,
  targetWeek: number,
  overwriteKeys: string[] = []
): Promise<
  | { ok: true; created: number; overwritten: number; collisions: DayCopyCollision[] }
  | { ok: false; error: string }
> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }
  if (sourceWeek === targetWeek) return { ok: false, error: 'Pick a different week to duplicate into.' }
  if (targetWeek < 1) return { ok: false, error: 'Week must be 1 or higher.' }

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return { ok: false, error: 'Could not load this program - try again.' }

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  const sourceDays = plan.days.filter((d) => d.week === sourceWeek)
  if (sourceDays.length === 0) return { ok: false, error: `Week ${sourceWeek} has no days to duplicate.` }

  let workingDays = plan.days
  let created = 0
  let overwritten = 0
  const collisions: DayCopyCollision[] = []

  for (const sourceDay of sourceDays) {
    const target = { week: targetWeek, day: sourceDay.day }
    const key = `${target.week}-${target.day}`
    const r = applyDayCopies(workingDays, sourceDay, [target], overwriteKeys.includes(key) ? [key] : [])
    workingDays = r.days
    created += r.created
    overwritten += r.overwritten
    collisions.push(...r.collisions)
  }

  plan.days = workingDays

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
  return { ok: true, created, overwritten, collisions }
}

// Removes one day outright - the undo for a copy/repeat/duplicate that
// landed in the wrong slot, and previously missing entirely (a day
// could only ever be emptied out exercise-by-exercise, never actually
// removed). Doesn't touch any member's already-logged history for that
// (week, day) - workout_sessions/workout_logged_sets are separate
// tables keyed by generation/week/day, not derived from
// structured_plan, so past completions stay intact even after the
// template day they came from is gone.
export async function deleteProgramDay(
  programId: string,
  week: number,
  day: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return { ok: false, error: 'Could not load this program - try again.' }

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  if (!plan.days.some((d) => d.week === week && d.day === day)) {
    return { ok: false, error: 'That day no longer exists.' }
  }
  plan.days = plan.days.filter((d) => !(d.week === week && d.day === day))

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
  return { ok: true }
}

// --- Workout Templates - a reusable library of standalone days ---
// separate from any program (see migration-workout-templates.sql).
// Built with the same EditableBlock editor as a program day; content
// only ever moves between here and a program as a one-time copy in
// either direction, never a live link.

export async function createWorkoutTemplate(
  name: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Enter a name for this template.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('workout_templates')
    .insert({ name: trimmed, exercises: [], created_by: user?.id ?? null })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: 'Could not create the template - try again.' }

  revalidatePath('/admin/templates')
  return { ok: true, id: data.id }
}

// "Tier 2" editor for a template's content - same EditableBlock[] ->
// expandBlocksToExercises path DayEditor uses to save a program day,
// just writing to workout_templates.exercises instead of a specific
// (week, day) slot inside a program's structured_plan. name is edited
// alongside content here rather than as a separate rename action,
// since the template list's edit view always shows both together.
export async function updateWorkoutTemplate(
  templateId: string,
  name: string,
  blocks: EditableBlock[],
  notes: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: 'Enter a name for this template.' }

  const exercises = expandBlocksToExercises(blocks)

  const { error } = await supabase
    .from('workout_templates')
    .update({ name: trimmedName, exercises, notes, updated_at: new Date().toISOString() })
    .eq('id', templateId)

  if (error) return { ok: false, error: 'Could not save the template - try again.' }

  revalidatePath('/admin/templates')
  revalidatePath('/admin/programs')
  return { ok: true }
}

export async function deleteWorkoutTemplate(
  templateId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const { error } = await supabase.from('workout_templates').delete().eq('id', templateId)
  if (error) return { ok: false, error: 'Could not delete the template - try again.' }

  revalidatePath('/admin/templates')
  return { ok: true }
}

// The "From template..." half of Add Day - creates a new program day
// at (week, day) seeded with a copy of a template's current content.
// A one-time copy, same collision-safety as the plain addProgramDay:
// refuses to clobber a (week, day) that already has content. label is
// caller-supplied (pre-filled with the template's name client-side,
// but editable) rather than always reusing the template's name as-is,
// since a program's own day labels drive the same-label propagation
// system and the admin may want this occurrence called something else.
export async function addProgramDayFromTemplate(
  programId: string,
  week: number,
  day: number,
  templateId: string,
  label: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const trimmedLabel = label.trim()
  if (!trimmedLabel) return { ok: false, error: 'Enter a label for this day.' }
  if (week < 1 || day < 1) return { ok: false, error: 'Week and day must be 1 or higher.' }

  const [{ data: templateData, error: templateError }, { data: planData, error: planError }] = await Promise.all([
    supabase.from('workout_templates').select('exercises, notes').eq('id', templateId).single(),
    supabase.from('program_templates').select('structured_plan').eq('id', programId).single(),
  ])
  if (templateError || !templateData) return { ok: false, error: 'Could not find that template - try again.' }
  if (planError || !planData?.structured_plan) return { ok: false, error: 'Could not load this program - try again.' }

  const plan = planData.structured_plan as { days: WorkoutPlanDay[] }
  if (plan.days.some((d) => d.week === week && d.day === day)) {
    return { ok: false, error: `Week ${week}, Day ${day} already has content - pick a different week/day, or edit that existing day instead.` }
  }

  plan.days = [
    ...plan.days,
    {
      week,
      day,
      label: trimmedLabel,
      notes: templateData.notes ?? undefined,
      exercises: (templateData.exercises as WorkoutExercise[]).map((e) => ({ ...e })),
    },
  ]

  await supabase.from('program_templates').update({ structured_plan: plan }).eq('id', programId)

  revalidatePath('/admin/programs')
  revalidatePath('/workouts')
  return { ok: true }
}

// The other direction - promotes one program day's current content
// into a brand-new template, so a workout that's already been built
// out at the program level doesn't have to be retyped from scratch in
// the library. Always creates a new template row (never overwrites an
// existing one), same one-time-copy philosophy as
// addProgramDayFromTemplate.
export async function saveProgramDayAsTemplate(
  programId: string,
  week: number,
  day: number,
  templateName: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { supabase, isAdmin } = await requireAdmin()
  if (!isAdmin) return { ok: false, error: 'Not authorized.' }

  const trimmedName = templateName.trim()
  if (!trimmedName) return { ok: false, error: 'Enter a name for this template.' }

  const { data, error } = await supabase
    .from('program_templates')
    .select('structured_plan')
    .eq('id', programId)
    .single()
  if (error || !data?.structured_plan) return { ok: false, error: 'Could not load this program - try again.' }

  const plan = data.structured_plan as { days: WorkoutPlanDay[] }
  const source = plan.days.find((d) => d.week === week && d.day === day)
  if (!source) return { ok: false, error: 'Could not find that day - try again.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: inserted, error: insertError } = await supabase
    .from('workout_templates')
    .insert({
      name: trimmedName,
      notes: source.notes ?? null,
      exercises: source.exercises.map((e) => ({ ...e })),
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (insertError || !inserted) return { ok: false, error: 'Could not save the template - try again.' }

  revalidatePath('/admin/templates')
  return { ok: true, id: inserted.id }
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
export async function getMemberWorkoutHistory(
  memberId: string
): Promise<{
  history: WorkoutHistoryGroup[]
  weightUnit: 'kg' | 'lbs'
  logAsDurationByExercise: Record<string, boolean>
}> {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return { history: [], weightUnit: 'kg', logAsDurationByExercise: {} }

  const admin = createAdminClient()

  const activePlan = await getActiveWorkoutPlan(memberId)

  // The member's own preference, not the admin's - a coach viewing a
  // client's log should see the same units that client sees in their
  // own app, regardless of what unit the admin's own profile is set to.
  const { data: memberProfile } = await admin
    .from('profiles')
    .select('weight_unit')
    .eq('id', memberId)
    .single()
  const weightUnit: 'kg' | 'lbs' = memberProfile?.weight_unit === 'lbs' ? 'lbs' : 'kg'

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

  const history = Array.from(groupsByGeneration.values()).sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return (b.sessions[0]?.completedAt || '').localeCompare(a.sessions[0]?.completedAt || '')
  })

  const logAsDurationByExercise = buildLogAsDurationLookup(activePlan?.days ?? [])

  return { history, weightUnit, logAsDurationByExercise }
}

// Coach-visible body-weight trend for one member - same
// admin-can-read-any-profile pattern as getMemberWorkoutHistory above,
// including using the member's own weight_unit rather than the admin's.
export async function getMemberBodyWeightHistory(
  memberId: string
): Promise<{ entries: BodyWeightEntry[]; weightUnit: 'kg' | 'lbs' }> {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return { entries: [], weightUnit: 'kg' }

  const admin = createAdminClient()

  const { data: memberProfile } = await admin
    .from('profiles')
    .select('weight_unit')
    .eq('id', memberId)
    .single()
  const weightUnit: 'kg' | 'lbs' = memberProfile?.weight_unit === 'lbs' ? 'lbs' : 'kg'

  const { data: rows } = await admin
    .from('body_weight_logs')
    .select('id, weight_kg, logged_date')
    .eq('profile_id', memberId)
    .order('logged_date', { ascending: true })

  const entries: BodyWeightEntry[] = (rows || []).map((r) => ({
    id: r.id,
    loggedDate: r.logged_date,
    weightKg: r.weight_kg,
  }))

  return { entries, weightUnit }
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

// Saves one section of the editable /beta landing page copy - see
// betaPageContent.ts for the full section list and project_beta_launch_plan
// memory for why this exists (Satish wants to edit the page's wording
// himself, no code change per tweak). One section per call rather than
// a single "save everything" action so a mistake in one field's editor
// state can't blow away edits already saved in another field.
export async function updateBetaPageContent(key: string, content: string) {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return

  const admin = createAdminClient()
  await admin
    .from('beta_page_content')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('key', key)

  revalidatePath('/admin/beta-page')
  revalidatePath('/beta')
}
