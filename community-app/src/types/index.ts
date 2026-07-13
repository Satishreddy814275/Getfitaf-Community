export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export interface CommentLike {
  id: string
  user_id: string
  // Optional — only populated where the query actually joins it (the
  // main feed query does; admin's post list doesn't need liker names,
  // just the count, so it's left out there rather than changing a
  // query that doesn't need this).
  profiles?: Profile | null
}

export interface Comment {
  id: string
  content: string
  created_at: string
  parent_comment_id: string | null
  profiles: Profile | null
  comment_likes: CommentLike[]
}

export interface Like {
  id: string
  user_id: string
  profiles?: Profile | null
}

export type NotificationType = 'post_like' | 'post_comment' | 'comment_reply' | 'comment_like'

export interface Notification {
  id: string
  type: NotificationType
  post_id: string
  comment_id: string | null
  read: boolean
  created_at: string
  actor: Profile | null
}

export type Space = 'premium' | 'low_ticket'

export interface Post {
  id: string
  content: string | null
  media_url: string | null
  media_type: 'image' | 'video' | null
  is_announcement: boolean
  pinned: boolean
  space: Space
  created_at: string
  profiles: Profile | null
  comments: Comment[]
  likes: Like[]
}

export interface LeaderboardRow {
  rank: number
  user_id: string
  first_name: string
  post_count: number
  comment_count: number
  score: number
  streak: number
}

// Shape written by Getfitaf-workout-builder-main/api/generate.js into
// workout_generations.structured_plan (verified/community visits only
// - see project memory). One entry per training day in the plan (rest
// days are skipped), in Week/Day order, not tied to calendar dates.
export interface WorkoutExercise {
  order: number
  name: string
  sets: string
  reps: string
}

export interface WorkoutPlanDay {
  week: number
  day: number
  label: string
  exercises: WorkoutExercise[]
}

// What a member most recently logged for a given exercise, used to
// show "last time" reference numbers while logging a new session.
export interface LastLoggedSet {
  exerciseName: string
  weight: number | null
  reps: number | null
  loggedAt: string
}

export interface WorkoutHistorySet {
  exerciseName: string
  setNumber: number
  weight: number | null
  reps: number | null
}

export interface WorkoutHistorySession {
  id: string
  week: number
  day: number
  label: string | null
  completedAt: string
  sets: WorkoutHistorySet[]
}

// One group per generation - each regeneration is treated as its own
// distinct plan for history purposes (consistent with the live grid
// starting fresh after a regenerate), not merged into one continuous
// timeline.
export interface WorkoutHistoryGroup {
  generationId: string
  isCurrent: boolean
  sessions: WorkoutHistorySession[]
}

// A member-initiated exercise substitution (see
// migration-exercise-swaps.sql). weekNumber 0 means "every week" -
// the plan template only ever describes one week's worth of days,
// replayed 4x by WorkoutDayPicker, so a swap that should apply
// everywhere is just the same row without a specific week attached.
// A week-specific swap (1-4) overrides an all-weeks swap for the same
// day/exercise if both happen to exist. Keyed by originalExerciseName
// (the untouched template name, not whatever's currently displayed)
// so swapping twice in a row updates the same row instead of stacking,
// and swapping back to the original name is just a normal swap.
export interface WorkoutExerciseSwap {
  weekNumber: number
  dayNumber: number
  originalExerciseName: string
  newExerciseName: string
  sets: string
  reps: string
}
