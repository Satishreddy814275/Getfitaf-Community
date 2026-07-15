import type { WorkoutPlanDay } from '@/types'
import { collapseExercisesToBlocks, type EditableBlock } from './workoutBlocks'

// A "day group" is every occurrence of the same day label across a
// program's weeks (e.g. "Upper Body A" in week 1, 2, 3, 4) - the thing
// Satish described as wanting to edit once ("the structure is
// constant") while letting sets/reps/rest/timer vary week to week
// (the progression sheet). This is entirely derived from the existing
// flat structured_plan - no schema change, no migration. Rest days and
// any day with zero exercises are skipped; there's nothing to group or
// progress there.
export interface DayGroupWeekEntry {
  week: number
  day: number
  blocks: EditableBlock[]
}

export interface DayGroup {
  label: string
  weeks: DayGroupWeekEntry[]
  // True only if every week's block sequence matches structurally
  // (same phase, same grouping shape, same names, same order) -
  // numeric fields (sets/reps/rest/timer) are deliberately excluded
  // from this comparison since those are exactly what's allowed to
  // differ week to week.
  aligned: boolean
  misalignedWeeks: number[]
}

// Structural fingerprint for one week's block list - order-sensitive,
// numeric-field-blind on purpose. Two weeks with the same fingerprint
// can safely share one "template" structure with per-week progression
// numbers layered on top; a mismatch means something was authored
// differently that week (an extra exercise, a different grouping) and
// needs a human to look, rather than silently forcing one week's shape
// onto another.
function structureKey(blocks: EditableBlock[]): string {
  return blocks.map((b) => `${b.phase}|${b.groupId ? 'g' : 's'}|${b.name}`).join('||')
}

export function buildDayGroups(days: WorkoutPlanDay[]): DayGroup[] {
  const byLabel = new Map<string, WorkoutPlanDay[]>()
  for (const d of days) {
    if (!d.exercises || d.exercises.length === 0) continue
    const key = d.label
    if (!byLabel.has(key)) byLabel.set(key, [])
    byLabel.get(key)!.push(d)
  }

  const groups: DayGroup[] = []
  for (const [label, groupDays] of byLabel) {
    const sorted = [...groupDays].sort((a, b) => a.week - b.week)
    const weeks: DayGroupWeekEntry[] = sorted.map((d) => ({
      week: d.week,
      day: d.day,
      blocks: collapseExercisesToBlocks(d.exercises),
    }))

    const keys = weeks.map((w) => structureKey(w.blocks))
    const canonicalKey = keys[0]
    const misalignedWeeks = weeks.filter((_, i) => keys[i] !== canonicalKey).map((w) => w.week)

    groups.push({
      label,
      weeks,
      aligned: misalignedWeeks.length === 0,
      misalignedWeeks,
    })
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label))
}

// One progression cell - the numbers that are allowed to differ
// between the same exercise's occurrence in different weeks. Everything
// else about the exercise (name, phase, grouping, trackWeight) is
// shared/structural and lives on the template block instead.
export interface ProgressionCell {
  setsCount: number
  reps: string
  restSeconds: number | null
  timerSeconds: number | null
}

export interface ProgressionRow {
  blockId: string
  name: string
  phase: 'warmup' | 'main' | 'cooldown'
  groupId: string | null
  // Parallel to group.weeks - cells[i] is this exercise's numbers for
  // group.weeks[i]. Deliberately NOT keyed by week number: the same
  // label can occur more than once within a single week (confirmed in
  // real content - e.g. Foundations repeats "Basic Prep" three times,
  // not once per week), so a week-number key would collide two
  // different occurrences into one cell and silently overwrite one
  // with the other. Keying by array position against the same
  // group.weeks list this was built from avoids that entirely.
  cells: ProgressionCell[]
}

// Builds the progression grid's rows for an aligned group - one row
// per block position in the canonical (first occurrence's) structure,
// each carrying that same exercise's numbers from every other
// occurrence, matched by position since alignment already guarantees
// the sequences are identical. Returns [] for a misaligned group
// rather than guessing - the UI should surface the misaligned weeks
// and let the admin reconcile them via the regular single-day editor
// first.
export function buildProgressionRows(group: DayGroup): ProgressionRow[] {
  if (!group.aligned || group.weeks.length === 0) return []
  const canonical = group.weeks[0].blocks

  return canonical.map((cb, idx) => ({
    blockId: cb.id,
    name: cb.name,
    phase: cb.phase,
    groupId: cb.groupId,
    cells: group.weeks.map((w) => {
      const wb = w.blocks[idx]
      return {
        setsCount: wb.setsCount,
        reps: wb.reps,
        restSeconds: wb.restSeconds,
        timerSeconds: wb.timerSeconds,
      }
    }),
  }))
}

// Merges one occurrence's progression numbers onto the shared template
// structure, producing the EditableBlock[] that gets handed to
// expandBlocksToExercises for that specific (week, day) - the inverse
// of buildProgressionRows, used at save time in updateProgramDayGroup.
// `overridesByBlockId` should hold this one occurrence's cell for each
// block (i.e. rows.map(r => [r.blockId, r.cells[occurrenceIndex]])),
// not anything keyed by week number, for the same collision reason as
// ProgressionRow.cells above.
export function applyWeekOverrides(
  templateBlocks: EditableBlock[],
  overridesByBlockId: Record<string, ProgressionCell>
): EditableBlock[] {
  return templateBlocks.map((b) => {
    const cell = overridesByBlockId[b.id]
    if (!cell) return b
    return {
      ...b,
      setsCount: cell.setsCount,
      reps: cell.reps,
      restSeconds: cell.restSeconds,
      timerSeconds: cell.timerSeconds,
    }
  })
}
