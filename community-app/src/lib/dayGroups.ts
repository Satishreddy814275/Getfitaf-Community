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

// --- Single-day "apply to similar days" propagation ---
//
// Separate mechanism from the day-group grid above, for the opposite
// situation: a day whose sibling occurrences (same label) DON'T
// structurally match, so there's no shared template to edit in one
// place. Instead, editing a single day (the regular one-day editor)
// can offer to replicate just the IDENTITY/GROUPING change it just
// made onto whichever sibling days happen to already have a
// matching-named exercise - it never touches sets/reps/rest/timer
// (that's what the grid is for when it applies, and per Satish is
// deliberately out of scope here otherwise), and it never adds or
// removes an exercise from a sibling day it wasn't already in - a
// wholesale restructure is a "rebuild that day by hand" situation, not
// something to auto-propagate.
export interface StructuralDiffEntry {
  originalName: string
  newName: string
  // Other exercises this one should end up sharing a round with,
  // carrying both their ORIGINAL name (to find the right block in a
  // sibling day, which hasn't had this edit applied yet) and their NEW
  // name (in case they were renamed in the same edit session) - or
  // null if this exercise should end up standalone/ungrouped.
  groupMates: Array<{ originalName: string; newName: string }> | null
  // Set only when this exercise moved to a different phase (warm-up /
  // workout / cool-down) this session - see the phase-move detection
  // below. Undefined means "leave whatever phase it's already in" in a
  // sibling day.
  phase?: 'warmup' | 'main' | 'cooldown'
  // True when this exercise was deleted outright this session (not
  // moved to another phase - see the phase-move pairing below, which
  // takes priority). When set, originalName is the only field that
  // matters - it's used to find and remove the matching exercise in a
  // sibling day; newName/groupMates/phase are irrelevant.
  deleted?: boolean
}

// Compares a day's blocks before/after one edit session and returns
// only the structural changes - a block whose name, group membership,
// and phase are all unchanged is omitted entirely. Additions are
// excluded on purpose (nothing to match against in a sibling day, and
// per Satish, brand-new exercises shouldn't force themselves onto days
// that don't already have them). Two things that look like a plain
// removal get special-cased instead of being dropped silently:
//
// - A block removed from one phase that reappears (same name) in a
//   different phase this session is a MOVE, not a delete - DayEditor
//   never moves a block between phases in place (phase is fixed per
//   block by design), so "move this exercise to the workout section"
//   is only ever expressed as delete-old + add-new. Folded into the
//   same entry shape via `phase`.
// - Anything left over after that is a genuine deletion - Satish
//   confirmed removals should propagate too (matched by name, skipped
//   wherever a sibling doesn't have it - including a sibling that's
//   already had the same exercise removed, which is what makes it safe
//   to re-run without redoing already-fixed days).
export function diffBlockStructure(
  original: EditableBlock[],
  current: EditableBlock[]
): StructuralDiffEntry[] {
  const currentById = new Map(current.map((b) => [b.id, b]))
  const originalById = new Map(original.map((b) => [b.id, b]))

  function mateIdsOf(blocks: EditableBlock[], block: EditableBlock): Set<string> | null {
    if (block.groupId == null) return null
    return new Set(blocks.filter((b) => b.groupId === block.groupId && b.id !== block.id).map((b) => b.id))
  }

  function sameMateSet(a: Set<string> | null, b: Set<string> | null): boolean {
    if (a == null || b == null) return a == null && b == null
    if (a.size !== b.size) return false
    for (const id of a) if (!b.has(id)) return false
    return true
  }

  function groupMatesFor(blocks: EditableBlock[], block: EditableBlock): Array<{ originalName: string; newName: string }> | null {
    if (block.groupId == null) return null
    const mates = blocks.filter((b) => b.groupId === block.groupId && b.id !== block.id)
    // No other block actually shares this groupId (e.g. its one
    // round-mate was just deleted, leaving a lingering but functionally
    // meaningless groupId) - treat the same as standalone rather than
    // an empty-but-non-null mates list, which the apply side would
    // otherwise vacuously treat as "already matches, nothing to do".
    if (mates.length === 0) return null
    return mates.map((m) => {
      const om = originalById.get(m.id)
      return { originalName: om ? om.name : m.name, newName: m.name }
    })
  }

  const entries: StructuralDiffEntry[] = []
  const consumedRemovedIds = new Set<string>()
  const consumedAddedIds = new Set<string>()

  for (const ob of original) {
    const cb = currentById.get(ob.id)
    if (!cb) continue // handled below, as a possible phase-move pair

    const originalMateIds = mateIdsOf(original, ob)
    const currentMateIds = mateIdsOf(current, cb)
    const renamed = ob.name !== cb.name

    if (!renamed && sameMateSet(originalMateIds, currentMateIds)) continue

    entries.push({
      originalName: ob.name,
      newName: cb.name,
      groupMates: groupMatesFor(current, cb),
    })
  }

  // Phase-move detection: pair up a block removed from one phase with
  // a newly-added block of the same name in a different phase. Name
  // match is treated as a strong-enough signal that it's the same
  // exercise relocated, not a coincidental unrelated swap - especially
  // given exercise names come from the shared canonical picker rather
  // than free text.
  const removed = original.filter((ob) => !currentById.has(ob.id) && !consumedRemovedIds.has(ob.id))
  const added = current.filter((cb) => !originalById.has(cb.id) && !consumedAddedIds.has(cb.id))

  for (const ob of removed) {
    const match = added.find(
      (cb) => !consumedAddedIds.has(cb.id) && cb.name === ob.name && cb.phase !== ob.phase
    )
    if (!match) continue
    consumedRemovedIds.add(ob.id)
    consumedAddedIds.add(match.id)

    entries.push({
      originalName: ob.name,
      newName: match.name,
      groupMates: groupMatesFor(current, match),
      phase: match.phase,
    })
  }

  // Whatever's left in `removed` after phase-move pairing is a genuine
  // deletion this session.
  for (const ob of removed) {
    if (consumedRemovedIds.has(ob.id)) continue
    entries.push({
      originalName: ob.name,
      newName: ob.name,
      groupMates: null,
      deleted: true,
    })
  }

  return entries
}

