import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToProfile } from '@/lib/push'

export const runtime = 'nodejs'

// Two reminder-style push triggers, both aimed at retention rather than
// social activity (see the in-app notification bell for that) - "today's
// lesson is ready" and "haven't logged a workout in a few days." Runs
// once daily via Vercel Cron (see vercel.json), same
// Authorization-header check as expire-trials.
//
// Scoped to low-ticket members only, not admins or approved/premium
// members: low-ticket is the only tier that (a) uses this app's
// day-drip lesson system at all (approved/premium members see every
// lesson immediately, there's no single "today's lesson" for them) and
// (b) uses this app's Workouts feature (premium members' training is
// still delivered via Trainerize, not this app - see showWorkouts in
// AppNav.tsx).
const INACTIVITY_DAYS = 3

function unlockedDayFor(joinedAt: string, totalLessons: number): number {
  // Same calendar-day math as learn-portal's dashboard.html
  // (unlockedDay), just running on the server instead of in a member's
  // browser - deliberately UTC calendar days rather than true per-member
  // local time, since a once-a-day cron doesn't need per-user precision
  // and GetFit AF's membership is India-based enough that UTC-vs-IST
  // midnight drift isn't worth the complexity of storing a timezone
  // per member for this.
  const joined = new Date(joinedAt)
  const joinedMidnight = Date.UTC(joined.getUTCFullYear(), joined.getUTCMonth(), joined.getUTCDate())
  const now = new Date()
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysSince = Math.floor((nowMidnight - joinedMidnight) / 86400000)
  return Math.min(Math.max(1, daysSince + 1), Math.max(totalLessons, 1))
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabase = createAdminClient()
  let lessonPushes = 0
  let workoutPushes = 0

  // Only bother with any of this for members who actually have a
  // subscription on file - the queries below are naturally scoped to
  // that set rather than every low-ticket member.
  const { data: subscribedProfiles } = await supabase.from('push_subscriptions').select('profile_id')
  const subscribedIds = Array.from(new Set((subscribedProfiles || []).map((s) => s.profile_id)))
  if (subscribedIds.length === 0) {
    return new Response('No push subscriptions on file', { status: 200 })
  }

  const { data: lowTicketMembers } = await supabase
    .from('space_memberships')
    .select('profile_id, created_at')
    .eq('space', 'low_ticket')
    .in('profile_id', subscribedIds)

  if (lowTicketMembers && lowTicketMembers.length > 0) {
    const { data: publishedLessons } = await supabase
      .from('lessons')
      .select('id, order, title')
      .eq('is_published', true)
      .order('order')

    const lessons = publishedLessons || []

    if (lessons.length > 0) {
      const memberIds = lowTicketMembers.map((m) => m.profile_id)
      const { data: progressRows } = await supabase
        .from('user_progress')
        .select('user_id, lesson_id, completed')
        .in('user_id', memberIds)
        .eq('completed', true)

      const completedByProfile = new Map<string, Set<string>>()
      for (const row of progressRows || []) {
        if (!completedByProfile.has(row.user_id)) completedByProfile.set(row.user_id, new Set())
        completedByProfile.get(row.user_id)!.add(row.lesson_id)
      }

      await Promise.all(
        lowTicketMembers.map(async (member) => {
          const day = unlockedDayFor(member.created_at, lessons.length)
          const todaysLesson = lessons.find((l) => l.order === day)
          if (!todaysLesson) return

          const alreadyDone = completedByProfile.get(member.profile_id)?.has(todaysLesson.id)
          if (alreadyDone) return

          await sendPushToProfile(member.profile_id, {
            title: "Today's lesson is ready",
            body: todaysLesson.title,
            url: 'https://learn.getfitaf.fitness/dashboard.html',
          })
          lessonPushes++
        })
      )
    }

    // Inactivity nudge - most recent logged set per low-ticket member,
    // vs. a flat "no logs at all yet" case (someone who joined but never
    // started) treated the same as inactive rather than skipped.
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 86400000).toISOString()
    const memberIds = lowTicketMembers.map((m) => m.profile_id)
    const { data: recentSets } = await supabase
      .from('workout_logged_sets')
      .select('profile_id, logged_at')
      .in('profile_id', memberIds)
      .order('logged_at', { ascending: false })

    const lastLoggedByProfile = new Map<string, string>()
    for (const row of recentSets || []) {
      if (!lastLoggedByProfile.has(row.profile_id)) lastLoggedByProfile.set(row.profile_id, row.logged_at)
    }

    await Promise.all(
      lowTicketMembers.map(async (member) => {
        // Don't nudge someone who joined within the inactivity window
        // itself - they haven't had 3 days to be "inactive" in yet.
        const joinedRecently = new Date(member.created_at).getTime() > Date.now() - INACTIVITY_DAYS * 86400000
        if (joinedRecently) return

        const lastLogged = lastLoggedByProfile.get(member.profile_id)
        const isInactive = !lastLogged || lastLogged < cutoff
        if (!isInactive) return

        await sendPushToProfile(member.profile_id, {
          title: "It's been a few days",
          body: "Your workout is waiting whenever you're ready to get back to it.",
          url: '/workouts',
        })
        workoutPushes++
      })
    )
  }

  const summary = `Sent ${lessonPushes} lesson-ready push(es), ${workoutPushes} inactivity-nudge push(es)`
  console.log(`push-reminders: ${summary}`)
  return new Response(summary, { status: 200 })
}
