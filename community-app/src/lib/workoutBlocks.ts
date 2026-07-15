import type { WorkoutExercise, WorkoutPlanDay } from '@/types'

// Admin-editor-only representation of a workout day. Exists because
// structured_plan stores exercises fully "unrolled" - a 3-set exercise
// is 3 separate rows ("Squats (1)", "Squats (2)", "Squats (3)"), and a
// 3-round circuit is 3 rows per exercise interleaved ("Squats (Round
// 1)", "Push-Ups (Round 1)", "Squats (Round 2)", ...). That's the
// right shape for the member-facing guided player (see
// WorkoutDayPicker), but the wrong shape to hand an admin editor - it
// would mean editing "I.Y.T.W's" meant separately editing 3 identical
// rows, and grouping/ungrouping into rounds would mean manually
// reordering and relabeling dozens of rows by hand.
//
// A block is "one exercise, repeated setsCount times" - a straight set
// (groupId null) or one member of an interleaved round group (groupId
// shared with its round-mates, all of which must share the same
// setsCount since that's what makes an even number of rounds
// possible). Editing a block's fields naturally applies to every
// round/set it represents, because there's only one block - no
// separate "apply to all rounds" step needed.
export interface EditableBlock {
  id: string
  name: string
  setsCount: number
  reps: string
  restSeconds: number | null
  timerSeconds: number | null
  trackWeight: boolean
  phase: 'warmup' | 'main' | 'cooldown'
  groupId: string | null
}

const ROUND_SUFFIX = /\s*\(Round \d+\)$/
const SET_SUFFIX = /\s*\(\d+\)$/

function stripRoundSuffix(name: string): string {
  return name.replace(ROUND_SUFFIX, '')
}

function stripSetSuffix(name: string): string {
  return name.replace(SET_SUFFIX, '')
}

// Exported so anything else that needs to compare/collect exercise
// names against the unrolled structured_plan format (e.g. the "Add
// exercise" picker's canonical name list in exercisePool.ts) strips
// suffixes exactly the same way collapseExercisesToBlocks does - one
// definition, not a second regex pair that could drift out of sync.
export function baseExerciseName(name: string): string {
  return stripSetSuffix(stripRoundSuffix(name)).trim()
}

// Reconstructs the grouped block representation from a day's flat,
// unrolled exercise list. Assumes the app's own authoring invariants
// hold (phase is contiguous, round numbers are sequential from 1, a
// round group's exercises repeat in the same order every round) -
// true for everything authored so far since it was all generated
// through the same conventions. Falls back to one standalone block
// per row (setsCount from the literal "sets" field) if a run doesn't
// cleanly parse, rather than throwing - older or hand-edited content
// shouldn't crash the editor, worst case it just shows ungrouped.
export function collapseExercisesToBlocks(exercises: WorkoutExercise[]): EditableBlock[] {
  const blocks: EditableBlock[] = []
  let i = 0
  let groupCounter = 0

  while (i < exercises.length) {
    const ex = exercises[i]

    if (ex.round == null) {
      // Straight-set run: consecutive rows sharing a base name, no round.
      const base = stripSetSuffix(ex.name)
      let j = i
      while (j < exercises.length && exercises[j].round == null && stripSetSuffix(exercises[j].name) === base) {
        j++
      }
      const runLength = j - i
      blocks.push({
        id: `b${blocks.length}`,
        name: base,
        setsCount: runLength > 0 ? runLength : Number(ex.sets) || 1,
        reps: ex.reps,
        restSeconds: ex.restSeconds ?? null,
        timerSeconds: ex.timerSeconds ?? null,
        trackWeight: ex.trackWeight !== false,
        phase: ex.phase ?? 'main',
        groupId: null,
      })
      i = j
      continue
    }

    // Round-group: figure out how many distinct exercises make up one
    // round (k), then how many rounds repeat that same k-exercise
    // pattern (r).
    if (ex.round !== 1) {
      // Malformed - a round group should start at round 1. Bail out to
      // a standalone block for just this row rather than misparsing.
      blocks.push({
        id: `b${blocks.length}`,
        name: stripRoundSuffix(ex.name),
        setsCount: 1,
        reps: ex.reps,
        restSeconds: ex.restSeconds ?? null,
        timerSeconds: ex.timerSeconds ?? null,
        trackWeight: ex.trackWeight !== false,
        phase: ex.phase ?? 'main',
        groupId: null,
      })
      i++
      continue
    }

    let k = 0
    while (i + k < exercises.length && exercises[i + k].round === 1) k++
    const roundOneNames = exercises.slice(i, i + k).map((e) => stripRoundSuffix(e.name))

    let r = 0
    let cursor = i
    while (cursor + k <= exercises.length) {
      const chunk = exercises.slice(cursor, cursor + k)
      const matches = chunk.every(
        (e, idx) => e.round === r + 1 && stripRoundSuffix(e.name) === roundOneNames[idx]
      )
      if (!matches) break
      r++
      cursor += k
    }

    if (r === 0 || k === 0) {
      // Shouldn't happen given the round-1 check above, but guard
      // against an infinite loop / zero-progress just in case.
      blocks.push({
        id: `b${blocks.length}`,
        name: stripRoundSuffix(ex.name),
        setsCount: 1,
        reps: ex.reps,
        restSeconds: ex.restSeconds ?? null,
        timerSeconds: ex.timerSeconds ?? null,
        trackWeight: ex.trackWeight !== false,
        phase: ex.phase ?? 'main',
        groupId: null,
      })
      i++
      continue
    }

    const groupId = `g${groupCounter++}`
    for (let idx = 0; idx < k; idx++) {
      const source = exercises[i + idx]
      blocks.push({
        id: `b${blocks.length}`,
        name: roundOneNames[idx],
        setsCount: r,
        reps: source.reps,
        restSeconds: source.restSeconds ?? null,
        timerSeconds: source.timerSeconds ?? null,
        trackWeight: source.trackWeight !== false,
        phase: source.phase ?? 'main',
        groupId,
      })
    }
    i += k * r
  }

  return blocks
}

