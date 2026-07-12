import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getActiveWorkoutPlan, getSiblingGenerationIds } from '@/lib/workoutPlan'
import { createWorkoutBuilderHandoffUrl } from '@/lib/workoutBuilderHandoff'
import ExternalNavLink from '@/components/ExternalNavLink'
import WorkoutDayPicker from '@/components/WorkoutDayPicker'
import type { LastLoggedSet } from '@/types'

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

  // How many times this member has completed each day, aggregated
  // across any regeneration of this same program (not just this exact
  // generation - see getSiblingGenerationIds), since that's the same
  // count logWorkoutSession uses to auto-number the next session's
  // week. Flexible rotation, not calendar-locked - they can do these
  // in any order, any pace, and repeat a day for its next "week"
  // whenever they get to it.
  const siblingGenerationIds = await getSiblingGenerationIds(plan.generationId)
  const { data: sessionsData } = await supabase
    .from('workout_sessions')
    .select('day_number')
    .eq('profile_id', user.id)
    .in('generation_id', siblingGenerationIds)
    .not('completed_at', 'is', null)

  const sessionCountByDay: Record<number, number> = {}
  for (const row of sessionsData || []) {
    sessionCountByDay[row.day_number] = (sessionCountByDay[row.day_number] || 0) + 1
  }

  // Most recent logged set per exercise, across all past sessions -
  // shown as a "last time" reference while logging a new one.
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

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4 sm:px-6">
      <h1 className="text-white text-xl font-bold mb-1">Your Workouts</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Pick a day, log what you did. No calendar to keep up with - go at your own pace.
      </p>
      <WorkoutDayPicker
        generationId={plan.generationId}
        days={plan.days}
        sessionCountByDay={sessionCountByDay}
        lastByExercise={lastByExercise}
      />
    </div>
  )
}
