import type { WorkoutPlanDay } from '@/types'
import { baseExerciseName } from './workoutBlocks'
import { findExerciseVideo, normalize, type ExerciseVideo } from './exerciseVideos'

export interface VideoRecord {
  id: string
  exercise_name: string
  video_url: string
}

export interface ExercisePoolEntry {
  name: string
  videoId: string | null
  videoUrl: string | null
}

// Canonical list backing the day editor's "Add exercise" picker and
// the per-block "swap exercise" control - every distinct exercise name
// already used in ANY program (across all programs, not just the one
// being edited, so the pool only grows more useful over time), plus
// any exercise_videos entry not yet used anywhere. Picking from this
// list instead of typing freehand is what prevents "Squats" vs "Squat"
// from silently becoming two different exercises (broken video match,
// split progress history) - see project discussion.
//
// hasVideo is computed with the exact same findExerciseVideo/normalize
// matching the member-facing workout player uses, so the picker's
// "has a video" badge always agrees with what a client actually sees -
// not a second, possibly-diverging heuristic.
export function buildExercisePool(
  allProgramDays: WorkoutPlanDay[][],
  videos: VideoRecord[]
): ExercisePoolEntry[] {
  const matchable: ExerciseVideo[] = videos.map((v) => ({
    exerciseName: v.exercise_name,
    videoUrl: v.video_url,
  }))

  function findVideoRecord(name: string): VideoRecord | null {
    const match = findExerciseVideo(name, matchable)
    if (!match) return null
    return videos.find((v) => v.exercise_name === match.exerciseName) ?? null
  }

  const byKey = new Map<string, ExercisePoolEntry>()

  function upsert(rawName: string) {
    const name = baseExerciseName(rawName)
    const key = normalize(name)
    if (!key || byKey.has(key)) return
    const video = findVideoRecord(name)
    byKey.set(key, { name, videoId: video?.id ?? null, videoUrl: video?.video_url ?? null })
  }

  for (const days of allProgramDays) {
    for (const day of days) {
      for (const ex of day.exercises || []) {
        if (ex?.name) upsert(ex.name)
      }
    }
  }
  for (const v of videos) {
    upsert(v.exercise_name)
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name))
}
