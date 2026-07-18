import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProgramsPageClient from '@/components/ProgramsPageClient'
import type { WorkoutPlanDay } from '@/types'

// See admin/page.tsx for why pages that read admin-conditional data
// are forced dynamic.
export const dynamic = 'force-dynamic'

export default async function ProgramsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes, templatesRes, enrollmentRes] = await Promise.all([
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
    supabase
      .from('space_memberships')
      .select('space')
      .eq('profile_id', user.id)
      .eq('space', 'low_ticket')
      .maybeSingle(),
    // structured_plan is now selected here too (was just name/level/
    // equipment/duration/description before) - the read-only preview
    // modal (ProgramPreviewModal) needs the full weeks/days/exercises
    // content, and fetching it upfront for this small, curated list is
    // simpler than a second round-trip per card when someone taps "See
    // what's inside." is_start_here drives the "Start here" badge (see
    // migration add_is_start_here_to_program_templates).
    supabase
      .from('program_templates')
      .select('id, name, level, equipment_tier, duration_weeks, description, structured_plan, is_start_here')
      .eq('is_published', true)
      .order('created_at'),
    // Only need the id (doubles as the "generationId" workout_sessions
    // are logged against, same convention as getActiveWorkoutPlan) and
    // which template it points at - the template's own name/level/etc
    // and progress are resolved separately below, not filtered to
    // is_published so a current program still shows correctly even if
    // an admin unpublished it after this member enrolled.
    supabase
      .from('program_enrollments')
      .select('id, program_template_id')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const isAdmin = !!profileRes.data?.is_admin
  const hasLowTicket = !!membershipRes.data

  // Same access gate as /workouts itself - no point offering a program
  // picker to someone who wouldn't be able to log against it anyway.
  if (!isAdmin && !hasLowTicket) {
    redirect('/join')
  }

  const templateRows = templatesRes.data || []
  const templates = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    level: t.level,
    equipmentTier: t.equipment_tier,
    durationWeeks: t.duration_weeks,
    description: t.description,
    isStartHere: t.is_start_here,
    days: ((t.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days || []) as WorkoutPlanDay[],
  }))

  // Current program's own details + progress, resolved independently
  // of the published-templates list above (see the enrollmentRes query
  // comment) - doneCells/totalCells mirror the exact same completed-
  // cells logic workouts/page.tsx uses for its own overview, just
  // scoped to this one query instead of computed client-side.
  let currentProgram: {
    templateId: string
    name: string
    level: string
    equipmentTier: string
    durationWeeks: number
    doneCells: number
    totalCells: number
  } | null = null

  if (enrollmentRes.data) {
    const enrollment = enrollmentRes.data
    const { data: template } = await supabase
      .from('program_templates')
      .select('name, level, equipment_tier, duration_weeks, structured_plan')
      .eq('id', enrollment.program_template_id)
      .maybeSingle()

    if (template) {
      const days = ((template.structured_plan as { days?: WorkoutPlanDay[] } | null)?.days || []) as WorkoutPlanDay[]
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('week_number, day_number')
        .eq('profile_id', user.id)
        .eq('generation_id', enrollment.id)
        .not('completed_at', 'is', null)

      const doneCells = new Set((sessions || []).map((s) => `${s.week_number}-${s.day_number}`)).size

      currentProgram = {
        templateId: enrollment.program_template_id,
        name: template.name,
        level: template.level,
        equipmentTier: template.equipment_tier,
        durationWeeks: template.duration_weeks,
        doneCells,
        totalCells: days.length,
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>
      <h1 className="text-white text-xl font-bold mb-1">Choose Your Program</h1>
      {/* The old "You're currently on X. Pick a different one below to
          switch" branch lived here - that messaging (plus a shortcut
          back into it and switch guardrails) now lives in the current-
          program card ProgramsPageClient renders below, so this
          description is the same either way now. */}
      <p className="text-zinc-400 text-sm mb-6">
        Pick the program that matches what you have access to - you can swap individual exercises once you get
        started if something doesn’t fit.
      </p>

      {templates.length === 0 ? (
        <p className="text-center text-sm text-zinc-500 py-12">
          No programs published yet - check back soon.
        </p>
      ) : (
        <ProgramsPageClient templates={templates} currentProgram={currentProgram} />
      )}
    </div>
  )
}
