import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkoutPlanDay } from '@/types'

// The three published equipment-tier templates /beta previews - hardcoded
// IDs rather than a query filtered by equipment_tier, since several
// unpublished/duplicate templates share tier values (see
// program_templates: "At Home: Full Body + Cardio" and "At Home: Bands
// + Cardio" both exist unpublished) and picking the wrong one silently
// would be worse than this being explicit. Confirmed against the live
// DB on 2026-07-21 - if these programs get renamed/replaced, update the
// IDs here.
const TIER_TEMPLATE_IDS = {
  noEquipment: '67230fac-1939-4ad4-b99a-374ce79ee933', // Bodyweight At Home: Upper/Lower + Cardio
  bandsAndDumbbells: '6c2ce03a-066f-4dcc-83fd-ccd1a775844d', // At Home: Upper/Lower + Cardio
  fullGym: '93fcb4a3-9914-4747-860b-8834c9ef1e1c', // At Gym: Upper Body/Lower + Cardio
} as const

export type TierPreview = {
  templateName: string
  dayLabel: string
  exercises: WorkoutPlanDay['exercises']
} | null

async function fetchWeek1Day1(templateId: string): Promise<TierPreview> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('program_templates')
    .select('name, structured_plan')
    .eq('id', templateId)
    .maybeSingle()

  if (!data) return null

  const days = ((data.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days || []) as WorkoutPlanDay[]
  const day1 = days.find((d) => d.week === 1 && d.day === 1)
  if (!day1 || !day1.exercises || day1.exercises.length === 0) return null

  return {
    templateName: data.name,
    dayLabel: day1.label,
    exercises: day1.exercises,
  }
}

// Real Week 1 / Day 1 content for each tier, fetched fresh per request -
// this is what makes the /beta previews "live" rather than screenshots:
// if Satish edits these programs later, the landing page reflects it
// automatically on the next request, no redeploy needed.
export async function getBetaTierPreviews() {
  const [noEquipment, bandsAndDumbbells, fullGym] = await Promise.all([
    fetchWeek1Day1(TIER_TEMPLATE_IDS.noEquipment),
    fetchWeek1Day1(TIER_TEMPLATE_IDS.bandsAndDumbbells),
    fetchWeek1Day1(TIER_TEMPLATE_IDS.fullGym),
  ])
  return { noEquipment, bandsAndDumbbells, fullGym }
}
