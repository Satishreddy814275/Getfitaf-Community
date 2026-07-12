import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkoutPlanDay } from '@/types'

export interface ActiveWorkoutPlan {
  generationId: string
  days: WorkoutPlanDay[]
}

// Finds the plan a member should be logging against: their most
// recent workout_intakes row (by email), then the most recent
// generation on that intake that actually has structured_plan data
// (only ever set for verified/community visits - see
// Getfitaf-workout-builder-main/api/generate.js). Returns null if
// they've never built a plan while logged in, or only have older
// plans built before this feature existed (those only have markdown,
// no structured_plan to log against).
//
// Goes through the admin/service-role client because workout_intakes
// and workout_generations have zero RLS policies - the workout
// builder itself has no login of its own, so only service-role can
// read these tables at all (see migration-workout-builder.sql).
export async function getActiveWorkoutPlan(email: string): Promise<ActiveWorkoutPlan | null> {
  const trimmed = email.trim()
  if (!trimmed) return null

  const admin = createAdminClient()

  const { data: intake } = await admin
    .from('workout_intakes')
    .select('id')
    .ilike('email', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!intake) return null

  const { data: generation } = await admin
    .from('workout_generations')
    .select('id, structured_plan')
    .eq('intake_id', intake.id)
    .not('structured_plan', 'is', null)
    .order('generation_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!generation?.structured_plan) return null

  const days = (generation.structured_plan as { days?: WorkoutPlanDay[] })?.days
  if (!Array.isArray(days) || days.length === 0) return null

  return { generationId: generation.id, days }
}

// Regenerating a plan (the free-text-feedback tweak, up to 3x per
// intake) creates a new generation row, but it's still fundamentally
// the same program - same days-per-week, same overall structure. So
// when figuring out "how many times has this member done Day 1
// before" for the multi-week auto-numbering, sessions logged against
// an earlier regeneration of the same intake should still count,
// rather than resetting to zero every time someone tweaks their plan.
// Only starting a genuinely new plan (a new intake) is a real reset.
// Falls back to just the one generation id if the lookup fails for
// any reason - worst case, week numbering under-counts slightly
// rather than breaking.
export async function getSiblingGenerationIds(generationId: string): Promise<string[]> {
  const admin = createAdminClient()

  const { data: generation } = await admin
    .from('workout_generations')
    .select('intake_id')
    .eq('id', generationId)
    .maybeSingle()

  if (!generation?.intake_id) return [generationId]

  const { data: siblings } = await admin
    .from('workout_generations')
    .select('id')
    .eq('intake_id', generation.intake_id)

  return siblings && siblings.length > 0 ? siblings.map((s) => s.id) : [generationId]
}

// Parses a target-sets string like "3", "3-5", or "2-3 sets" down to a
// single number of input rows to render when someone starts logging
// this exercise - not exact (a range collapses to its lower bound),
// but it's just a starting point; the UI lets them add/remove rows
// freely, so this only needs to be a reasonable default.
export function parseTargetSetCount(setsText: string): number {
  const match = setsText.match(/\d+/)
  const parsed = match ? parseInt(match[0], 10) : NaN
  if (!Number.isFinite(parsed) || parsed < 1) return 3
  return Math.min(parsed, 10)
}
