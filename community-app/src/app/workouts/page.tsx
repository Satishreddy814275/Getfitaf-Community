import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getActiveWorkoutPlan } from '@/lib/workoutPlan'
import { createWorkoutBuilderHandoffUrl } from '@/lib/workoutBuilderHandoff'
import ExternalNavLink from '@/components/ExternalNavLink'
import WorkoutsTabs from '@/components/WorkoutsTabs'
import type { LastLoggedSet, WorkoutHistoryGroup, WorkoutHistorySet } from '@/types'

export default async function WorkoutsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('profiles').select('is_admin, approved').eq('id', user.id).single(),
    supabase
      .from('space_memberships')
      .select('space')
      .eq('profile_id', user.id)
      .eq('space', 'low_ticket')
      .maybeSingle(),
  ])

  const isAdmin = !!profileRes.data?.is_admin
  const hasLowTicket = !!membershipRes.data

  if (!isAdmin && !hasLowTicket) {
    redirect('/join')
  }

  const plan = user.email ? await getActiveWorkoutPlan(user.email) : null

  // No plan built yet (or their only plans predate this feature, so
  // they have no structured_plan to log against) - point them at the
  // builder instead of showing an empty page. Same handoff mechanism
  // as the feed's card/popup.
  if (!plan) {
    const workoutBuilderUrl = user.email ? createWorkoutBuilderHandoffUrl(user.email) : null
    return (
      <div className="max-w-xl mx-auto w-full py-16 px-4 text-center">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-8"
        >
          ← Back to Community
        </Link>
        <p className="text-white text-lg font-bold mb-2">No workout to log yet</p>
        <p className="text-zinc-400 text-sm mb-6">
          Build your workout first, then come back here to log your sessions.
        </p>
        {workoutBuilderUrl && (
          <ExternalNavLink
            href={workoutBuilderUrl}
            className="inline-block bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-5 py-3 rounded-xl transition"
            loadingLabel="Taking you to the workout builder..."
          >
            Build My Workout
          </ExternalNavLink>
        )}
      </div>
    )
  }

  // Scoped to ONLY the current generation, not aggregated across past
  // regenerations - a regenerated plan can have different exercises
  // than before, so carrying over old completions here would mark
  // cells "Done" for exercises that were never actually done. Each
  // regenerate starts this grid fresh on purpose; everything from
  // before lives in the Completed Workouts tab below instead, so
  // nothing's ever actually lost, just correctly separated.
  const { data: currentSessionsData } = await supabase
    .from('workout_sessions')
    .select('week_number, day_number')
    .eq('profile_id', user.id)
    .eq('generation_id', plan.generationId)
    .not('completed_at', 'is', null)

  const completedCells = Array.from(
    new Set((currentSessionsData || []).map((s) => `${s.week_number}-${s.day_number}`))
  )

  // Most recent logged set per exercise, across all past sessions
  // (every generation, not just the current one) - shown as a "last
  // time" reference while logging a new one. Deliberately not scoped
  // like completedCells above: knowing your last Bench Press numbers
  // is still useful even if they came from an older plan.
  const { data: loggedSetsData } = await supabase
    .from('workout_logged_sets')
    .select('exercise_name, weight, reps, logged_at')
    .eq('profile_id', user.id)
    .order('logged_at', { ascending: false })

  const lastByExercise: Record<string, LastLoggedSet> = {}
  for (const row of loggedSetsData || []) {
    if (!lastByExercise[row.exercise_name]) {
      lastByExercise[row.exercise_name] = {
        exerciseName: row.exercise_name,
        weight: row.weight,
        reps: row.reps,
        loggedAt: row.logged_at,
      }
    }
  }

  // Full history - every completed session ever, across every
  // generation, grouped by which generation ("plan") it belonged to.
  // This is what the Completed Workouts tab shows, so regenerating
  // never loses anything, it just relocates here.
  const { data: allSessions } = await supabase
    .from('workout_sessions')
    .select('id, generation_id, week_number, day_number, day_label, completed_at')
    .eq('profile_id', user.id)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })

  const sessionIds = (allSessions || []).map((s) => s.id)
  const { data: allSetsData } =
    sessionIds.length > 0
      ? await supabase
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
      isCurrent: s.generation_id === plan.generationId,
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

  // Current plan's group first (if it has any history yet), then the
  // rest newest-first by their most recent session.
  const history = Array.from(groupsByGeneration.values()).sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return (b.sessions[0]?.completedAt || '').localeCompare(a.sessions[0]?.completedAt || '')
  })

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4 sm:px-6">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition mb-4"
      >
        ← Back to Community
      </Link>
      <h1 className="text-white text-xl font-bold mb-1">Your Workouts</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Your 4-week program. Same split each week - tap whatever's next, or pick any session
        out of order if you'd rather.
      </p>
      <WorkoutsTabs
        generationId={plan.generationId}
        days={plan.days}
        completedCells={completedCells}
        lastByExercise={lastByExercise}
        history={history}
      />
    </div>
  )
}
