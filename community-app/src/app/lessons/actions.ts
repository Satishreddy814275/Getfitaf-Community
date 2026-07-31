'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Mirrors the old learn.getfitaf.fitness complete-lesson.js flow:
// upsert onto (user_id, lesson_id) so re-completing an already-done
// lesson is a no-op rather than an error, then report back whether a
// "share a takeaway" post already exists for this lesson so the client
// component knows whether to offer that link in the completion popup.
export async function markLessonComplete(lessonId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('user_progress').upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,lesson_id' }
  )
  if (error) throw new Error(error.message)

  const { data: existingPost } = await supabase
    .from('posts')
    .select('id')
    .eq('author_id', user.id)
    .eq('lesson_id', lessonId)
    .limit(1)

  revalidatePath('/lessons')
  return { alreadyPosted: (existingPost?.length ?? 0) > 0 }
}

// Separate from markLessonComplete on purpose - rating is opt-in and
// happens (if at all) a beat after completion, from the popup's star
// row, not as part of the same request.
export async function rateLesson(lessonId: string, rating: number) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('user_progress')
    .update({ rating })
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
  if (error) throw new Error(error.message)
}
