import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminProgramsList from '@/components/AdminProgramsList'
import { buildExercisePool } from '@/lib/exercisePool'

// See admin/page.tsx for why this is forced dynamic.
export const dynamic = 'force-dynamic'

export default async function AdminProgramsPage() {
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

  // Every program regardless of published state - admins see drafts
  // too (see program_templates_select policy), same as the member
  // picker only ever seeing is_published = true rows.
  const { data: templatesData } = await supabase
    .from('program_templates')
    .select('id, name, level, equipment_tier, duration_weeks, description, is_published, structured_plan')
    .order('created_at')

  const programs = templatesData || []

  // Backs the day editor's "Add exercise" / swap-exercise picker -
  // every distinct exercise name already used across ANY program (not
  // just the one being edited) plus the video library, so admins pick
  // from what already exists instead of retyping a name that's one
  // typo away from silently becoming a duplicate. See exercisePool.ts.
  const { data: videosData } = await supabase
    .from('exercise_videos')
    .select('id, exercise_name, video_url')

  const exercisePool = buildExercisePool(
    programs.map((p) => p.structured_plan?.days ?? []),
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
        <h1 className="text-xl font-bold text-white">Programs</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Edit a program&apos;s title, level, equipment tier, duration, description, and published
          status directly - no SQL needed. Use &quot;View workouts&quot; on a program to check its
          actual day-by-day exercises before publishing. The workout content itself is still
          authored through Claude, since that&apos;s the more complex piece.
        </p>
      </div>

      <AdminProgramsList programs={programs} exercisePool={exercisePool} />
    </div>
  )
}
