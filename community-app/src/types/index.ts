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
  // false for bodyweight-only moves (planks, marches, bridges, etc.) -
  // hides the weight input entirely instead of asking someone to log a
  // weight that doesn't apply. Absent/true on older AI-generated plans,
  // where every exercise still shows a weight field same as before.
  trackWeight?: boolean
  // True when the "reps" field is actually a duration held, in
  // seconds - planks, wall sits, dead hangs. Independent of
  // timerSeconds/trackWeight on purpose: a timed AMRAP move (e.g.
  // "squat jumps, 30s") has a timer but still logs a rep count, while
  // a weighted hold (e.g. a loaded farmer's carry) tracks weight AND
  // duration at once. Absent/false on everything else, which keeps
  // every existing exercise's behavior unchanged - this only relabels
  // and reformats the same underlying number, it doesn't add a new
  // logged value or require a migration.
  logAsDuration?: boolean
  // Prescribed rest duration in seconds shown next to Target (e.g. 40)
  // - like timerSeconds, this is a number to reach for a one-tap timer
  // with, not something the app enforces or counts down on its own.
  // Kept as a separate field from timerSeconds (rather than reusing
  // it) since an exercise can have both a work duration and a rest
  // duration that differ.
  restSeconds?: number
  // Prescribed work duration in seconds (e.g. 600 for a 10-minute
  // walk, 20 for a 20s hold) - only set on authored program-template
  // content, where the duration is something we wrote ourselves and
  // can trust, unlike AI-generated free text. When present, the
  // logging UI shows a dedicated one-tap timer button pre-loaded to
  // this exact duration, alongside the regular custom picker for
  // anyone who wants a different one.
  timerSeconds?: number
  // Which circuit round this exercise belongs to (1, 2, 3, ...) -
  // explicit rather than parsed from the name (which may still say
  // "(Round 1)" for display/uniqueness reasons - see WorkoutDayPicker).
  // Absent on exercises that aren't part of a repeating circuit (a
  // warm-up/cool-down walk, a stretch, or any older non-round content).
  // A day with any exercise carrying a round number is treated as a
  // round-based/circuit day and gets the guided one-at-a-time player
  // instead of the plain list view.
  round?: number
  // Which part of the session this exercise belongs to - explicit,
  // author-set, not inferred from the name. Used purely to show a
  // one-tap phase-transition screen ("Let's warm up" / "Time for the
  // main workout" / "Nice work, let's cool down.") the moment the
  // guided player crosses from one phase into the next - at most 2-3
  // extra taps across a whole day, regardless of how many rounds or
  // sets are inside "main". Absent on older content, which just never
  // shows a phase screen (see isFirstOfPhase in WorkoutDayPicker).
  phase?: 'warmup' | 'main' | 'cooldown'
  // True for unilateral moves that need to be done once per side (most
  // stretches, single-arm/single-leg work) - see WorkoutDayPicker for
  // how this changes the logging UI. Absent/false on everything else,
  // which is the overwhelming majority of content.
  perSide?: boolean
}

export interface WorkoutPlanDay {
  // Real, distinct identifiers on program-template content - each
  // week/day combination is its own authored entry and is shown
  // exactly once, not a single-week template replayed across a fixed
  // program length. (On older AI-generated plans, week was always 1
  // and WorkoutDayPicker used to synthesize a repeating 4-week grid
  // from it - that replay behavior is gone now that community-app
  // logging only ever reads from program_templates.)
  week: number
  day: number
  label: string
  // Explicit, author-set tag - not inferred from exercise text. Only
  // present on program-template-authored days going forward; absent
  // (treated as false) on older AI-generated plans. Not yet read
  // anywhere in the logging UI - captured now so it's available once
  // cardio-specific logging is actually built.
  isCardio?: boolean
  // Free-text session-level instruction shown above the exercise list
  // (e.g. "Circuit format - 40s rest between exercises") - for things
  // that apply to the whole day rather than any one exercise. Optional,
  // absent on older AI-generated plans.
  notes?: string
  exercises: WorkoutExercise[]
}

// A standalone, reusable day - "Upper Body 1," "Lower Body 1" - saved
// independently of any program, so it can be copied into any program's
// day slot instead of rebuilt from scratch each time. Same exercises
// shape as WorkoutPlanDay, just without a week/day/program attached.
// See admin/actions.ts (addProgramDayFromTemplate/
// saveProgramDayAsTemplate) for how content moves between this and a
// real program day - always a one-time copy, never a live link.
export interface WorkoutTemplate {
  id: string
  name: string
  notes?: string | null
  exercises: WorkoutExercise[]
  createdAt: string
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
// migration-exercise-swaps.sql). weekNumber 0 means "apply to any
// week" - useful when the same exercise/day-number combination
// recurs across multiple authored weeks and the swap should follow it
// everywhere. A week-specific swap (matching a real week number)
// overrides an all-weeks swap for the same day/exercise if both
// happen to exist. Keyed by originalExerciseName
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

// One row per member per calendar day (see migration-body-weight.sql -
// unique on profile_id + logged_date, upserted). weightKg is always
// canonical kg, same storage pattern as workout_logged_sets.weight -
// conversion to the member's preferred unit happens only at
// display/input via weightUnit.ts.
export interface BodyWeightEntry {
  id: string
  loggedDate: string
  weightKg: number
}
