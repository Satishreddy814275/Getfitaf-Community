import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkoutPlanDay } from '@/types'

export interface ActiveWorkoutPlan {
  generationId: string
  days: WorkoutPlanDay[]
}

// Finds the plan a member should be logging against: their most
// recent program_enrollments row, then that enrollment's template's
// structured_plan. Returns null if they haven't picked a program yet.
//
// Replaces the old email -> workout_intakes -> workout_generations
// lookup (AI builder era) now that community members pick from a
// curated program_templates library instead - see
// migration-program-templates.sql. The AI builder's own tables are
// untouched; this only changes what community-app logging resolves
// against. Kept on the admin/service-role client for the same reason
// as before: this is called for both "my own plan" and "an admin
// looking at another member's plan" (see admin/actions.ts), and
// program_enrollments/program_templates RLS already allows both cases
// individually, but going through one client keeps this function's
// behavior identical regardless of caller context.
export async function getActiveWorkoutPlan(profileId: string): Promise<ActiveWorkoutPlan | null> {
  if (!profileId) return null

  const admin = createAdminClient()

  const { data: enrollment } = await admin
    .from('program_enrollments')
    .select('id, program_template_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!enrollment) return null

  const { data: template } = await admin
    .from('program_templates')
    .select('structured_plan')
    .eq('id', enrollment.program_template_id)
    .maybeSingle()

  const days = (template?.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days
  if (!Array.isArray(days) || days.length === 0) return null

  return { generationId: enrollment.id, days }
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
