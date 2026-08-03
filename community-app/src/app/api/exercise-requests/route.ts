import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_NAME_LENGTH = 80

// POST-only capture for the "Can't find the video? Request it" section
// on /exercises (Satish 2026-08-03) - dual purpose: a small way for
// visitors to interact with the library, and a real-demand signal for
// what to shoot next. Uses the service-role admin client deliberately -
// exercise_video_requests has no anon/authenticated write policy (see
// the create_exercise_video_requests migration), so a visitor can't
// directly inflate request_count via the client and defeat the point
// of it being a real signal.
//
// Every submission - whether it's someone's first ask for an exercise
// or their tenth click on an existing top-5 entry - is treated as a
// "vote": find the matching row and increment request_count, or create
// one at count 1 if this is the first time anyone's asked. No per-
// visitor identity/auth needed for this to work.
export async function POST(req: Request) {
  let exerciseId: unknown
  let exerciseName: unknown
  try {
    const body = await req.json()
    exerciseId = body?.exerciseId ?? null
    exerciseName = body?.exerciseName
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (exerciseId !== null && typeof exerciseId !== 'string') {
    return Response.json({ error: 'Invalid exercise id' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (exerciseId) {
    // Catalog-matched request - look up the real exercise row rather
    // than trusting a client-supplied name for it (cheap defense in
    // depth; the id alone is enough to act on).
    const { data: exercise, error: exerciseError } = await supabase
      .from('exercises')
      .select('id, name')
      .eq('id', exerciseId)
      .maybeSingle()

    if (exerciseError || !exercise) {
      return Response.json({ error: "Couldn't find that exercise" }, { status: 400 })
    }

    const { data: existing, error: findError } = await supabase
      .from('exercise_video_requests')
      .select('id, request_count')
      .eq('exercise_id', exercise.id)
      .maybeSingle()

    if (findError) {
      console.error('exercise-requests: lookup failed:', findError.message)
      return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }

    const newCount = (existing?.request_count ?? 0) + 1
    const { error: writeError } = existing
      ? await supabase
          .from('exercise_video_requests')
          .update({ request_count: newCount, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      : await supabase
          .from('exercise_video_requests')
          .insert({ exercise_id: exercise.id, exercise_name: exercise.name, request_count: 1 })

    if (writeError) {
      console.error('exercise-requests: write failed:', writeError.message)
      return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
    }

    return Response.json({ ok: true, exerciseName: exercise.name, requestCount: newCount })
  }

  // Freeform request - not in the catalog at all. Matched case-
  // insensitively on trimmed name so "Arnold press" and "arnold Press"
  // stack onto the same row instead of splitting the count.
  if (typeof exerciseName !== 'string' || !exerciseName.trim()) {
    return Response.json({ error: 'Enter an exercise name' }, { status: 400 })
  }
  const trimmedName = exerciseName.trim().slice(0, MAX_NAME_LENGTH)

  const { data: existing, error: findError } = await supabase
    .from('exercise_video_requests')
    .select('id, request_count')
    .is('exercise_id', null)
    .ilike('exercise_name', trimmedName)
    .maybeSingle()

  if (findError) {
    console.error('exercise-requests: freeform lookup failed:', findError.message)
    return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }

  const newCount = (existing?.request_count ?? 0) + 1
  const { error: writeError } = existing
    ? await supabase
        .from('exercise_video_requests')
        .update({ request_count: newCount, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    : await supabase
        .from('exercise_video_requests')
        .insert({ exercise_id: null, exercise_name: trimmedName, request_count: 1 })

  if (writeError) {
    console.error('exercise-requests: freeform write failed:', writeError.message)
    return Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }

  return Response.json({ ok: true, exerciseName: trimmedName, requestCount: newCount })
}
