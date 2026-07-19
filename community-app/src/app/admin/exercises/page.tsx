import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminExercisesList from '@/components/AdminExercisesList'
import type { ExerciseCatalogEntry } from '@/types'

// See admin/page.tsx for why this is forced dynamic.
export const dynamic = 'force-dynamic'

export default async function AdminExercisesPage() {
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

  const [{ data: exercisesData }, { data: videoTypesData }] = await Promise.all([
    supabase.from('exercises').select('id, name, muscle_groups, category_tags').order('name'),
    // Just exercise_id + video_type, not the full video row - only used
    // to show a "has tutorial / has demo" indicator per exercise below,
    // so no need to pull url/notes/etc. through this query.
    supabase.from('exercise_videos').select('exercise_id, video_type').not('exercise_id', 'is', null),
  ])

  const exercises: ExerciseCatalogEntry[] = (exercisesData || []).map((e) => ({
    id: e.id,
    name: e.name,
    muscleGroups: e.muscle_groups || [],
    categoryTags: e.category_tags || [],
  }))

  const hasTutorial = new Set<string>()
  const hasDemo = new Set<string>()
  for (const v of videoTypesData || []) {
    if (!v.exercise_id) continue
    if (v.video_type === 'demo') hasDemo.add(v.exercise_id)
    else hasTutorial.add(v.exercise_id)
  }

  // Every distinct category tag already in use, across every exercise -
  // backs the tag picker's "existing tags" list so tags stay consistent
  // instead of every exercise inventing its own wording.
  const allTags = Array.from(new Set(exercises.flatMap((e) => e.categoryTags))).sort((a, b) =>
    a.localeCompare(b)
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
        <h1 className="text-xl font-bold text-white">Exercises</h1>
        <p className="text-sm text-zinc-500 mt-1">
          The canonical exercise list - muscle groups and category tags live here. Program
          content still uses exercise names directly; this is matched to those names, not a
          replacement for them.
        </p>
      </div>

      <AdminExercisesList
        exercises={exercises}
        allTags={allTags}
        hasTutorialIds={Array.from(hasTutorial)}
        hasDemoIds={Array.from(hasDemo)}
      />
    </div>
  )
}
