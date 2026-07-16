import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminTemplatesList from '@/components/AdminTemplatesList'
import { buildExercisePool } from '@/lib/exercisePool'
import type { WorkoutTemplate } from '@/types'

// See admin/page.tsx for why this is forced dynamic.
export const dynamic = 'force-dynamic'

export default async function AdminTemplatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/feed')

  // templatesData is independent of programsData/videosData below, so
  // all three are batched into one Promise.all rather than
  // templatesData running as its own separate round-trip first.
  const [{ data: templatesData }, { data: programsData }, { data: videosData }] = await Promise.all([
    supabase.from('workout_templates').select('id, name, notes, exercises, created_at').order('name'),
    // Same pool-building inputs as /admin/programs, so the "Add exercise"
    // picker inside a template offers the exact same canonical list -
    // every exercise already used anywhere, not a second, narrower list
    // scoped to just templates.
    supabase.from('program_templates').select('structured_plan'),
    supabase.from('exercise_videos').select('id, exercise_name, video_url'),
  ])

  const templates: WorkoutTemplate[] = (templatesData || []).map((t) => ({
    id: t.id,
    name: t.name,
    notes: t.notes,
    exercises: t.exercises || [],
    createdAt: t.created_at,
  }))

  const exercisePool = buildExercisePool(
    (programsData || []).map((p) => p.structured_plan?.days ?? []),
    videosData || []
  )

  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Moderation
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Workout Library</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Reusable standalone workouts - build one here, or save one straight from a program you&apos;re
          already building. Any program&apos;s &quot;+ Add day&quot; can pull a copy from this library instead
          of starting blank. Copies are always independent - editing a template later never changes a
          program that already used it, and editing a program day never changes the template it came from.
        </p>
      </div>

      <AdminTemplatesList templates={templates} exercisePool={exercisePool} />
    </div>
  )
}