// Applies a set of StructuralDiffEntry changes to ONE sibling day's
// blocks. Every name lookup is resolved against the sibling's own
// pristine (pre-change) block list, keyed by name, so renaming several
// exercises in the same batch can't have one rename's result
// accidentally matched by a later entry. Entries whose target (or, for
// a grouping change, ALL of whose mates) aren't present in this
// sibling are skipped for that part of the change rather than guessed
// at - a rename can still apply even if the grouping part can't.
export function applyStructuralDiffToBlocks(
  blocks: EditableBlock[],
  changes: StructuralDiffEntry[]
): { blocks: EditableBlock[]; changed: boolean } {
  const workingById = new Map(blocks.map((b) => [b.id, { ...b }]))
  const idByOriginalName = new Map(blocks.map((b) => [b.name, b.id]))
  let changed = false

  for (const entry of changes) {
    const targetId = idByOriginalName.get(entry.originalName)
    if (!targetId) continue // not in this sibling at all (including one already fixed) - nothing to do

    if (entry.deleted) {
      workingById.delete(targetId)
      changed = true
      continue
    }

    const target = workingById.get(targetId)!

    if (entry.phase && target.phase !== entry.phase) {
      target.phase = entry.phase
      changed = true
    }

    if (entry.groupMates === null) {
      if (target.groupId != null) {
        target.groupId = null
        changed = true
      }
      if (target.name !== entry.newName) {
        target.name = entry.newName
        changed = true
      }
      continue
    }

    const mateIds = entry.groupMates.map((m) => idByOriginalName.get(m.originalName))
    if (mateIds.some((id) => !id)) {
      // Can't replicate the round here - not every mate exists in this
      // sibling day. Still apply the rename in isolation.
      if (target.name !== entry.newName) {
        target.name = entry.newName
        changed = true
      }
      continue
    }
    const mates = mateIds.map((id) => workingById.get(id!)!)

    if (target.name !== entry.newName) {
      target.name = entry.newName
      changed = true
    }
    mates.forEach((mb, i) => {
      const wantName = entry.groupMates![i].newName
      if (mb.name !== wantName) {
        mb.name = wantName
        changed = true
      }
    })

    const allSameGroup = target.groupId != null && mates.every((mb) => mb.groupId === target.groupId)
    if (!allSameGroup) {
      const newGroupId = `pg${Date.now()}${Math.random().toString(36).slice(2, 6)}`
      const rounds = Math.max(target.setsCount, ...mates.map((mb) => mb.setsCount), 1)
      target.groupId = newGroupId
      target.setsCount = rounds
      mates.forEach((mb) => {
        mb.groupId = newGroupId
        mb.setsCount = rounds
      })
      changed = true
    }
  }

  return { blocks: [...workingById.values()], changed }
}
