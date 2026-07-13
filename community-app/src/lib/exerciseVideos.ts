export interface ExerciseVideo {
  exerciseName: string
  videoUrl: string
}

// Lowercase, trim, collapse whitespace, strip punctuation - just
// enough normalization that "Barbell Bench Press", "barbell bench
// press", and "Barbell Bench Press." all compare equal, without
// pulling in a real fuzzy-matching library for what's still a fairly
// small, manually-curated set of videos.
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Finds the best video match for a generated exercise name against
// the video library. Exact match on the normalized name first; if
// that fails, falls back to a loose word-overlap check (every
// significant word in the video's exercise name appears somewhere in
// the generated one, or vice versa) so minor wording differences
// between how Satish named a video and how the AI phrased an exercise
// ("Barbell Bench Press" vs "Flat Barbell Bench Press") still match.
// Returns null rather than guessing when nothing reasonable is found
// - a missing video is far better than a wrong one.
export function findExerciseVideo(
  exerciseName: string,
  videos: ExerciseVideo[]
): ExerciseVideo | null {
  const target = normalize(exerciseName)
  if (!target) return null

  const exact = videos.find((v) => normalize(v.exerciseName) === target)
  if (exact) return exact

  const targetWords = new Set(target.split(' ').filter((w) => w.length > 2))
  if (targetWords.size === 0) return null

  for (const video of videos) {
    const videoWords = normalize(video.exerciseName)
      .split(' ')
      .filter((w) => w.length > 2)
    if (videoWords.length === 0) continue

    const allVideoWordsInTarget = videoWords.every((w) => targetWords.has(w))
    const allTargetWordsInVideo = [...targetWords].every((w) => videoWords.includes(w))
    if (allVideoWordsInTarget || allTargetWordsInVideo) return video
  }

  return null
}

// Zero-curation fallback for anything not in the library yet - a
// plain YouTube search link works immediately for every exercise, no
// data entry required.
export function youtubeSearchUrl(exerciseName: string): string {
  const query = encodeURIComponent(`${exerciseName} exercise tutorial`)
  return `https://www.youtube.com/results?search_query=${query}`
}
