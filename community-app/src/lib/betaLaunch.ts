// Single source of truth for the beta launch date - originally only
// lived inside beta/page.tsx, now also read by AppNav.tsx (the
// Lessons/Workouts locked-state copy switches on this same date).
// Keeping it in one place means every surface flips from "not open
// yet" to "join now" at the exact same moment, with no risk of drift
// between separately hardcoded copies of the same timestamp.
//
// 2026-08-01T00:00:00+05:30 - IST, since that's the timezone this
// launches in. Comparing against Date.now() means anything reading
// this flips on its own at midnight on launch day, no manual edit or
// redeploy needed.
export const LAUNCH_AT = new Date('2026-08-01T00:00:00+05:30').getTime()

export function isBetaLive(): boolean {
  return Date.now() >= LAUNCH_AT
}