const PHASE_ORDER: Array<'warmup' | 'main' | 'cooldown'> = ['warmup', 'main', 'cooldown']

// Inverse of collapseExercisesToBlocks - deterministically regenerates
// a flat, unrolled exercise list from a block list. Always produces a
// structurally valid result (order sequential from 1, phase contiguous
// in canonical warmup/main/cooldown order, round numbers sequential
// from 1 within each group) regardless of what order the UI happens to
// hold the blocks in - correctness comes from this function always
// rebuilding fresh, not from trusting incremental edits to preserve it.
export function expandBlocksToExercises(blocks: EditableBlock[]): WorkoutExercise[] {
  const out: WorkoutExercise[] = []

  for (const phase of PHASE_ORDER) {
    const phaseBlocks = blocks.filter((b) => b.phase === phase)
    const emittedGroups = new Set<string>()

    for (const block of phaseBlocks) {
      if (block.groupId == null) {
        // Only distinguish sets by name ("Squats (1)", "(2)", ...) when
        // there's more than one - a single one-off exercise (a warm-up
        // walk, a stretch done once) keeps its bare name, matching how
        // those were originally authored. Getting this wrong is exactly
        // the kind of thing collapse/expand round-tripping catches -
        // see roundtrip.ts.
        const count = Math.max(1, block.setsCount)
        for (let s = 1; s <= count; s++) {
          const name = count > 1 ? `${block.name} (${s})` : block.name
          out.push(buildExercise(name, block))
        }
        continue
      }
      if (emittedGroups.has(block.groupId)) continue
      emittedGroups.add(block.groupId)

      const groupBlocks = phaseBlocks.filter((b) => b.groupId === block.groupId)
      const rounds = Math.max(1, ...groupBlocks.map((b) => b.setsCount))
      for (let r = 1; r <= rounds; r++) {
        for (const gb of groupBlocks) {
          out.push({ ...buildExercise(`${gb.name} (Round ${r})`, gb), round: r })
        }
      }
    }
  }

  return out.map((e, idx) => ({ ...e, order: idx + 1 }))
}

function buildExercise(name: string, block: EditableBlock): WorkoutExercise {
  const e: WorkoutExercise = {
    order: 0, // reassigned in expandBlocksToExercises
    name,
    sets: '1',
    reps: block.reps,
    trackWeight: block.trackWeight,
    phase: block.phase,
  }
  if (block.restSeconds != null) e.restSeconds = block.restSeconds
  if (block.timerSeconds != null) e.timerSeconds = block.timerSeconds
  return e
}

// Convenience for callers operating on a whole program's days array -
// swaps in a freshly-expanded exercise list for one (week, day) entry,
// leaving every other day untouched.
export function replaceDayExercises(
  days: WorkoutPlanDay[],
  week: number,
  day: number,
  exercises: WorkoutExercise[]
): WorkoutPlanDay[] {
  return days.map((d) => (d.week === week && d.day === day ? { ...d, exercises } : d))
}
