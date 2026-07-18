'use client'

import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logWorkoutSession, requestExerciseVideo, swapExercise } from '@/app/workouts/actions'
import { parseTargetSetCount } from '@/lib/workoutPlan'
import { findExerciseVideo, youtubeSearchUrl, type ExerciseVideo } from '@/lib/exerciseVideos'
import { collapseExercisesToBlocks, type EditableBlock } from '@/lib/workoutBlocks'
import {
  Timer,
  Play,
  BicepsFlexed,
  Check,
  History as HistoryIcon,
  X,
  ArrowRight,
  AlertTriangle,
  Sun,
  Flame,
  Wind,
  PartyPopper,
  Trophy,
  Medal,
  ThumbsUp,
  Sparkles,
  Rocket,
} from 'lucide-react'
import type { WorkoutPlanDay, LastLoggedSet, WorkoutExerciseSwap, WorkoutHistoryGroup } from '@/types'

interface SetRow {
  weight: string
  reps: string
}

// name/sets/reps reflect whatever should currently be displayed
// (possibly swapped); originalName is the untouched template name,
// kept stable across swaps so it can be used as the swap "key" - both
// for looking up an existing swap row and for re-swapping the same
// slot without accumulating duplicates.
interface CellExercise {
  originalName: string
  name: string
  sets: string
  reps: string
  trackWeight?: boolean
  restSeconds?: number
  timerSeconds?: number
  round?: number
  phase?: 'warmup' | 'main' | 'cooldown'
  // True for unilateral moves done once per side - see the "Switch
  // sides" prompt (timed exercises) and Left/Right row labels
  // (rep-based exercises) further down.
  perSide?: boolean
}

interface Cell {
  key: string
  week: number
  day: number
  label: string
  notes?: string
  exercises: CellExercise[]
}

// Applies any swaps for this day/week on top of the template's
// exercises. A week-specific swap (weekNumber === week) wins over an
// all-weeks swap (weekNumber === 0) for the same day/exercise if a
// member somehow has both recorded.
function resolveExercises(
  day: WorkoutPlanDay,
  week: number,
  swaps: WorkoutExerciseSwap[]
): CellExercise[] {
  return day.exercises.map((ex) => {
    const swap =
      swaps.find(
        (s) => s.dayNumber === day.day && s.weekNumber === week && s.originalExerciseName === ex.name
      ) ||
      swaps.find(
        (s) => s.dayNumber === day.day && s.weekNumber === 0 && s.originalExerciseName === ex.name
      )
    // trackWeight/restSeconds/timerSeconds/round/phase/perSide aren't
    // swap-diffable fields (the swap row only stores name/sets/reps) -
    // a swapped-in exercise keeps the original slot's weight/rest/
    // timer/round/phase/perSide treatment rather than defaulting back
    // to "needs weight, no rest reference, no prescribed timer, not
    // part of a round or phase, not per-side".
    return swap
      ? {
          originalName: ex.name,
          name: swap.newExerciseName,
          sets: swap.sets,
          reps: swap.reps,
          trackWeight: ex.trackWeight,
          restSeconds: ex.restSeconds,
          timerSeconds: ex.timerSeconds,
          round: ex.round,
          phase: ex.phase,
          perSide: ex.perSide,
        }
      : {
          originalName: ex.name,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          trackWeight: ex.trackWeight,
          restSeconds: ex.restSeconds,
          timerSeconds: ex.timerSeconds,
          round: ex.round,
          phase: ex.phase,
          perSide: ex.perSide,
        }
  })
}

const DRAFT_KEY_PREFIX = 'workout-draft-'

const PHASE_LABELS_PREVIEW: Record<'warmup' | 'main' | 'cooldown', string> = {
  warmup: 'Warm-up',
  main: 'Main workout',
  cooldown: 'Cool-down',
}
const PHASE_ORDER_PREVIEW: Array<'warmup' | 'main' | 'cooldown'> = ['warmup', 'main', 'cooldown']

// Read-only preview grouping for a day, shown before someone commits to
// List or Guided mode - phase-sectioned, with round patterns collapsed
// into one "Round x N" block covering every repeat (mirrors the admin
// editor's DayReadOnlyView, which Satish specifically pointed to as the
// format to match), rather than the live logging view's one-card-per-
// round-occurrence (see buildListGroups above) which is right for
// actually logging sets but way too repetitive for a glance-at-it
// preview.
function buildPreviewSections(exercises: CellExercise[]) {
  const blocks: EditableBlock[] = collapseExercisesToBlocks(
    exercises.map((ex, i) => ({ ...ex, order: i }))
  )
  return PHASE_ORDER_PREVIEW.map((phase) => ({
    phase,
    items: groupPreviewBlocks(blocks.filter((b) => b.phase === phase)),
  })).filter((section) => section.items.length > 0)
}

type PreviewItem =
  | { type: 'single'; block: EditableBlock }
  | { type: 'round'; groupId: string; blocks: EditableBlock[] }

// Same idea as admin's itemsForPhase (AdminProgramsList.tsx) - a
// standalone block is its own row, and every block sharing a groupId
// (one full round pattern, already collapsed to a single setsCount by
// collapseExercisesToBlocks) becomes one boxed "Round x N" item.
function groupPreviewBlocks(blocks: EditableBlock[]): PreviewItem[] {
  const items: PreviewItem[] = []
  const seenGroups = new Set<string>()
  for (const b of blocks) {
    if (b.groupId == null) {
      items.push({ type: 'single', block: b })
      continue
    }
    if (seenGroups.has(b.groupId)) continue
    seenGroups.add(b.groupId)
    items.push({ type: 'round', groupId: b.groupId, blocks: blocks.filter((x) => x.groupId === b.groupId) })
  }
  return items
}

interface Draft {
  cell: Cell
  sets: Record<string, SetRow[]>
  // Where the guided player was, so resuming a closed tab lands back
  // on roughly the right exercise instead of restarting at the top.
  // Optional so old drafts saved before this existed still parse fine.
  guidedIndex?: number
  // Per-set checkmarks (visual progress only, see checkedByExercise) -
  // optional for the same reason as guidedIndex, plus the elapsed-timer
  // start time so resuming a closed tab keeps counting from when the
  // session actually started rather than restarting the clock.
  checked?: Record<string, boolean[]>
  startedAt?: number
}

// A session isn't saved to the server at all until "Finish Workout" -
// without this, closing the tab mid-session silently threw away
// everything typed so far. Scoped to the browser/device only
// (localStorage, not a new table) since that matches the actual ask:
// surviving a refresh or an accidentally-closed tab, not syncing an
// in-progress session across devices.
function loadDraft(generationId: string): Draft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY_PREFIX + generationId)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function saveDraft(
  generationId: string,
  cell: Cell,
  sets: Record<string, SetRow[]>,
  guidedIndex: number,
  checked: Record<string, boolean[]>,
  startedAt: number
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      DRAFT_KEY_PREFIX + generationId,
      JSON.stringify({ cell, sets, guidedIndex, checked, startedAt })
    )
  } catch {
    // Storage full/unavailable - worst case the draft just doesn't
    // resume, logging itself still works fine.
  }
}

function clearDraft(generationId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DRAFT_KEY_PREFIX + generationId)
  } catch {
    // no-op
  }
}

// Groups a day's flat exercise list the same way the list view's cards
// are grouped: consecutive non-round entries sharing a base name
// (matched on originalName, not the possibly-swapped display name, so
// a mid-run swap never breaks the grouping) become one array, and
// round-tagged entries are always their own singleton array. Extracted
// to module scope (rather than computed inline once per render) since
// both the guided player's step order and startCell/the draft-restore
// effect need this exact same grouping - the guided player literally
// walks this array one step at a time now, so it and the list view's
// cards agree on where one "exercise" ends and the next begins.
function buildListGroups(exercises: CellExercise[]): CellExercise[][] {
  const groups: CellExercise[][] = []
  for (const ex of exercises) {
    const prev = groups[groups.length - 1]
    if (
      prev &&
      ex.round == null &&
      prev[0].round == null &&
      baseName(ex.originalName) === baseName(prev[0].originalName)
    ) {
      prev.push(ex)
    } else {
      groups.push([ex])
    }
  }
  return groups
}

// Group-array counterparts to isFirstOfRound/isFirstOfPhase above - same
// idea, just indexing into buildListGroups' output (one entry per
// guided step) instead of the raw flat exercises array, since the
// guided player now advances one step (a round exercise, or a whole
// straight-set group) at a time rather than one raw row at a time.
function isFirstOfRoundGroups(groups: CellExercise[][], index: number): boolean {
  const round = groups[index]?.[0]?.round
  if (round == null) return false
  return groups[index - 1]?.[0]?.round !== round
}

function isFirstOfPhaseGroups(groups: CellExercise[][], index: number): boolean {
  const phase = groups[index]?.[0]?.phase
  if (phase == null) return false
  return groups[index - 1]?.[0]?.phase !== phase
}

function phaseIntroText(phase: 'warmup' | 'main' | 'cooldown'): string {
  if (phase === 'warmup') return "Let's warm up"
  if (phase === 'main') return 'Time for the main workout'
  return "Great job, now let's cool down."
}

// Icon shown above phaseIntroText's line on the round-intro screen -
// Sun for warm-up (start-of-session feel), Flame for main (energy/
// intensity), Wind for cool-down (winding down) - picked from a set of
// mockup options Satish reviewed directly before building.
function phaseIntroIcon(phase: 'warmup' | 'main' | 'cooldown') {
  if (phase === 'warmup') return Sun
  if (phase === 'main') return Flame
  return Wind
}

// Consecutive-calendar-days streak, ending today, for the "N workouts
// back-to-back" celebration message - Satish's explicit definition:
// calendar days, not just "however many sessions in a row whenever
// they happened." history only has sessions saved BEFORE the one
// currently being finished (finishWorkout calls this synchronously,
// before the server round-trip that would refresh the history prop),
// so today's date is added unconditionally - this session's completion
// is what's about to make today count. One session logged on a given
// day is enough to count that whole day, regardless of how many
// exercises/sets it had.
function computeBackToBackStreak(history: WorkoutHistoryGroup[]): number {
  const dates = new Set<string>()
  for (const group of history) {
    for (const session of group.sessions) {
      if (session.completedAt) dates.add(new Date(session.completedAt).toDateString())
    }
  }
  const today = new Date()
  dates.add(today.toDateString())
  let streak = 0
  const cursor = new Date(today)
  while (dates.has(cursor.toDateString())) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// Pre-filled text for the "Post a win in the community" button on the
// finish-workout celebration modal - always names the actual day and
// ends with 💪 (Satish's explicit ask), but the phrasing around it
// rotates so the feed doesn't fill up with the literal same sentence
// every time. Same random-pool idea as pickCelebration/the phase
// intro copy, just for this one spot.
function pickWinPostText(dayLabel: string): string {
  const templates = [
    `Just finished ${dayLabel}! 💪`,
    `Logged another one: ${dayLabel} 💪`,
    `${dayLabel} - done and dusted 💪`,
    `Checked off ${dayLabel} today 💪`,
    `Another one in the books: ${dayLabel} 💪`,
  ]
  return templates[Math.floor(Math.random() * templates.length)]
}

// Fixed, non-random line for the inline banner (above the progress
// bar) once a session's finished - deliberately NOT drawn from the
// same random pool as the celebration modal (pickCelebration), per
// Satish's own correction: a random pool line risked reading as stale
// or repeated if seen again later, whereas a percentage-of-program
// message is always accurate to what's actually true whenever it's
// seen. 100% is handled separately by the existing "you've completed
// this program" block, so this only ever needs to cover 0-99%.
function progressBracketMessage(percent: number): string {
  if (percent < 25) return "Great start - let's keep the momentum going!"
  if (percent < 50) return "You're building real consistency."
  if (percent < 75) return 'Halfway there and going strong!'
  return 'Almost through this program!'
}

// Short label for the list view's collapsible phase section headers -
// same three phases as phaseIntroText above, just a header word instead
// of a full sentence.
function phaseSectionLabel(phase: 'warmup' | 'main' | 'cooldown'): string {
  if (phase === 'warmup') return 'Warm-up'
  if (phase === 'cooldown') return 'Cool-down'
  return 'Main workout'
}

// Strips a trailing "(N)" set-number suffix - "Squats (2)" -> "Squats".
// Deliberately only matches a bare number in parens, not "(Round 2)"
// or "(Warm-Up)" etc., so round-tagged and one-off exercises are
// never accidentally grouped - only the straight-set unrolling
// convention (see seed content) uses this exact "(N)" shape.
function baseName(name: string): string {
  return name.replace(/\s\(\d+\)$/, '')
}

// Strips a trailing "(Round N)" suffix - "Push-Ups (Round 1)" ->
// "Push-Ups". Round-tagged exercise names carry this literally in the
// data (see workoutBlocks.ts's own ROUND_SUFFIX) so each name is
// unique across the round pattern - useful for that, but redundant
// clutter once an exercise is already sitting inside a box labeled
// "Round 1" (see the round-box grouping in the day view below), so
// display-only spots inside that box strip it back off.
function stripRoundSuffixDisplay(name: string): string {
  return name.replace(/\s*\(Round \d+\)$/, '')
}

// Collapses a logged/displayed exercise name down to its "history
// identity" - strips both the straight-set "(N)" and round "(Round N)"
// suffixes so "Squats (1)"/"(2)"/"(3)" and "Push-Ups (Round 1)"/
// "(Round 2)" all roll up into one history thread per exercise,
// matching how workout_logged_sets stores them (see
// migration-workout-logging.sql - exercise_name is a plain text column,
// matched by exact string, no separate stable exercise ID). Deliberately
// does NOT try to reconcile a swapped exercise back to whatever it
// replaced - "Goblet Squat" and "Barbell Squat" stay two separate
// threads, since they're genuinely different lifts with different
// loads (Satish's explicit call).
function normalizeExerciseIdentity(name: string): string {
  return stripRoundSuffixDisplay(baseName(name))
}

interface ExerciseHistoryEntry {
  sessionId: string
  week: number
  day: number
  label: string | null
  completedAt: string
  isCurrent: boolean
  sets: { setNumber: number; weight: number | null; reps: number | null }[]
}

function formatRestTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Short label for a preset/prescribed duration button - "10 min" for
// whole minutes, "30s" otherwise (covers holds like a 20s plank).
function formatDurationLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`
}

// Fixed manual presets, in seconds - used by the "custom" picker on
// every exercise. Deliberately not tied to any exercise's actual
// recommended duration by default (that data isn't reliably structured
// on AI-generated plans) - this is just a generic timer. Authored
// program-template content can opt in to a prescribed duration via
// timerSeconds instead, which shows its own dedicated one-tap button
// alongside this same picker for anyone who wants a different length.
const REST_PRESETS_SECONDS = [30, 60, 120, 180, 240, 300, 600]

// Beep in the final 3 seconds so it's useful without staring at the
// screen. Built with the Web Audio API directly rather than an audio
// file asset - no extra network request, and firing it only from a
// button tap (never automatically on load) keeps it inside the
// user-gesture requirement every mobile browser enforces for audio.
function playRestBeep() {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    osc.onended = () => ctx.close()
  } catch {
    // Audio unavailable for some reason - the visual countdown still
    // works fine without it.
  }
}

// The actual logging UI. Shows the whole program up front as a grid
// (grouped by week), not just an abstract "logged Nx" counter -
// completed cells are marked done, and the first not-yet-completed
// cell in program order is highlighted as "up next." That highlight
// is just a recommendation, not a gate - every cell stays clickable,
// so someone can still log any session out of order if they want to.
// Weeks are read directly from each day's own week number - a program
// can have any number of weeks, each with genuinely different days
// (a progression), rather than one week's template replayed across a
// fixed length. (Old AI-generated plans used to always say week 1 and
// get synthetically replayed 4x - that no longer happens now that
// this only ever reads from program_templates.)
export default function WorkoutDayPicker({
  generationId,
  days,
  completedCells,
  lastByExercise,
  history,
  videos,
  swaps,
  onSessionActiveChange,
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedCells: string[]
  lastByExercise: Record<string, LastLoggedSet>
  history: WorkoutHistoryGroup[]
  videos: ExerciseVideo[]
  swaps: WorkoutExerciseSwap[]
  // Lets the parent (WorkoutsTabs) know whether a day is currently
  // being logged, so it can hide the page header and tab switcher
  // while a session is active - full focus, per Satish: the program
  // overview and Completed Workouts tab "take away from the focus of
  // that session" and Discard/browser-back are enough of an exit.
  // Optional since WorkoutHistoryList's sibling usage has no need for
  // this and older callers shouldn't be forced to pass it.
  onSessionActiveChange?: (active: boolean) => void
}) {
  const router = useRouter()
  const [activeCell, setActiveCell] = useState<Cell | null>(null)
  // Fires on every activeCell transition, including the initial mount
  // (so a resumed draft session - restored a moment later by the
  // effect below - still ends up hiding the header once it kicks in).
  // Calling the parent's setter with the same boolean it already has
  // is a harmless no-op re-render bailout, so this doesn't need to be
  // guarded against firing more often than activeCell actually changes.
  useEffect(() => {
    onSessionActiveChange?.(activeCell != null)
  }, [activeCell, onSessionActiveChange])
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({})
  // Boostcamp-style per-set checkmarks - purely a visual "I did this"
  // marker for the member's own benefit (and what drives the top
  // progress bar, see below), never a gate on what actually saves.
  // finishWorkout still saves every row with a value in it regardless
  // of whether it's checked. Keyed by ex.name, same convention as
  // setsByExercise, and kept in lockstep with it by addSetRow/
  // removeSetRow below.
  const [checkedByExercise, setCheckedByExercise] = useState<Record<string, boolean[]>>({})
  const [isPending, startTransition] = useTransition()
  // justFinished now drives ONLY the small inline banner above the
  // progress bar (see the percentage-bracket message it shows further
  // down, and the auto-fade effect right below) - the "real"
  // celebration moment moved to a separate blocking modal
  // (celebrationModalOpen below), per Satish's ask for something more
  // immediate/deliberate than a banner someone might not even scroll
  // back up to see.
  const [justFinished, setJustFinished] = useState(false)
  // Blocking modal shown the instant Finish Workout completes - stays
  // open until one of its own two buttons is tapped (no backdrop
  // dismiss, no auto-timeout - Satish's explicit call: "I am thinking
  // of a blocking modal"). Independent of justFinished/the inline
  // banner's own auto-fade lifecycle below - dismissing this modal
  // doesn't touch the banner, and the banner fading out doesn't touch
  // this.
  const [celebrationModalOpen, setCelebrationModalOpen] = useState(false)
  // Randomly-picked appreciation message shown in the modal - picked
  // once per finish (in finishWorkout, see pickCelebration there), not
  // recomputed on every render, so it doesn't change out from under
  // someone still looking at it. null until the first finish of this
  // mount.
  const [celebration, setCelebration] = useState<{ Icon: typeof Sun; text: string } | null>(null)
  // The just-finished day's label, captured at the same moment as
  // celebration (activeCell.label, before finishWorkout nulls
  // activeCell) - used to build the "Post a win" pre-filled post text.
  const [finishedDayLabel, setFinishedDayLabel] = useState<string | null>(null)
  // Blocking modal shown when tapping Discard with something already
  // logged, replacing what used to be a plain window.confirm() - offers
  // "Finish workout" (saves whatever's logged, same as finishWorkout()
  // below) as an explicit alternative to "Discard everything", since
  // Satish's own read was that people default to assuming Discard is
  // the only way out of an active session and don't realize partial
  // progress can be saved instead. Same glass/backdrop modal language
  // already used for the celebration and switch-program modals - no new
  // visual pattern introduced. Gated on the same hasAnyInput check the
  // old confirm() used: nothing logged means nothing to offer to save,
  // so handleCloseSession skips this modal entirely in that case, same
  // as before.
  const [discardModalOpen, setDiscardModalOpen] = useState(false)
  // Drives the inline banner's pop-in/pop-out transition - starts
  // false, flips true one frame after justFinished goes true (so the
  // CSS transition has a "before" state to animate from instead of
  // mounting already at full scale/opacity), stays true for a few
  // seconds, then flips back to false to fade out before the banner
  // unmounts entirely - Satish's ask: "this one can pop up and fade
  // out after a few seconds," specifically so a message picked when it
  // first appeared never lingers and reads as stale if seen much later
  // in the same session.
  const [celebrationVisible, setCelebrationVisible] = useState(false)
  useEffect(() => {
    if (!justFinished) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCelebrationVisible(false)
      return
    }
    setCelebrationVisible(false)
    // Deferred one frame via requestAnimationFrame, not a direct call -
    // this is what actually gives the browser a "false" paint to
    // transition away from, so it doesn't trigger the same
    // set-state-in-effect concern the two synchronous calls above do.
    const showRaf = requestAnimationFrame(() => setCelebrationVisible(true))
    // Starts fading ~5.5s in, fully unmounts at 6s (300ms transition
    // duration plus a small buffer) - a deliberately short, fixed
    // window rather than anything content-length-dependent, per
    // Satish's ask to keep this one simple.
    const hideTimer = setTimeout(() => setCelebrationVisible(false), 5500)
    const unmountTimer = setTimeout(() => setJustFinished(false), 6000)
    return () => {
      cancelAnimationFrame(showRaf)
      clearTimeout(hideTimer)
      clearTimeout(unmountTimer)
    }
  }, [justFinished])
  // Which day rows are expanded inline in the program grid below (task
  // #50+) - a day tapped in its Week N card no longer navigates to a
  // separate screen, it expands in place. A Set (not a single value) so
  // more than one day can stay open at once, per Satish's explicit call
  // ("if they click on another day, that day can also stay elaborate,
  // that is not an issue"). Keyed by Cell.key.
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(new Set())
  // Per-day collapse state for that day's phase sections (warmup/main/
  // cooldown), same collapsible-triangle pattern as the live logging
  // list - keyed by Cell.key since more than one day's expanded content
  // can be on screen simultaneously, unlike the old single previewCell
  // approach. Populated with the warmup/cooldown-collapsed default the
  // moment a day is expanded (see toggleDayExpanded).
  const [expandedDayPhases, setExpandedDayPhases] = useState<
    Record<string, Set<'warmup' | 'main' | 'cooldown'>>
  >({})
  // Which day's Start-mode popup ("Start as a list" / "Start as
  // guided", each with its own short explanation) is currently open -
  // replaces the old one-time-only List-vs-Guided explainer modal.
  // Tapping "Start Workout" inside an expanded day row opens this;
  // tapping either mode inside it is what actually commits into
  // startCell. Shown every time now (not gated to first use), since the
  // explanation living inside the choice itself is the point - "why
  // would anyone click something they don't understand" (Satish).
  const [startPopupCell, setStartPopupCell] = useState<Cell | null>(null)
  // When the current session started - drives the fixed top bar's
  // elapsed-time display (see elapsedSeconds below). Persisted in the
  // draft so a resumed tab keeps counting from the real start rather
  // than restarting at 0.
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // Which exercise names have had a video request sent this page
  // visit - purely local feedback so the button can say "Requested"
  // right away, not a persisted "don't ask again" flag. A fresh visit
  // showing the request option again is fine; the community post
  // itself is the record that matters, not this bit of UI state.
  const [requestedVideos, setRequestedVideos] = useState<Set<string>>(new Set())
  // Which exercise's swap panel is open, keyed by its stable
  // originalName - and what's currently typed into it.
  const [swapPanelFor, setSwapPanelFor] = useState<string | null>(null)
  const [swapInput, setSwapInput] = useState('')
  // Which exercise's "..." overflow menu (Request video / Swap
  // exercise) is open, also keyed by originalName.
  const [overflowOpenFor, setOverflowOpenFor] = useState<string | null>(null)
  // Which exercise's History modal is open - stores the exact
  // currently-displayed name (post-swap, if swapped) plus a display
  // label, since that's what computeExerciseHistory below matches
  // against. Null when closed.
  const [historyFor, setHistoryFor] = useState<{ name: string; label: string } | null>(null)
  // Which exercise's rest-timer preset picker is open (per-card
  // trigger), vs. the timer itself, which is global - only one rest
  // period happens at a time regardless of which card started it, so
  // it's shown once as a sticky bar rather than duplicated per card.
  const [restPickerFor, setRestPickerFor] = useState<string | null>(null)
  const [restTimer, setRestTimer] = useState<{ remaining: number; total: number } | null>(null)
  // Which exercise's coach-notes section is expanded - collapsed by
  // default per card, same per-card-toggle pattern as restPickerFor.
  const [notesOpenFor, setNotesOpenFor] = useState<string | null>(null)
  // Tracks whether the currently-running (or just-finished) shared
  // restTimer belongs to a perSide exercise's own work timer, and
  // which side it's timing - null whenever restTimer is being used for
  // something else (a plain custom timer, the between-exercise rest in
  // guided mode). Keyed by originalName like the other per-card state
  // above.
  const [sideTimerActive, setSideTimerActive] = useState<{
    originalName: string
    timerSeconds: number
    isSecondSide: boolean
  } | null>(null)
  // Set the moment a perSide exercise's first-side timer finishes on
  // its own - shows the "Switch sides" prompt on that exercise's card
  // until they tap through to the second side. Cleared (without ever
  // being set) if the timer is dismissed early instead of let to run
  // out, so backing out of a timer never nags for a second side that
  // was never really started.
  const [awaitingOtherSideFor, setAwaitingOtherSideFor] = useState<string | null>(null)
  // Which phase sections (warmup/main/cooldown) are collapsed in list
  // view - defaults to warmup and cooldown collapsed, main expanded, so
  // the first screen of a day leads with a short "N exercises" summary
  // of warm-up instead of every warm-up move rendered full-size before
  // the actual workout even comes into view. Reset in startCell/the
  // draft-restore effect below, same as the other per-card UI state,
  // so re-opening a day (or a different one) always starts from this
  // same default rather than remembering whatever was left expanded
  // from a previous session.
  const [collapsedPhases, setCollapsedPhases] = useState<Set<'warmup' | 'main' | 'cooldown'>>(
    new Set(['warmup', 'cooldown'])
  )
  function togglePhaseCollapsed(phase: 'warmup' | 'main' | 'cooldown') {
    setCollapsedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }
  // Expands/collapses a day row inline in the program grid. Reads
  // expandedDayKeys directly rather than inside a setState updater
  // (this only ever runs from a click handler, not during render) so it
  // can also seed that day's phase-collapse defaults the moment it's
  // opened - mirrors the old openPreview's reset-on-open behavior, just
  // per-day now instead of a single shared previewCell.
  function toggleDayExpanded(cell: Cell) {
    const isExpanded = expandedDayKeys.has(cell.key)
    if (isExpanded) {
      setExpandedDayKeys((prev) => {
        const next = new Set(prev)
        next.delete(cell.key)
        return next
      })
    } else {
      setExpandedDayKeys((prev) => new Set(prev).add(cell.key))
      setExpandedDayPhases((prev) => ({ ...prev, [cell.key]: new Set(['warmup', 'cooldown']) }))
    }
  }
  function toggleDayPhaseCollapsed(cellKey: string, phase: 'warmup' | 'main' | 'cooldown') {
    setExpandedDayPhases((prev) => {
      const current = prev[cellKey] ?? new Set(['warmup', 'cooldown'])
      const next = new Set(current)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return { ...prev, [cellKey]: next }
    })
  }
  const restoredRef = useRef(false)
  // Guided one-at-a-time player state, only relevant on round-based
  // days (see hasGuidedFlow below) - single-exercise days ignore all of this.
  // Every day always lands on the list first (an overview of what's
  // coming, not the player) - guided mode is only ever entered by
  // explicitly tapping "Switch to guided view"/"Continue", never the
  // default on arrival. guidedIndex/Phase are per-session. 'roundIntro'
  // is the "Round N starts" interstitial shown on the first exercise of each
  // round; 'done' is reached after the last exercise (rest or not)
  // with nothing left to advance to.
  const [viewMode, setViewMode] = useState<'guided' | 'list'>('list')
  const [guidedIndex, setGuidedIndex] = useState(0)
  const [guidedPhase, setGuidedPhase] = useState<'roundIntro' | 'exercise' | 'rest' | 'done'>('exercise')
  // True once Done has been tapped while something's still missing for
  // the current guided step (a whole exercise untouched, or just one
  // set among several) and the "some values are missing" nudge is
  // showing - a second tap on Done (now relabeled "Continue anyway")
  // proceeds regardless. Reset below whenever guidedIndex changes, so
  // it never carries over and silently pre-confirms the next exercise.
  const [confirmEmptyDone, setConfirmEmptyDone] = useState(false)
  useEffect(() => {
    // Legitimate use of an effect here - this is syncing local UI state
    // to an external-ish signal (which guided step we're on), not
    // computable during render, and setting it to the same `false` it
    // already was on every non-step-changing render is a harmless
    // no-op bailout. Same category of exception as the file's other
    // known set-state-in-effect baseline below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmEmptyDone(false)
  }, [guidedIndex])
  // Whole-day counterpart to confirmEmptyDone, for Finish Workout
  // rather than a single guided step. True once Finish Workout has been
  // tapped while anything in the day is still missing - forces list
  // view (so the warning banner and per-card highlights below are
  // actually visible, since guided mode only ever shows one exercise at
  // a time) and scrolls back to the top so the banner isn't landed on
  // mid-scroll and missed. A second tap (either the bottom Finish
  // Workout bar, now relabeled, or the "Finish anyway" button inside
  // the banner itself) proceeds regardless. Reset on session
  // start/discard (see startCell/handleCloseSession), not on any
  // per-step change - this one persists across the whole day on
  // purpose.
  const [missingValuesFlagged, setMissingValuesFlagged] = useState(false)
  // Tracks the previous render's restTimer so the effect below can
  // tell "a running timer just reached zero on its own" apart from
  // "there was never a timer running" - only the former should
  // auto-advance the guided player.
  const prevRestTimerRef = useRef<{ remaining: number; total: number } | null>(null)

  // One interval for the whole lifetime of a running timer, not
  // recreated every tick - keyed on the null/non-null transition
  // rather than the timer object itself (which changes every second),
  // so starting a new preset mid-countdown just keeps using the same
  // interval instead of restarting it.
  useEffect(() => {
    if (!restTimer) return
    const id = setInterval(() => {
      setRestTimer((prev) => {
        if (!prev) return prev
        const next = prev.remaining - 1
        if (next === 3 || next === 2 || next === 1) {
          playRestBeep()
        }
        return next <= 0 ? null : { ...prev, remaining: next }
      })
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restTimer === null])

  // Ticks the fixed top bar's elapsed-session clock once a second while
  // a day is actually open - separate from restTimer's own interval
  // above since this one runs continuously for the whole session
  // rather than counting down a fixed amount and stopping.
  useEffect(() => {
    // No reset-to-0 branch here on purpose: elapsedSeconds is only ever
    // rendered inside the active-day view, so a stale value sitting
    // around while activeCell is null is never actually seen - the
    // next session just overwrites it the moment this effect re-runs
    // with a fresh sessionStartedAt.
    if (!activeCell || sessionStartedAt == null) return
    // Sets the display immediately (not just once the first interval
    // tick fires a second later) - same intentional sync-setState-in-
    // effect pattern the restTimer interval effect above already uses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsedSeconds(Math.floor((Date.now() - sessionStartedAt) / 1000))
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [activeCell, sessionStartedAt])

  function startRestTimer(seconds: number) {
    // Any plain/rest timer start means whatever perSide timer might
    // have been running is no longer what's running - clearing this
    // here (rather than only in the dedicated dismiss button) covers
    // every other way a new timer can start over an old one: a custom
    // preset, a between-round rest, the guided player's post-exercise
    // rest.
    setSideTimerActive(null)
    setRestTimer({ remaining: seconds, total: seconds })
    setRestPickerFor(null)
  }

  // Starts (or restarts) the work timer for one side of a perSide
  // exercise. Deliberately doesn't call startRestTimer - that would
  // immediately null out the sideTimerActive this function just set,
  // since state updates from this render batch together and the last
  // one wins.
  function startSideTimer(ex: CellExercise, isSecondSide: boolean) {
    setAwaitingOtherSideFor(null)
    setSideTimerActive({ originalName: ex.originalName, timerSeconds: ex.timerSeconds!, isSecondSide })
    setRestTimer({ remaining: ex.timerSeconds!, total: ex.timerSeconds! })
    setRestPickerFor(null)
  }

  function adjustRestTimer(deltaSeconds: number) {
    setRestTimer((prev) => (prev ? { ...prev, remaining: Math.max(0, prev.remaining + deltaSeconds) } : prev))
  }

  function handleRequestVideo(exerciseName: string) {
    setRequestedVideos((prev) => new Set(prev).add(exerciseName))
    startTransition(() => {
      requestExerciseVideo(exerciseName)
    })
  }

  // Every completed session's sets, across every program, are already
  // fetched for the Completed Workouts tab (see the `history` prop,
  // sourced from workouts/page.tsx) - no separate query needed here,
  // just re-slice that same data exercise-first instead of session-
  // first. Matches by normalizeExerciseIdentity so straight-set/round
  // suffix variants roll up, but a swapped-to name stays its own
  // separate thread (see normalizeExerciseIdentity's comment). Sorted
  // most-recent-first, same convention as WorkoutHistoryList.
  function computeExerciseHistory(exerciseName: string): ExerciseHistoryEntry[] {
    const target = normalizeExerciseIdentity(exerciseName)
    const entries: ExerciseHistoryEntry[] = []
    for (const group of history) {
      for (const session of group.sessions) {
        const sets = session.sets
          .filter((s) => normalizeExerciseIdentity(s.exerciseName) === target)
          .sort((a, b) => a.setNumber - b.setNumber)
        if (sets.length === 0) continue
        entries.push({
          sessionId: session.id,
          week: session.week,
          day: session.day,
          label: session.label,
          completedAt: session.completedAt,
          isCurrent: group.isCurrent,
          sets,
        })
      }
    }
    entries.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    return entries
  }

  // Moves the guided player forward one exercise, landing on
  // 'roundIntro' if that next exercise starts a new round or plain
  // 'exercise' otherwise. Reads activeCell/guidedIndex fresh each call
  // rather than via functional state updates, which is fine since this
  // only ever runs from a click handler or the auto-advance effect
  // below, never concurrently with itself.
  function advanceGuided() {
    if (!activeCell) return
    const groups = buildListGroups(activeCell.exercises)
    const nextIndex = guidedIndex + 1
    if (nextIndex >= groups.length) {
      setGuidedPhase('done')
      return
    }
    setGuidedIndex(nextIndex)
    setGuidedPhase(
      isFirstOfRoundGroups(groups, nextIndex) || isFirstOfPhaseGroups(groups, nextIndex)
        ? 'roundIntro'
        : 'exercise'
    )
  }

  // Tapping "Done" on the current guided step. A straight-set group
  // (more than one set shown together on the same big card, see task
  // #30) never forces a rest interstitial between sets or before the
  // next exercise - Satish's call was that an automatic rest screen
  // doesn't make sense there ("it's not like a random timer... most
  // people will just wait"); each set row keeps its own optional rest
  // button instead (same as list view), so resting is available but
  // never gates moving on. A single round exercise still starts its
  // configured rest and shows the rest screen, exactly as before.
  function handleGuidedDone(group: CellExercise[]) {
    markGroupChecked(group)
    if (group.length > 1) {
      advanceGuided()
      return
    }
    const ex = group[0]
    if (ex.restSeconds != null) {
      startRestTimer(ex.restSeconds)
      setGuidedPhase('rest')
    } else {
      advanceGuided()
    }
  }

  function toggleViewMode() {
    // Switching TO guided view is treated as "I'm going back to keep
    // working, not finish" - clears missingValuesFlagged (see
    // handleFinishClick) so the next Finish Workout tap re-checks from
    // scratch instead of staying permanently in "finish anyway, no
    // recheck" mode for the rest of the session. Not read via setViewMode's
    // updater callback (which would call a second setState from inside
    // another's updater) - viewMode is read directly since this only ever
    // runs from an event handler, where it's guaranteed current.
    const next = viewMode === 'guided' ? 'list' : 'guided'
    if (next === 'guided') setMissingValuesFlagged(false)
    setViewMode(next)
  }

  // Auto-advances the guided player the moment a rest countdown it
  // started reaches zero on its own - the transition from "was
  // running" to "now null" only happens once, naturally, when the
  // interval counts down past 0 (see the interval effect above).
  // Tapping "Skip rest" just nulls restTimer directly, which lands
  // here too, so there's only one advance path instead of two.
  useEffect(() => {
    if (guidedPhase === 'rest' && prevRestTimerRef.current && !restTimer) {
      advanceGuided()
    }
    prevRestTimerRef.current = restTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restTimer, guidedPhase])

  // Own ref, separate from prevRestTimerRef above - deliberately not
  // sharing one, since both effects run on every restTimer change and
  // each needs to see the *pre-this-render* value independently rather
  // than racing over which one updates the shared ref first.
  const prevRestTimerForSideRef = useRef<{ remaining: number; total: number } | null>(null)

  // Detects a perSide work timer running out on its own (as opposed to
  // being dismissed early - the dismiss button clears sideTimerActive
  // itself, so by the time this runs there's nothing left to react to)
  // and either prompts for the other side or, if this was already the
  // second side, wraps the exercise up.
  useEffect(() => {
    if (sideTimerActive && prevRestTimerForSideRef.current && !restTimer) {
      setAwaitingOtherSideFor(sideTimerActive.isSecondSide ? null : sideTimerActive.originalName)
      setSideTimerActive(null)
    }
    prevRestTimerForSideRef.current = restTimer
  }, [restTimer, sideTimerActive])

  const completedSet = new Set(completedCells)

  // Each authored day is its own real week/day slot, shown exactly
  // once - sorted so program order (and therefore "up next") is
  // correct regardless of the order rows happened to be inserted in.
  const allCells: Cell[] = [...days]
    .sort((a, b) => a.week - b.week || a.day - b.day)
    .map((day) => ({
      key: `${day.week}-${day.day}`,
      week: day.week,
      day: day.day,
      label: day.label,
      notes: day.notes,
      exercises: resolveExercises(day, day.week, swaps),
    }))

  const weekNumbers = Array.from(new Set(allCells.map((c) => c.week))).sort((a, b) => a - b)

  const nextDueKey = allCells.find((c) => !completedSet.has(c.key))?.key
  const programComplete = !nextDueKey

  // Resume a draft left over from a closed tab or refresh - runs once
  // on mount only. Deliberately not re-run on every allCells rebuild
  // (a new array is constructed every render) since that would fight
  // with someone actively picking a fresh cell right after landing.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const draft = loadDraft(generationId)
    if (!draft) return
    if (allCells.some((c) => c.key === draft.cell.key)) {
      // draft.startedAt is only ever missing on a draft saved before
      // the elapsed-timer field existed - falling back to "now" just
      // means that one old draft's clock starts over, not a crash.
      // This whole effect only ever runs once, gated by restoredRef,
      // so this Date.now() can't produce the "unstable across
      // re-renders" result the purity rule is guarding against.
      // eslint-disable-next-line react-hooks/purity
      const resumedStartedAt = draft.startedAt ?? Date.now()
      setActiveCell(draft.cell)
      setSetsByExercise(draft.sets)
      setCheckedByExercise(draft.checked ?? {})
      setSessionStartedAt(resumedStartedAt)
      setCollapsedPhases(new Set(['warmup', 'cooldown']))
      const groups = buildListGroups(draft.cell.exercises)
      const index = draft.guidedIndex ?? 0
      setGuidedIndex(index)
      setGuidedPhase(
        isFirstOfRoundGroups(groups, index) || isFirstOfPhaseGroups(groups, index) ? 'roundIntro' : 'exercise'
      )
      setViewMode('list')
    } else {
      // Stale draft (plan regenerated since, cell no longer exists) -
      // discard rather than resuming into something that's gone.
      clearDraft(generationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keeps the draft in sync with every change while a session's open
  // - this is what actually makes the resume above possible.
  useEffect(() => {
    if (!activeCell || sessionStartedAt == null) return
    saveDraft(generationId, activeCell, setsByExercise, guidedIndex, checkedByExercise, sessionStartedAt)
  }, [generationId, activeCell, setsByExercise, guidedIndex, checkedByExercise, sessionStartedAt])

  // mode defaults to 'list' for anywhere that isn't the Start-mode
  // popup's two buttons (commitStart) - every existing caller (resuming
  // a draft, the old "Start Now" flow) keeps landing in list view first,
  // same as before.
  function startCell(cell: Cell, mode: 'list' | 'guided' = 'list') {
    // Pre-fill one row per target set (e.g. "3-5" -> 3 rows) - just a
    // starting point, the +/- controls below let them adjust freely.
    const initial: Record<string, SetRow[]> = {}
    const initialChecked: Record<string, boolean[]> = {}
    for (const ex of cell.exercises) {
      const count = parseTargetSetCount(ex.sets)
      initial[ex.name] = Array.from({ length: count }, () => ({ weight: '', reps: '' }))
      initialChecked[ex.name] = Array.from({ length: count }, () => false)
    }
    setSetsByExercise(initial)
    setCheckedByExercise(initialChecked)
    setSessionStartedAt(Date.now())
    setActiveCell(cell)
    setJustFinished(false)
    setSwapPanelFor(null)
    setSwapInput('')
    setOverflowOpenFor(null)
    setRestPickerFor(null)
    setRestTimer(null)
    setCollapsedPhases(new Set(['warmup', 'cooldown']))
    setGuidedIndex(0)
    setMissingValuesFlagged(false)
    const groups = buildListGroups(cell.exercises)
    setGuidedPhase(isFirstOfRoundGroups(groups, 0) || isFirstOfPhaseGroups(groups, 0) ? 'roundIntro' : 'exercise')
    setViewMode(cell.exercises.length > 1 ? mode : 'list')
  }

  // Single close action for the session - replaces what used to be
  // two separate controls ("Back to your program" + "Discard
  // workout") that said almost the same thing in two places. Silent
  // if nothing's been typed yet (nothing to lose - discardSession runs
  // immediately, same as before), otherwise opens the discard/finish
  // choice modal instead of a plain confirm() - see discardModalOpen's
  // own comment above for why.
  function handleCloseSession() {
    const hasAnyInput = Object.values(setsByExercise).some((rows) =>
      rows.some((r) => r.weight.trim() !== '' || r.reps.trim() !== '')
    )
    if (hasAnyInput) {
      setDiscardModalOpen(true)
      return
    }
    discardSession()
  }

  // The actual destructive action, split out from handleCloseSession so
  // both the no-input fast path above and the discard modal's "Discard
  // everything" button can call it directly.
  function discardSession() {
    clearDraft(generationId)
    setActiveCell(null)
    setSessionStartedAt(null)
    setSwapPanelFor(null)
    setSwapInput('')
    setOverflowOpenFor(null)
    setRestPickerFor(null)
    setRestTimer(null)
    setGuidedIndex(0)
    setGuidedPhase('exercise')
    setViewMode('list')
    setMissingValuesFlagged(false)
    setDiscardModalOpen(false)
  }

  function handleSwap(ex: CellExercise, week: number, applyToAllWeeks: boolean) {
    const newName = swapInput.trim()
    if (!newName || !activeCell) return

    // Migrate any already-entered sets from the old display key to
    // the new one, rather than losing them.
    setSetsByExercise((prev) => {
      const rows = prev[ex.name] || []
      const next = { ...prev }
      delete next[ex.name]
      next[newName] = rows
      return next
    })

    // Update the active cell locally so the swap shows immediately,
    // instead of waiting on the revalidatePath round-trip.
    setActiveCell((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((e) =>
              e.originalName === ex.originalName ? { ...e, name: newName } : e
            ),
          }
        : prev
    )

    setSwapPanelFor(null)
    setSwapInput('')

    startTransition(() => {
      swapExercise({
        generationId,
        day: activeCell.day,
        weekNumber: applyToAllWeeks ? 0 : week,
        originalExerciseName: ex.originalName,
        newExerciseName: newName,
        sets: ex.sets,
        reps: ex.reps,
      })
    })
  }

  function updateSet(exerciseName: string, index: number, field: keyof SetRow, value: string) {
    setSetsByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, [exerciseName]: rows }
    })
    // Same reasoning as toggleViewMode above - typing into ANY set
    // value (not just a flagged-missing one) clears the whole-day
    // missing-values flag immediately, rather than requiring every
    // missing field to be filled first. Finish Workout just re-checks
    // fresh from scratch next time it's tapped, so nothing is lost by
    // clearing eagerly here.
    setMissingValuesFlagged(false)
  }

  function addSetRow(exerciseName: string) {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseName]: [...(prev[exerciseName] || []), { weight: '', reps: '' }],
    }))
    setCheckedByExercise((prev) => ({
      ...prev,
      [exerciseName]: [...(prev[exerciseName] || []), false],
    }))
  }

  function removeSetRow(exerciseName: string, index: number) {
    setSetsByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows.splice(index, 1)
      return { ...prev, [exerciseName]: rows }
    })
    setCheckedByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows.splice(index, 1)
      return { ...prev, [exerciseName]: rows }
    })
  }

  // Straight-set groups (renderGroupedCard) don't get the same per-row
  // add/remove as a round exercise (see removeSetRow above) - each
  // position in the group is its own distinct CellExercise entry (a
  // unique originalName, e.g. "Squats (1)", "(2)", "(3)"), not another
  // row against one shared name. Adding a set here means synthesizing a
  // new entry and splicing it into activeCell.exercises itself, right
  // after the group's current last member - finishWorkout only ever
  // saves setsByExercise rows for names that actually exist in
  // activeCell.exercises, so a row added any other way would silently
  // never save.
  function addStraightSet(group: CellExercise[]) {
    const last = group[group.length - 1]
    const newName = `${baseName(last.name)} (${group.length + 1})`
    const newExercise: CellExercise = {
      originalName: newName,
      name: newName,
      sets: '1',
      reps: last.reps,
      trackWeight: last.trackWeight,
      restSeconds: last.restSeconds,
      timerSeconds: last.timerSeconds,
      phase: last.phase,
      perSide: last.perSide,
    }
    setActiveCell((prev) => {
      if (!prev) return prev
      const index = prev.exercises.findIndex((e) => e.originalName === last.originalName)
      if (index === -1) return prev
      const exercises = [...prev.exercises]
      exercises.splice(index + 1, 0, newExercise)
      return { ...prev, exercises }
    })
    setSetsByExercise((prev) => ({ ...prev, [newName]: [{ weight: '', reps: '' }] }))
    setCheckedByExercise((prev) => ({ ...prev, [newName]: [false] }))
  }

  // Undoes the most recent addStraightSet - removes the group's current
  // last member entirely (not just its logged values), same as how it
  // was added. Never removes the only remaining set in the group.
  function removeStraightSet(group: CellExercise[]) {
    if (group.length <= 1) return
    const last = group[group.length - 1]
    setActiveCell((prev) =>
      prev ? { ...prev, exercises: prev.exercises.filter((e) => e.originalName !== last.originalName) } : prev
    )
    setSetsByExercise((prev) => {
      const next = { ...prev }
      delete next[last.name]
      return next
    })
    setCheckedByExercise((prev) => {
      const next = { ...prev }
      delete next[last.name]
      return next
    })
  }

  // Purely visual progress markers - see checkedByExercise above.
  // toggleAllChecked checks every set at once if any are unchecked, or
  // unchecks all of them if every set was already checked (so tapping
  // it a second time is an easy undo rather than a dead end).
  function toggleSetChecked(exerciseName: string, index: number) {
    setCheckedByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows[index] = !rows[index]
      return { ...prev, [exerciseName]: rows }
    })
  }

  function toggleAllChecked(exerciseName: string, count: number) {
    setCheckedByExercise((prev) => {
      const rows = prev[exerciseName] || []
      const allChecked = rows.length === count && rows.every(Boolean)
      return { ...prev, [exerciseName]: Array.from({ length: count }, () => !allChecked) }
    })
  }

  // Unconditionally marks every set row of every exercise in a guided
  // step as checked (not a toggle) - called whenever Done is tapped, so
  // the top progress bar (driven entirely by checkedByExercise, see
  // progressFraction above) always advances when you move past an
  // exercise in guided mode, regardless of whether any checkmark was
  // ever manually tapped. Needed because single-row guided screens (a
  // round instance, or a straight-set exercise with just one set) no
  // longer show a checkmark UI at all - Done is the only "I finished
  // this" signal there is for those now, so it has to be the thing that
  // sets this state, or progress silently never moves (the bug Satish
  // flagged). Also quietly closes a latent gap on multi-row guided
  // screens, where someone could fill in every set's numbers without
  // ever tapping the individual checkmarks.
  function markGroupChecked(group: CellExercise[]) {
    setCheckedByExercise((prev) => {
      const next = { ...prev }
      for (const ex of group) {
        const count = setsByExercise[ex.name]?.length ?? 1
        next[ex.name] = Array.from({ length: count }, () => true)
      }
      return next
    })
  }

  // True when a single exercise has a row missing a value it should
  // have - weight (if this exercise tracks weight) and/or reps. Shared
  // by both the per-exercise Done nudge (groupHasMissingValues below)
  // and the whole-day Finish Workout check (getMissingExercises below)
  // so there's exactly one definition of "incomplete" in the file.
  function exerciseIsMissingValues(ex: CellExercise): boolean {
    const rows = setsByExercise[ex.name] || []
    if (rows.length === 0) return true
    return rows.some((row) => (ex.trackWeight !== false && !row.weight) || !row.reps)
  }

  // True when at least one exercise in the group is missing a value.
  // Catches a partial miss (set 1 logged, set 2 left blank - easy to do
  // on a multi-set grouped screen) as well as a completely untouched
  // screen, not just the all-or-nothing case. Satish's correction: the
  // original version only ever caught a fully empty exercise, which
  // missed the more common case of forgetting just one set among
  // several.
  function groupHasMissingValues(group: CellExercise[]): boolean {
    return group.some(exerciseIsMissingValues)
  }

  // Whole-day version, used by Finish Workout - every exercise across
  // every phase/round, not just the current guided step. Returns the
  // actual exercises (not just a boolean) so the warning banner can
  // name them and their cards can be highlighted in list view.
  function getMissingExercises(list: CellExercise[]): CellExercise[] {
    return list.filter(exerciseIsMissingValues)
  }

  // Wraps handleGuidedDone with the "some values are missing" soft
  // nudge - Satish's ask: not a hard block, just a visible check so an
  // incomplete tap isn't silent. First tap while anything's missing
  // shows the inline banner (and, via the border-highlight logic in
  // renderExerciseCard/renderGroupedCard's inputs, highlights exactly
  // which fields are empty) and relabels Done to "Continue anyway"
  // instead of advancing; the second tap (confirmEmptyDone already
  // true) goes through exactly like a normal Done tap.
  function handleDoneClick(group: CellExercise[]) {
    if (!confirmEmptyDone && groupHasMissingValues(group)) {
      setConfirmEmptyDone(true)
      return
    }
    handleGuidedDone(group)
  }

  // "Start Workout" inside an expanded day row opens the mode-choice
  // popup - doesn't start anything itself.
  function openStartPopup(cell: Cell) {
    setStartPopupCell(cell)
  }
  function closeStartPopup() {
    setStartPopupCell(null)
  }
  // Either mode inside the popup was tapped - this is what actually
  // enters the session.
  function commitStart(cell: Cell, mode: 'list' | 'guided') {
    setStartPopupCell(null)
    startCell(cell, mode)
  }

  // Picks one appreciation message for the celebration shown alongside
  // justFinished - a mixed pool of always-eligible generic lines plus
  // two conditional ones that only enter the pool when they're actually
  // true (a real 2+ day streak, or this week having any assigned days
  // at all). Random pick every time, including when a conditional one
  // is eligible - Satish's explicit call ("even in back-to-back, it
  // doesn't need to be all the time... a random motivation note
  // generator"), so a real streak doesn't always win out over the
  // generic pool.
  //
  // Computed here (inside finishWorkout, using activeCell/allCells/
  // completedSet/history directly) rather than reusing currentWeek/
  // totalCells/doneCells from the program-overview render below -
  // those are declared AFTER the `if (activeCell) { ... return }`
  // branch this function lives in, so they're never initialized during
  // any render where activeCell is truthy (which is always, whenever
  // Finish Workout is actually clickable). activeCell.week is also
  // simply the more correct scope here anyway - "this week" means the
  // week of the day just finished, not wherever the overview's
  // next-due pointer happens to sit.
  function pickCelebration(cell: Cell): { Icon: typeof Sun; text: string } {
    const weekCells = allCells.filter((c) => c.week === cell.week)
    const weekTotal = weekCells.length
    // completedSet reflects state from BEFORE this save (completedCells
    // hasn't refreshed from the server yet) - add 1 for the day just
    // finished, unless it was already marked done (re-logging an
    // already-completed day shouldn't double-count).
    const alreadyCounted = completedSet.has(cell.key)
    const weekDone = weekCells.filter((c) => completedSet.has(c.key)).length + (alreadyCounted ? 0 : 1)
    const streak = computeBackToBackStreak(history)

    const pool: { Icon: typeof Sun; text: string }[] = [
      { Icon: Trophy, text: 'That was a strong session!' },
      { Icon: ThumbsUp, text: "Let's go - another one done!" },
      { Icon: Sparkles, text: 'Nice work - you showed up today!' },
      { Icon: Rocket, text: "Great day - momentum's building!" },
    ]
    if (streak >= 2) {
      pool.push({
        Icon: PartyPopper,
        text: `${streak} workouts back-to-back. ${streak <= 3 ? 'Nice' : 'Great'} streak!`,
      })
    }
    if (weekTotal > 0) {
      pool.push({ Icon: Medal, text: `${weekDone} of ${weekTotal} this week - great pace!` })
    }
    return pool[Math.floor(Math.random() * pool.length)]
  }

  function finishWorkout() {
    if (!activeCell) return
    const sets = activeCell.exercises.flatMap((ex) =>
      (setsByExercise[ex.name] || []).map((row, i) => ({
        exerciseName: ex.name,
        setNumber: i + 1,
        weight: row.weight.trim() === '' ? null : Number(row.weight),
        reps: row.reps.trim() === '' ? null : Number(row.reps),
      }))
    )
    const celebrationPick = pickCelebration(activeCell)
    const dayLabel = activeCell.label

    startTransition(async () => {
      await logWorkoutSession({
        generationId,
        week: activeCell.week,
        day: activeCell.day,
        dayLabel: activeCell.label,
        sets,
      })
      clearDraft(generationId)
      setActiveCell(null)
      setJustFinished(true)
      setCelebration(celebrationPick)
      setFinishedDayLabel(dayLabel)
      setCelebrationModalOpen(true)
      setRestTimer(null)
    })
  }

  // Wraps finishWorkout with the same soft-nudge shape as Done, but
  // scoped to the whole day rather than one guided step. First tap
  // while anything's missing doesn't finish at all - it switches to
  // list view (guided mode only shows one exercise at a time, so
  // there's nothing useful to highlight there), scrolls back to the
  // top so the warning banner is immediately visible instead of
  // wherever the scroll happened to be, and flags missingValuesFlagged
  // so the banner and per-card highlights render. Second tap (or the
  // banner's own "Finish anyway" button, which calls finishWorkout
  // directly) goes through.
  function handleFinishClick() {
    if (!activeCell) return
    if (!missingValuesFlagged && getMissingExercises(activeCell.exercises).length > 0) {
      setViewMode('list')
      setMissingValuesFlagged(true)
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }
    finishWorkout()
  }

  if (activeCell) {
    // Suggestions only, not a restriction - the input still accepts
    // free text, this just surfaces exercises we already have videos
    // for so a swap is more likely to land somewhere they can
    // immediately watch a demo.
    const exerciseSuggestions = Array.from(new Set(videos.map((v) => v.exerciseName))).sort()

    // Only computed while the History modal is actually open - cheap
    // either way (history is already in memory, see the `history` prop
    // comment above computeExerciseHistory), but no point re-deriving
    // the chart's min/max on every render otherwise.
    const historyEntries = historyFor ? computeExerciseHistory(historyFor.name) : []
    const historyChartPoints = historyEntries
      .slice()
      .reverse() // entries are most-recent-first; chart reads oldest -> newest, left to right
      .filter((e) => e.sets.some((s) => s.weight != null))
      .map((e) => ({
        date: e.completedAt,
        weight: Math.max(...e.sets.map((s) => s.weight ?? 0)),
      }))

    const exercises = activeCell.exercises
    // The guided player isn't circuit-specific - stepping through one
    // thing at a time with a rest screen in between works just as
    // well for straight sets (unrolled the same way rounds are - see
    // seed content) as it does for circuits. It's only offered when
    // there's more than one step to move through; a single-exercise
    // day (or a rest day with none at all) only ever shows the plain
    // list, no "Start Now" button, since there's nothing to step
    // through. round is still used separately, purely to decide
    // whether a "Round N starts" interstitial appears - most straight-
    // set content won't set it at all, and that's fine, it just skips
    // straight from rest into the next set with no announcement.
    const hasGuidedFlow = exercises.length > 1
    const effectiveMode: 'guided' | 'list' = hasGuidedFlow ? viewMode : 'list'
    const totalRounds = new Set(
      exercises.map((ex) => ex.round).filter((r): r is number => r != null)
    ).size
    // List-view-only grouping: consecutive non-round entries sharing a
    // base name (Squats (1), (2), (3)) are one visual card with
    // stacked set rows, instead of three near-identical cards in a
    // row. Round-tagged entries never merge (their names carry "Round
    // N", not a bare "(N)"), so they always come through as their own
    // singleton group and render exactly as before. The guided player
    // now walks this exact same grouping one step at a time (see
    // buildListGroups) rather than the raw exercises array, so a
    // straight-set run is one guided screen too (task #30) instead of
    // three near-identical ones in a row.
    const listGroups = buildListGroups(exercises)
    // This step's group in the guided player - a single round exercise
    // (length 1) or a whole straight-set run shown together (length >
    // 1, see renderGroupedCard's large mode below).
    const currentGroup: CellExercise[] = listGroups[guidedIndex] ?? []
    const currentEx: CellExercise | undefined = currentGroup[0]
    const isGroupedGuidedStep = currentGroup.length > 1
    const currentRound = currentEx?.round ?? null
    const roundExercises = currentRound != null ? exercises.filter((ex) => ex.round === currentRound) : []
    const posInRound = currentEx ? roundExercises.indexOf(currentEx) + 1 : 0
    // One outer box per round occurrence (task #29) - consecutive
    // listGroups sharing the same round number (each already a
    // singleton, since round-tagged entries never merge in listGroups
    // above) collapse into one array here, rendered as one glass card
    // with every exercise in that round as an internal row instead of
    // several near-identical stacked cards. Straight-set groups
    // (round == null) are left exactly as they are - this only ever
    // touches round-tagged content.
    const roundBoxes: CellExercise[][][] = []
    for (const group of listGroups) {
      const round = group[0].round
      const prevBox = roundBoxes[roundBoxes.length - 1]
      if (round != null && prevBox && prevBox[0][0].round === round) {
        prevBox.push(group)
      } else {
        roundBoxes.push([group])
      }
    }
    // List-view-only phase sectioning, one level up from listGroups
    // above - consecutive groups sharing a phase become one collapsible
    // "Warm-up"/"Main workout"/"Cool-down" section (see collapsedPhases
    // state) instead of every exercise flowing together with no signal
    // of which part of the day you're looking at. Content that never
    // sets phase (phase undefined on every exercise) collapses to a
    // single null-phase section with no header/toggle at all, so older
    // programs that don't use warmup/main/cooldown render exactly as
    // they did before this existed. Built from roundBoxes rather than
    // listGroups directly so a round box is never split across two
    // phase sections.
    const phaseSections: { phase: 'warmup' | 'main' | 'cooldown' | null; boxes: CellExercise[][][] }[] = []
    for (const box of roundBoxes) {
      const phase = box[0][0].phase ?? null
      const prevSection = phaseSections[phaseSections.length - 1]
      if (prevSection && prevSection.phase === phase) {
        prevSection.boxes.push(box)
      } else {
        phaseSections.push({ phase, boxes: [box] })
      }
    }
    // Only rendered while the roundIntro screen is showing - whether
    // *this* transition is a phase change (warmup->main->cooldown) as
    // opposed to just a same-phase round bump (round 2, 3... within
    // main). Phase takes headline priority when both happen at once
    // (main phase's round 1), since "Time for the main workout" says
    // more than "Round 1 starts" would on its own.
    const introIsPhaseFirst = isFirstOfPhaseGroups(listGroups, guidedIndex)
    const introPhase = introIsPhaseFirst ? currentEx?.phase ?? null : null
    // Drives the fixed top bar's progress fill (task #32) - one unit
    // per exercise instance (matches setsByExercise/checkedByExercise's
    // keying), "done" meaning every one of that exercise's sets is
    // checked off, not just logged. Deliberately per-exercise rather
    // than per-set: a round with 3 exercises and a straight-set run
    // with 3 sets should both read as "3 things to get through," not
    // wildly different granularities.
    const completedExerciseUnits = exercises.filter((ex) => {
      const rows = checkedByExercise[ex.name]
      return !!rows && rows.length > 0 && rows.every(Boolean)
    }).length
    const progressFraction = exercises.length > 0 ? completedExerciseUnits / exercises.length : 0

    // Standard "rest between two sets/exercises" prompt - a plain label
    // (icon + "Rest for Xmin") on the left, separate from the actual
    // "Start" action on the right, rather than making the label text
    // itself the tap target. Splitting these apart is what Satish
    // pointed to in Trainerize's own rest row as the clearer pattern -
    // no ambiguity about whether the text is informational or a
    // button, since only "Start" is. Used for every "rest between
    // things" spot: straight-set cards, inside a round box, and
    // between two round boxes.
    function renderRestPill(seconds: number) {
      return (
        <div className="flex items-center justify-between gap-2 bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
            <Timer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Rest for {formatDurationLabel(seconds)}</span>
          </div>
          <button
            onClick={() => startRestTimer(seconds)}
            className="flex items-center gap-1 shrink-0 text-orange-400 hover:text-orange-300 text-xs font-medium border border-orange-500/40 rounded-full px-2.5 py-1 transition"
          >
            <Play className="w-3 h-3" fill="currentColor" aria-hidden="true" />
            Start
          </button>
        </div>
      )
    }

    // Minimal hand-rolled SVG line chart for the History modal - top
    // weight logged per session, oldest to newest left-to-right. No
    // charting library added for this (the app has none so far); a
    // plain polyline is all "top weight over time" needs. Callers
    // should only invoke this with 2+ points - a single point has no
    // line to draw and isn't worth a chart.
    function renderWeightChart(points: { date: string; weight: number }[]) {
      const width = 300
      const height = 90
      const padX = 10
      const padY = 14
      const weights = points.map((p) => p.weight)
      const minW = Math.min(...weights)
      const maxW = Math.max(...weights)
      const range = maxW - minW || 1
      const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0
      const coords = points.map((p, i) => ({
        x: padX + i * stepX,
        y: padY + (1 - (p.weight - minW) / range) * (height - padY * 2),
      }))
      const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
      return (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-zinc-500 text-[11px] uppercase tracking-wider font-semibold">
              Top weight over time
            </span>
            <span className="text-zinc-500 text-[11px]">
              {minW === maxW ? minW : `${minW}–${maxW}`}
            </span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" preserveAspectRatio="none">
            <path
              d={pathD}
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="#f97316" />
            ))}
          </svg>
        </div>
      )
    }

    // The interactive body of a single exercise - video/timer/overflow
    // row, swap panel, rest picker, and the set-logging inputs. Shared
    // between the list view (one per card, all shown at once) and the
    // guided view (just the current one, rendered larger since it's
    // the sole focus of the screen there) so neither mode duplicates
    // this logic. Rest is deliberately not shown inline here anymore -
    // list view surfaces it as a strip between cards instead (see
    // below), and guided view's "Done" button already states it.
    function renderExerciseCard(ex: CellExercise, options?: { large?: boolean; boxed?: boolean }) {
      const large = options?.large ?? false
      // boxed=false is used inside a round box (see the "one box per
      // round" grouping above) - the outer glass/rounded/padding treatment
      // is owned by the round box itself in that case, so this just
      // renders its own content flush, with a lighter top divider taking
      // the place of a full separate card. Every other control on the
      // card (video, timer, swap, set inputs, checkmarks) is unchanged.
      const boxed = options?.boxed ?? true
      const last = lastByExercise[ex.name]
      const video = findExerciseVideo(ex.name, videos)
      const alreadyRequested = requestedVideos.has(ex.name)
      const swapOpen = swapPanelFor === ex.originalName
      const overflowOpen = overflowOpenFor === ex.originalName
      const restPickerOpen = restPickerFor === ex.originalName
      const setRows = setsByExercise[ex.name] || []
      const checkedRows = checkedByExercise[ex.name] || []
      const allChecked = setRows.length > 0 && checkedRows.length === setRows.length && checkedRows.every(Boolean)
      // Compact mode (boxed=false, i.e. an internal row inside a round
      // box) strips the "(Round N)" suffix from the displayed name -
      // the box itself already carries a "Round N" heading, so
      // repeating it on every exercise inside was redundant clutter.
      // Doesn't touch ex.name/ex.originalName themselves (still used
      // for keys, swap targeting, setsByExercise lookups, etc.), only
      // what's actually printed on screen.
      const displayName = boxed ? ex.name : stripRoundSuffixDisplay(ex.name)
      const displayOriginalName = boxed ? ex.originalName : stripRoundSuffixDisplay(ex.originalName)
      // Extracted to a variable so it can sit in two different spots
      // depending on boxed - inline with Target on a compact round-box
      // row (so "..." isn't left stranded alone on its own line below),
      // or in its usual place in the full actions row otherwise.
      const overflowMenuButton = (
        <div className="relative">
          <button
            onClick={() => setOverflowOpenFor(overflowOpen ? null : ex.originalName)}
            aria-label="More options"
            className="text-zinc-600 hover:text-white transition px-1.5 leading-none"
          >
            ⋯
          </button>
          {overflowOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOverflowOpenFor(null)} />
              <div className="absolute right-0 top-full mt-1 min-w-[180px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg py-1 z-20">
                {!boxed && (
                  <>
                    <a
                      href={video ? video.videoUrl : youtubeSearchUrl(ex.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOverflowOpenFor(null)}
                      className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                    >
                      {video ? '▶ Watch video' : 'Search on YouTube ↗'}
                    </a>
                    {ex.timerSeconds != null && (
                      <button
                        onClick={() => {
                          startSideTimer(ex, false)
                          setOverflowOpenFor(null)
                        }}
                        className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                      >
                        ▶ {formatDurationLabel(ex.timerSeconds)} timer
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRestPickerFor(restPickerOpen ? null : ex.originalName)
                        setOverflowOpenFor(null)
                      }}
                      className="flex items-center gap-1.5 w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                    >
                      <Timer className="w-3.5 h-3.5" aria-hidden="true" /> Custom timer
                    </button>
                    {setRows.length > 0 && (
                      <button
                        onClick={() => {
                          toggleAllChecked(ex.name, setRows.length)
                          setOverflowOpenFor(null)
                        }}
                        className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                      >
                        {allChecked ? '✓ All checked' : 'Check all sets'}
                      </button>
                    )}
                  </>
                )}
                {!video && (
                  <button
                    onClick={() => {
                      handleRequestVideo(ex.name)
                      setOverflowOpenFor(null)
                    }}
                    disabled={alreadyRequested}
                    className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition"
                  >
                    {alreadyRequested ? 'Video requested ✓' : 'Request a video'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setSwapPanelFor(ex.originalName)
                    setSwapInput('')
                    setOverflowOpenFor(null)
                  }}
                  className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                >
                  ⇄ Swap exercise
                </button>
                {/* Boxed (full card) mode gets History as its own inline
                    icon button beside the timer instead - see the boxed
                    actions row below. Compact mode (inside a round box)
                    has no such inline row, so it stays here as the only
                    way to reach it there. */}
                {!boxed && (
                  <button
                    onClick={() => {
                      setHistoryFor({ name: ex.name, label: displayName })
                      setOverflowOpenFor(null)
                    }}
                    className="flex items-center gap-1.5 w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    <HistoryIcon className="w-3.5 h-3.5" aria-hidden="true" /> History
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )
      return (
        <div
          className={
            large
              ? 'glass rounded-2xl p-6 text-center'
              : boxed
                ? 'glass rounded-2xl p-3.5'
                : ''
          }
        >
          <div
            className={
              large
                ? 'mb-3'
                : 'flex items-baseline justify-between mb-0.5 gap-2'
            }
          >
            <p
              className={
                large ? 'text-white text-2xl font-bold mb-1' : boxed ? 'text-white font-semibold' : 'text-white text-sm font-semibold'
              }
            >
              {displayName}
            </p>
            {large ? (
              <p className="text-zinc-400 text-sm">
                Target: {ex.sets} x {ex.reps}
              </p>
            ) : (
              // Compact rows put "..." right here, on the same line as
              // Target, instead of leaving it stranded alone on the
              // actions row below (which otherwise had nothing else on
              // it in compact mode - see boxed-only actions row further
              // down).
              <div className="flex items-center gap-2 shrink-0">
                <p className="text-zinc-500 text-xs whitespace-nowrap">
                  Target: {ex.sets} x {ex.reps}
                </p>
                {!boxed && overflowMenuButton}
              </div>
            )}
          </div>
          {ex.name !== ex.originalName && (
            <p className="text-zinc-600 text-[11px] mb-1">Swapped from {displayOriginalName}</p>
          )}
          {last && (
            <p className="text-zinc-500 text-xs mb-1.5">
              Last time: {last.weight ?? '-'} x {last.reps ?? '-'}
            </p>
          )}
          {/* Compact rows (boxed=false, inside a round box) fold every
              secondary action - video, timer, custom timer, check all,
              "..." - into the header row above (Target line) or the
              "..." menu itself, so this whole row simply doesn't exist
              for them - nothing left to show once "..." moved up. */}
          {boxed && (
            <div className={large ? 'flex items-center justify-between gap-2 mb-1' : 'flex items-center justify-between gap-2 mb-0.5 flex-wrap gap-y-1'}>
              <div className="flex items-center gap-3 flex-wrap gap-y-1">
                {video ? (
                  <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                  >
                    ▶ Watch video
                  </a>
                ) : (
                  <a
                    href={youtubeSearchUrl(ex.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-zinc-400 hover:text-white transition"
                  >
                    YouTube ↗
                  </a>
                )}
                {ex.timerSeconds ? (
                  <>
                    {/* In guided/large mode this quick-start is replaced by
                        the bigger, more prominent timer panel at the bottom
                        of the card (see below) - showing both would be
                        redundant and split attention between two "start
                        timer" controls on the same card. */}
                    {!large && (
                      <button
                        onClick={() => startSideTimer(ex, false)}
                        className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                      >
                        ▶ {formatDurationLabel(ex.timerSeconds)} timer
                      </button>
                    )}
                    <button
                      onClick={() => setRestPickerFor(restPickerOpen ? null : ex.originalName)}
                      className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white transition"
                    >
                      <Timer className="w-3.5 h-3.5" aria-hidden="true" /> custom
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setRestPickerFor(restPickerOpen ? null : ex.originalName)}
                    className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white transition"
                  >
                    <Timer className="w-3.5 h-3.5" aria-hidden="true" /> Timer
                  </button>
                )}
                <button
                  onClick={() => setHistoryFor({ name: ex.name, label: displayName })}
                  aria-label="View history"
                  className="text-zinc-400 hover:text-white transition"
                >
                  <HistoryIcon className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Hidden in large/guided mode - this function is only
                    ever called with large:true for a single-row guided
                    screen (a round instance, or a straight-set exercise
                    with just one set - renderGroupedCard handles every
                    multi-row guided screen separately and keeps its own
                    Check all/checkmarks unchanged). Bulk-checking one
                    row right before tapping Done was pure busywork -
                    Satish's call, confirmed this only applies where
                    there's nothing to differentiate ("check all of
                    one"). */}
                {!large && setRows.length > 0 && (
                  <button
                    onClick={() => toggleAllChecked(ex.name, setRows.length)}
                    className={`text-xs font-medium transition ${
                      allChecked ? 'text-orange-400 hover:text-orange-300' : 'text-zinc-500 hover:text-white'
                    }`}
                  >
                    {allChecked ? '✓ All checked' : 'Check all'}
                  </button>
                )}
                {overflowMenuButton}
              </div>
            </div>
          )}

          {/* Large/guided mode shows this same prompt inside the big
              timer panel at the bottom of the card instead - see below. */}
          {!large && ex.perSide && ex.timerSeconds != null && awaitingOtherSideFor === ex.originalName && (
            <div className="mb-2 flex items-center justify-between gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
              <span className="text-orange-400 text-xs font-medium">First side done - now the other side</span>
              <button
                onClick={() => startSideTimer(ex, true)}
                className="shrink-0 text-xs font-semibold text-black bg-orange-500 hover:bg-orange-400 rounded-lg px-3 py-1.5 transition"
              >
                ▶ Other side
              </button>
            </div>
          )}

          {video?.coachNotes && (
            <div className="mb-2">
              <button
                onClick={() => setNotesOpenFor(notesOpenFor === ex.originalName ? null : ex.originalName)}
                className="text-xs font-medium text-zinc-400 hover:text-white transition"
              >
                {notesOpenFor === ex.originalName ? '▾' : '▸'} Coach notes
              </button>
              {notesOpenFor === ex.originalName && (
                <p className="mt-1.5 text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-900/60 rounded-lg p-2.5">
                  {video.coachNotes}
                </p>
              )}
            </div>
          )}

          {restPickerOpen && (
            <div className="mb-3 p-3 bg-zinc-900/60 rounded-lg flex items-center gap-2 flex-wrap">
              {REST_PRESETS_SECONDS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => startRestTimer(sec)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
                >
                  {formatDurationLabel(sec)}
                </button>
              ))}
            </div>
          )}

          {swapOpen && (
            <div className="mb-3 p-3 bg-zinc-900/60 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  list="exercise-swap-suggestions"
                  value={swapInput}
                  onChange={(e) => setSwapInput(e.target.value)}
                  placeholder="Swap in which exercise?"
                  autoFocus
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                />
                <button
                  onClick={() => {
                    setSwapPanelFor(null)
                    setSwapInput('')
                  }}
                  aria-label="Cancel swap"
                  className="shrink-0 text-zinc-500 hover:text-white transition px-1"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleSwap(ex, activeCell!.week, false)}
                  disabled={!swapInput.trim() || isPending}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30"
                >
                  Just this week
                </button>
                <button
                  onClick={() => handleSwap(ex, activeCell!.week, true)}
                  disabled={!swapInput.trim() || isPending}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition disabled:opacity-30"
                >
                  All weeks
                </button>
              </div>
            </div>
          )}

          <div
            className={
              large
                ? 'space-y-2 mt-3 pt-3 border-t border-zinc-800'
                : 'space-y-1.5 mt-2.5 pt-2.5 border-t border-zinc-800'
            }
          >
            {(setsByExercise[ex.name] || []).map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* "Set N" is a plain label, not an input like Weight/
                    Reps - it deliberately does NOT get a matching
                    visible label above it (that would wrongly imply
                    it's a third field you fill in, per Satish's
                    correction). The invisible spacer line below reuses
                    the exact same text-xs/mb-1 classes as the real
                    Weight/Reps labels (just with `invisible`, which
                    hides it visually but keeps its layout height) so
                    it's guaranteed to occupy identical space rather
                    than an eyeballed pixel value - "Set N" ends up
                    lined up with the input boxes themselves instead of
                    sitting centered against their taller (label +
                    input) height. aria-hidden since it's purely a
                    spacing trick, nothing to announce. */}
                <span className={`text-zinc-500 shrink-0 ${large ? 'text-sm w-12' : 'text-xs w-11'}`}>
                  {large && (
                    <span className="block text-xs mb-1 invisible" aria-hidden="true">
                      Set
                    </span>
                  )}
                  Set {i + 1}
                </span>
                {ex.trackWeight !== false && (
                  <div className="flex-1">
                    {/* Persistent label, not just a placeholder - large
                        mode's whole point is being unmistakable about
                        what to do, and a placeholder disappears the
                        moment you type a number, leaving a bare digit
                        with no indication of what it is. List/compact
                        mode keeps relying on the placeholder alone
                        (unchanged), since that row is already dense
                        enough without adding label lines to every row. */}
                    {large && <label className="block text-zinc-500 text-xs mb-1">Weight</label>}
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={last?.weight != null ? String(last.weight) : 'weight'}
                      value={row.weight}
                      onChange={(e) => updateSet(ex.name, i, 'weight', e.target.value)}
                      // Scaled up in large/guided mode to match the rest
                      // of the upsized card (2xl title, Target line) -
                      // the inputs were the one thing left at list-view
                      // size, which is likely why they didn't read as
                      // "the main thing to interact with here." Border
                      // goes orange from two independent sources:
                      // `large && confirmEmptyDone` is the guided
                      // per-step Done nudge; `!large && missingValuesFlagged`
                      // is the whole-day Finish Workout check on this same
                      // round-box row (see the round-box call site below,
                      // which used to ring the whole row instead - Satish
                      // asked to replicate the straight-set per-field
                      // treatment here too). Either way, only the specific
                      // empty field lights up, not a generic "something's
                      // wrong" banner with no location.
                      className={`w-full bg-zinc-900 border rounded-lg text-white placeholder-zinc-600 ${
                        large ? 'text-lg font-semibold px-3 py-2.5' : 'text-sm px-2 py-1.5'
                      } ${
                        ((large && confirmEmptyDone) || (!large && missingValuesFlagged)) && !row.weight
                          ? 'border-orange-500/60'
                          : 'border-zinc-800'
                      }`}
                    />
                  </div>
                )}
                <div className="flex-1">
                  {large && <label className="block text-zinc-500 text-xs mb-1">Reps</label>}
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={ex.reps || 'reps'}
                    value={row.reps}
                    onChange={(e) => updateSet(ex.name, i, 'reps', e.target.value)}
                    className={`w-full bg-zinc-900 border rounded-lg text-white placeholder-zinc-600 ${
                      large ? 'text-lg font-semibold px-3 py-2.5' : 'text-sm px-2 py-1.5'
                    } ${
                      ((large && confirmEmptyDone) || (!large && missingValuesFlagged)) && !row.reps
                        ? 'border-orange-500/60'
                        : 'border-zinc-800'
                    }`}
                  />
                </div>
                {/* Hidden in large/guided mode - see the matching Check
                    all comment above. This function only ever renders
                    large:true for a single-row guided screen, where
                    Done (right below) is already the one completion
                    signal - a checkmark on the only row in between was
                    redundant clutter, not a real second confirmation. */}
                {!large && (
                  <button
                    onClick={() => toggleSetChecked(ex.name, i)}
                    aria-label={checkedRows[i] ? 'Mark set incomplete' : 'Mark set complete'}
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition ${
                      checkedRows[i] ? 'bg-orange-500' : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 ${checkedRows[i] ? 'text-black' : 'text-zinc-500'}`} aria-hidden="true" />
                  </button>
                )}
                {/* A round exercise is already exactly one fixed slot per
                    round - the round count itself is what repeats it, so
                    add/remove never meant anything here and just
                    cluttered the row. Straight sets (ex.round == null)
                    keep this, since those genuinely can run short or long
                    of what was prescribed. */}
                {ex.round == null && (
                  <button
                    onClick={() => removeSetRow(ex.name, i)}
                    aria-label="Remove set"
                    className="text-zinc-600 hover:text-red-400 transition text-sm shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {ex.round == null && (
              <button
                onClick={() => addSetRow(ex.name)}
                className="text-xs text-orange-400 hover:text-orange-300 transition"
              >
                + Add set
              </button>
            )}
          </div>

          {/* Big, centered timer panel - guided/large mode only. This
              exercise's own work timer (start button, running countdown,
              switch-sides prompt) used to live as a small top-row text
              link plus a small pill in the corner of the screen; both are
              hidden in large mode (see above and the floating pill's
              condition) in favor of this single, much more visible
              control sitting right above the "Done" button below, since
              that's the thing someone's actually looking for mid-set. */}
          {large && ex.timerSeconds != null && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              {sideTimerActive?.originalName === ex.originalName && restTimer ? (
                <>
                  <p className="text-white text-5xl font-bold tabular-nums mb-3">
                    {formatRestTime(restTimer.remaining)}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => adjustRestTimer(-15)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition"
                    >
                      −15s
                    </button>
                    <button
                      onClick={() => adjustRestTimer(15)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition"
                    >
                      +15s
                    </button>
                  </div>
                </>
              ) : ex.perSide && awaitingOtherSideFor === ex.originalName ? (
                <>
                  <p className="text-orange-400 text-sm font-medium mb-3">
                    First side done - now the other side
                  </p>
                  {/* Bordered pill, not a solid fill - Satish flagged
                      this button, Done, and Finish Workout all being
                      identical solid-orange blocks as visually noisy,
                      hard to tell apart. This is a helper action (starts
                      this exercise's own optional work timer), not the
                      thing that actually advances the guided player, so
                      it gets the same "secondary action" bordered-pill
                      treatment as the guided/list view toggle - orange
                      border, no fill, auto-width instead of w-full so it
                      doesn't compete in size with Done right below it. */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => startSideTimer(ex, true)}
                      className="border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-sm font-semibold px-5 py-2 rounded-full transition"
                    >
                      ▶ Start other side
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex justify-center">
                  <button
                    onClick={() => startSideTimer(ex, false)}
                    className="border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-sm font-semibold px-5 py-2 rounded-full transition"
                  >
                    ▶ Start {formatDurationLabel(ex.timerSeconds)} timer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // List-view-only counterpart to renderExerciseCard, for a run of
    // straight sets sharing one exercise (Squats (1), (2), (3)).
    // Video/timer/swap/overflow are exercise-level actions - showing
    // them once at the top instead of once per set avoids repeating
    // the same row three times. Swap, like on round days today,
    // targets only the first set in the group rather than all of
    // them at once - matching existing per-instance swap behavior
    // rather than introducing new "swap the whole group" logic.
    // Add/remove-set is deliberately omitted here (unlike the plain
    // card) since each entry in the group is already exactly one
    // predetermined set, not an open-ended list to extend.
    function renderGroupedCard(group: CellExercise[], options?: { large?: boolean }) {
      const large = options?.large ?? false
      const rep = group[0]
      const last = lastByExercise[rep.name]
      const video = findExerciseVideo(rep.name, videos)
      const alreadyRequested = requestedVideos.has(rep.name)
      const swapOpen = swapPanelFor === rep.originalName
      const overflowOpen = overflowOpenFor === rep.originalName
      const restPickerOpen = restPickerFor === rep.originalName
      const label = baseName(rep.name)
      const allChecked = group.every((ex) => (checkedByExercise[ex.name] || [])[0])
      function toggleAllCheckedForGroup() {
        setCheckedByExercise((prev) => {
          const next = { ...prev }
          for (const ex of group) {
            next[ex.name] = [!allChecked]
          }
          return next
        })
      }
      // When the last set's rest button is the final thing in the card,
      // the card's normal p-3.5 bottom padding (matched to its top/side
      // padding) reads as noticeably more open than the ~4px gap above
      // that same button - a short text link doesn't fill the same
      // visual weight a full input row does, so the standard padding
      // looks uneven trailing it specifically. Tightening just the
      // bottom edge in that one case keeps every other card (ending in
      // a normal set row) at the standard padding. Large mode (the
      // guided player's collapsed straight-set screen, task #30) skips
      // this micro-adjustment - it's the only thing on screen there, so
      // consistent, slightly roomier padding reads better than it does
      // packed into the list alongside other cards.
      const lastEntryHasRest = group[group.length - 1].restSeconds != null
      // No whole-card ring here anymore once Finish Workout flags missing
      // values - only the specific empty weight/reps input gets
      // highlighted now (see the input className logic further down),
      // matching what Satish asked for: "highlight that particular box
      // that they need to enter the values in" instead of the whole row
      // or card. Round boxes still get their own per-exercise-row
      // highlight (rowFlaggedMissing, further down in this file) - this
      // straight-set card previously had the coarsest highlight of the
      // three (whole card), now it has the finest (single field).
      return (
        <div
          className={
            large
              ? 'glass rounded-2xl p-5'
              : lastEntryHasRest
                ? 'glass rounded-2xl pt-3.5 px-3.5 pb-2'
                : 'glass rounded-2xl p-3.5'
          }
        >
          <div className="flex items-baseline justify-between mb-0.5 gap-2">
            <p className={large ? 'text-white text-xl font-bold' : 'text-white font-semibold'}>{label}</p>
            <p className="text-zinc-500 text-xs whitespace-nowrap">
              Target: {group.length} x {rep.reps}
            </p>
          </div>
          {rep.name !== rep.originalName && (
            <p className="text-zinc-600 text-[11px] mb-1">Swapped from {baseName(rep.originalName)}</p>
          )}
          {last && (
            <p className="text-zinc-500 text-xs mb-1.5">
              Last time: {last.weight ?? '-'} x {last.reps ?? '-'}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap gap-y-1">
            <div className="flex items-center gap-3 flex-wrap gap-y-1">
              {video ? (
                <a
                  href={video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                >
                  ▶ Watch video
                </a>
              ) : (
                <a
                  href={youtubeSearchUrl(rep.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-zinc-400 hover:text-white transition"
                >
                  YouTube ↗
                </a>
              )}
              {rep.timerSeconds ? (
                <>
                  <button
                    onClick={() =>
                      rep.perSide ? startSideTimer(rep, false) : startRestTimer(rep.timerSeconds!)
                    }
                    className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                  >
                    ▶ {formatDurationLabel(rep.timerSeconds)} timer
                  </button>
                  <button
                    onClick={() => setRestPickerFor(restPickerOpen ? null : rep.originalName)}
                    className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white transition"
                  >
                    <Timer className="w-3.5 h-3.5" aria-hidden="true" /> custom
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setRestPickerFor(restPickerOpen ? null : rep.originalName)}
                  className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-white transition"
                >
                  <Timer className="w-3.5 h-3.5" aria-hidden="true" /> Timer
                </button>
              )}
              <button
                onClick={() => setHistoryFor({ name: rep.name, label })}
                aria-label="View history"
                className="text-zinc-400 hover:text-white transition"
              >
                <HistoryIcon className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={toggleAllCheckedForGroup}
                className={`text-xs font-medium transition ${
                  allChecked ? 'text-orange-400 hover:text-orange-300' : 'text-zinc-500 hover:text-white'
                }`}
              >
                {allChecked ? '✓ All checked' : 'Check all'}
              </button>
              <div className="relative">
                <button
                  onClick={() => setOverflowOpenFor(overflowOpen ? null : rep.originalName)}
                  aria-label="More options"
                  className="text-zinc-600 hover:text-white transition px-1.5 leading-none"
                >
                  ⋯
                </button>
                {overflowOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOverflowOpenFor(null)} />
                    <div className="absolute right-0 top-full mt-1 min-w-[170px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg py-1 z-20">
                      {!video && (
                        <button
                          onClick={() => {
                            handleRequestVideo(rep.name)
                            setOverflowOpenFor(null)
                          }}
                          disabled={alreadyRequested}
                          className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition"
                        >
                          {alreadyRequested ? 'Video requested ✓' : 'Request a video'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSwapPanelFor(rep.originalName)
                          setSwapInput('')
                          setOverflowOpenFor(null)
                        }}
                        className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                      >
                        ⇄ Swap exercise
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {rep.perSide && rep.timerSeconds != null && awaitingOtherSideFor === rep.originalName && (
            <div className="mb-2 flex items-center justify-between gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
              <span className="text-orange-400 text-xs font-medium">First side done - now the other side</span>
              <button
                onClick={() => startSideTimer(rep, true)}
                className="shrink-0 text-xs font-semibold text-black bg-orange-500 hover:bg-orange-400 rounded-lg px-3 py-1.5 transition"
              >
                ▶ Other side
              </button>
            </div>
          )}

          {video?.coachNotes && (
            <div className="mb-2">
              <button
                onClick={() => setNotesOpenFor(notesOpenFor === rep.originalName ? null : rep.originalName)}
                className="text-xs font-medium text-zinc-400 hover:text-white transition"
              >
                {notesOpenFor === rep.originalName ? '▾' : '▸'} Coach notes
              </button>
              {notesOpenFor === rep.originalName && (
                <p className="mt-1.5 text-xs text-zinc-400 whitespace-pre-wrap bg-zinc-900/60 rounded-lg p-2.5">
                  {video.coachNotes}
                </p>
              )}
            </div>
          )}

          {restPickerOpen && (
            <div className="mb-3 p-3 bg-zinc-900/60 rounded-lg flex items-center gap-2 flex-wrap">
              {REST_PRESETS_SECONDS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => startRestTimer(sec)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
                >
                  {formatDurationLabel(sec)}
                </button>
              ))}
            </div>
          )}

          {swapOpen && (
            <div className="mb-3 p-3 bg-zinc-900/60 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  list="exercise-swap-suggestions"
                  value={swapInput}
                  onChange={(e) => setSwapInput(e.target.value)}
                  placeholder="Swap in which exercise?"
                  autoFocus
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                />
                <button
                  onClick={() => {
                    setSwapPanelFor(null)
                    setSwapInput('')
                  }}
                  aria-label="Cancel swap"
                  className="shrink-0 text-zinc-500 hover:text-white transition px-1"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleSwap(rep, activeCell!.week, false)}
                  disabled={!swapInput.trim() || isPending}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-30"
                >
                  Just this week
                </button>
                <button
                  onClick={() => handleSwap(rep, activeCell!.week, true)}
                  disabled={!swapInput.trim() || isPending}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition disabled:opacity-30"
                >
                  All weeks
                </button>
              </div>
            </div>
          )}

          <div className="mt-2.5 pt-2.5 border-t border-zinc-800 space-y-1">
            {group.map((ex, i) => {
              const rows = setsByExercise[ex.name] || []
              const row = rows[0]
              // Suppresses the divider/top-padding below when the
              // previous row already ended in a rest button - that
              // button already signals "new set starts here," so a
              // border line right underneath it was redundant, and its
              // pt-2 was what made the gap below the rest button nearly
              // 3x the gap above it (space-y-1's 4px on top, versus the
              // rest button's own pb-1 *plus* this pt-2 stacking below).
              // Removing both and leaning on space-y-1 alone keeps the
              // rest button evenly spaced between the two sets it sits
              // between.
              const prevHadRest = i > 0 && group[i - 1].restSeconds != null
              return (
                <Fragment key={ex.originalName}>
                  <div
                    className={`flex items-center gap-2 ${
                      i === 0 || prevHadRest ? '' : 'pt-2 border-t border-zinc-800/60'
                    }`}
                  >
                    {/* Rep-based (no timer) perSide exercises label their
                        two occurrences Left/Right instead of Set 1/Set 2 -
                        i here indexes across the group's actual instances,
                        so this correctly reads as "this row is one side."
                        Timed perSide exercises use the Switch Sides prompt
                        above instead, so keep the plain Set N label here
                        even if someone's also logging extra rows on one. */}
                    <span className="text-zinc-500 text-xs w-11 shrink-0">
                      {ex.perSide && !ex.timerSeconds && i < 2 ? (i === 0 ? 'Left' : 'Right') : `Set ${i + 1}`}
                    </span>
                    {/* Missing-field highlight, from two independent
                        sources: `large && confirmEmptyDone` is the
                        guided player's per-step Done nudge (unchanged);
                        `!large && missingValuesFlagged` is the whole-day
                        Finish Workout check - this used to ring the
                        entire card instead, but Satish asked for just
                        "that particular box" once he saw the round-box
                        version was already per-row - so this now
                        highlights only the specific empty input, same as
                        the Done nudge already did. The two sources never
                        overlap in practice (Finish Workout always
                        redirects to list view first, so large+flagged
                        never happens together), but both are checked
                        directly rather than assumed mutually exclusive. */}
                    {ex.trackWeight !== false && (
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={last?.weight != null ? String(last.weight) : 'weight'}
                        value={row?.weight ?? ''}
                        onChange={(e) => updateSet(ex.name, 0, 'weight', e.target.value)}
                        className={`w-full bg-zinc-900 border rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600 ${
                          ((large && confirmEmptyDone) || (!large && missingValuesFlagged)) && !row?.weight
                            ? 'border-orange-500/60'
                            : 'border-zinc-800'
                        }`}
                      />
                    )}
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={ex.reps || 'reps'}
                      value={row?.reps ?? ''}
                      onChange={(e) => updateSet(ex.name, 0, 'reps', e.target.value)}
                      className={`w-full bg-zinc-900 border rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600 ${
                        ((large && confirmEmptyDone) || (!large && missingValuesFlagged)) && !row?.reps
                          ? 'border-orange-500/60'
                          : 'border-zinc-800'
                      }`}
                    />
                    <button
                      onClick={() => toggleSetChecked(ex.name, 0)}
                      aria-label={(checkedByExercise[ex.name] || [])[0] ? 'Mark set incomplete' : 'Mark set complete'}
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition ${
                        (checkedByExercise[ex.name] || [])[0] ? 'bg-orange-500' : 'bg-zinc-800 hover:bg-zinc-700'
                      }`}
                    >
                      <Check
                        className={`w-3.5 h-3.5 ${(checkedByExercise[ex.name] || [])[0] ? 'text-black' : 'text-zinc-500'}`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  {ex.restSeconds != null && renderRestPill(ex.restSeconds)}
                </Fragment>
              )
            })}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => addStraightSet(group)}
                className="text-xs text-orange-400 hover:text-orange-300 transition"
              >
                + Add set
              </button>
              {group.length > 1 && (
                <button
                  onClick={() => removeStraightSet(group)}
                  className="text-xs text-zinc-600 hover:text-red-400 transition"
                >
                  Remove last set
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      // No bottom padding reserved here anymore - Finish Workout now
      // sits in normal document flow on mobile too (see the bar's own
      // comment below), so nothing needs clearance space underneath it
      // the way the old `fixed` bar did.
      <div>
        <datalist id="exercise-swap-suggestions">
          {exerciseSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {/* Combined bar, visible for the whole time a day is open - a
            thicker progress track (per exercise, once every one of its
            sets is checked off - see progressFraction and the checkmark
            UI in renderExerciseCard/renderGroupedCard), the elapsed
            session clock, and a one-tap Discard - now the ONLY way to
            leave an active session, since the old small ✕ button in the
            day header below was removed as redundant clutter.
            Timer/Discard are soft filled pills (flat zinc / faint red
            wash, no borders) rather than outlined chips - deliberately
            still reads as a "card," distinct from plain text, since
            Satish wants Discard in particular to keep a bit of visual
            weight ("shouldn't be used very lightly"), just without the
            harder bordered-chip look.
            `sticky` (NOT `fixed`) on purpose - the app's own header
            (AppNav) isn't actually pinned to the viewport, it's normal
            page content that scrolls away like anything else, so a
            `fixed` bar here had nothing real to sit "under": it just
            always occupied the same screen position regardless of
            scroll, which meant it permanently covered page.tsx's "Back
            to Community" link and page title the moment a session
            started (Satish caught this - "hidden behind the progress
            card"). `sticky` sits in its natural place in the page (below
            that header/link/title, since this component renders after
            them in the DOM) until scrolled past, and only then pins to
            the top - so it never overlaps anything at the start, and
            still stays visible while scrolling deep into a long day's
            exercise list, which was the actual point of pinning it at
            all. No spacer needed either (unlike `fixed`, `sticky` keeps
            its own layout space, so nothing needs pushing down under it). */}
        <div className="sticky top-0 z-40 -mx-4 sm:mx-0 bg-[#0a0a0a]/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
            <span className="bg-zinc-900 text-zinc-300 text-xs font-semibold tabular-nums rounded-full px-2.5 py-1 shrink-0">
              {formatRestTime(elapsedSeconds)}
            </span>
            <div className="flex-1 h-2.5 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${Math.round(progressFraction * 100)}%` }}
              />
            </div>
            <button
              onClick={handleCloseSession}
              className="bg-red-500/10 hover:bg-red-500/15 text-red-400 hover:text-red-300 text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 transition"
            >
              Discard
            </button>
          </div>
        </div>

        {/* Fixed to the viewport, not the page - stays visible no
            matter how far into the exercise list you've scrolled,
            unlike the old version which lived inside the sticky
            Finish Workout bar and only came into view once you'd
            scrolled all the way back down. Offset assumes the combined
            bar above has already stuck to the top (its usual state
            whenever a rest timer's actually running, since that means
            you're at least one exercise into the session) - genuinely
            unscrolled-to-the-very-top-with-a-timer-running is a rare
            enough combination that a small, harmless overlap with the
            page title there isn't worth the complexity of tracking the
            sticky bar's actual stuck/unstuck state just for this.
            Suppressed during the guided player's own rest screen (shows
            this same countdown as its main content) and while the
            guided player's big in-card timer panel is showing this
            exact exercise's own running timer (renderExerciseCard,
            large mode) - both would otherwise duplicate this same
            countdown on screen at once. Still shown for every other
            case: list view, a custom preset timer, etc. */}
        {restTimer &&
          !(effectiveMode === 'guided' && guidedPhase === 'rest') &&
          !(
            effectiveMode === 'guided' &&
            guidedPhase === 'exercise' &&
            sideTimerActive?.originalName === currentEx?.originalName
          ) && (
          <div className="fixed top-28 sm:top-32 right-4 z-40 flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full shadow-lg pl-3 pr-2 py-2">
            {/* sideTimerActive is only ever set by startSideTimer (an
                exercise's own work timer, e.g. a 30s plank) - every other
                way this pill's countdown gets started goes through
                startRestTimer directly, which always nulls it out first.
                So this one check reliably tells rest apart from a work
                timer without needing a separate "what kind of timer is
                this" field. */}
            <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">
              {sideTimerActive ? 'Timer' : 'Rest'}
            </span>
            <button
              onClick={() => adjustRestTimer(-15)}
              className="text-zinc-400 hover:text-white text-[11px] font-medium"
            >
              −15
            </button>
            <span className="text-white text-sm font-bold tabular-nums w-11 text-center">
              {formatRestTime(restTimer.remaining)}
            </span>
            <button
              onClick={() => adjustRestTimer(15)}
              className="text-zinc-400 hover:text-white text-[11px] font-medium"
            >
              +15
            </button>
            <span className="w-px h-4 bg-zinc-700" />
            <button
              onClick={() => {
                // Cleared here (not just left to the natural-completion
                // effect) so dismissing a perSide timer early is
                // treated as "gave up," not "finished" - no
                // switch-sides prompt for a side that wasn't actually
                // done.
                setSideTimerActive(null)
                setRestTimer(null)
              }}
              aria-label="Dismiss timer"
              className="text-zinc-500 hover:text-red-400 transition px-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* No close/X button here anymore - Discard on the sticky bar
            above is the one and only way to end a session (Satish's
            call: this button "wasn't doing much" once Discard existed,
            and having two exits was redundant clutter, not a real
            safety net). The sticky bar above also lost its border-b,
            and this block got real top spacing (mt-5, was 0) plus a
            two-line eyebrow/heading split instead of one run-on "Week
            X, Day Y: Label" line - Satish's flag that the top of the
            screen felt "crammed" the moment a session opened.
            The old auto/coach-authored day.notes line ("Warm-up
            circuit, two rounds..." etc.) that used to render right
            below the exercise count is gone - Satish flagged it as
            both redundant (the phase-sectioned exercise list already
            shows this) and often just inaccurate, generated by the old
            AI-planning flow rather than truly authored. Removed here
            AND from the matching cell.notes line in the day-preview
            accordion below, since it's the same underlying field and
            leaving it in one place while hiding it in the other would
            just be inconsistent. The `notes` field itself is untouched
            in the data/type - this only stops the member-facing UI
            from rendering it, so nothing is lost if a real, accurate
            use for it comes up later.
            The guided/list view-toggle button now lives inline on this
            same row, right-aligned next to the day label (used to be
            a separate line inside each mode's own content below) -
            Satish's ask, so it doesn't need its own line. flex-wrap
            keeps a very long day label + button from overlapping on
            narrow phones - it'll just drop to its own line there
            instead of colliding. */}
        <div className="mt-5 mb-1 flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">
              Week {activeCell.week} · Day {activeCell.day}
            </p>
            <h2 className="text-white text-lg font-bold mt-1">{activeCell.label}</h2>
            {exercises.length > 0 && (
              <p className="text-zinc-500 text-xs mt-1">
                {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
          {hasGuidedFlow &&
            (effectiveMode === 'list' ? (
              <button
                onClick={toggleViewMode}
                className="border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-xs font-semibold px-3.5 py-1.5 rounded-full transition shrink-0"
              >
                {/* "Start Now" used to live here, but the session's
                    already underway by the time anyone sees list view
                    (see the day-preview Start buttons) - that wording
                    wrongly implied nothing had happened yet. This is
                    purely a view switch now, so it says so. Bare
                    "Continue" (mid-session resume case) was ambiguous
                    while bouncing between list/guided views - it read
                    like "continue in list view" rather than naming
                    where the tap actually goes. "Continue to guided
                    view" keeps the resume signal but says the
                    destination explicitly, matching the "Switch to
                    guided view" wording used the rest of the time. */}
                ▶ {guidedIndex > 0 && guidedPhase !== 'done' ? 'Continue to guided view' : 'Switch to guided view'}
              </button>
            ) : (
              <button
                onClick={toggleViewMode}
                className="border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 text-xs font-medium px-3.5 py-1.5 rounded-full transition shrink-0"
              >
                ← Switch to list view
              </button>
            ))}
        </div>

        {effectiveMode === 'list' ? (
          <div className="mt-4">
            {/* Whole-day missing-values warning - only ever shown after
                Finish Workout has been tapped once with something still
                missing (see handleFinishClick above, which is also what
                forces list view if this got triggered from guided mode -
                nothing to usefully highlight one exercise at a time
                there). Deliberately more "flashy" than the per-exercise
                Done nudge below each card (Satish's ask): a full bordered
                banner with a warning icon, not just an inline line of
                text. Its own "Finish anyway" button is the guaranteed-
                visible path regardless of scroll position or device -
                unlike the bottom Finish Workout bar, which is only
                `fixed` (always on-screen) on mobile and scrolls out of
                view on desktop (`sm:static`). Calls finishWorkout()
                directly, not handleFinishClick, since being on this
                banner already means the check's been satisfied - a
                second click here should always go through. */}
            {missingValuesFlagged &&
              (() => {
                const missing = getMissingExercises(exercises)
                if (missing.length === 0) return null
                const names = Array.from(new Set(missing.map((ex) => normalizeExerciseIdentity(ex.name))))
                const namesText =
                  names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
                return (
                  <div className="mb-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-orange-300 text-sm font-semibold">Some values are missing</p>
                        <p className="text-orange-200/80 text-xs mt-1">
                          {namesText} {names.length === 1 ? 'has' : 'have'} a missing weight or reps - check the
                          highlighted exercises below.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => finishWorkout()}
                      disabled={isPending}
                      className="w-full mt-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold py-2.5 rounded-xl transition"
                    >
                      {isPending ? 'Saving...' : 'Finish anyway'}
                    </button>
                  </div>
                )
              })()}
            <div className="space-y-3">
              {phaseSections.map((section, sectionIndex) => {
                const sectionExerciseCount = section.boxes.reduce((sum, box) => sum + box.length, 0)
                const boxesJsx = section.boxes.map((box) => {
                  const isRoundBox = box[0][0].round != null
                  const first = box[0][0]
                  const i = exercises.indexOf(first)
                  return (
                    <Fragment key={first.originalName}>
                      {isRoundBox && (
                        <p className={`text-orange-400 text-xs font-bold uppercase tracking-wider ${i === 0 ? '' : 'pt-3 border-t border-zinc-800'}`}>
                          Round {first.round}
                        </p>
                      )}
                      {isRoundBox ? (
                        <div className="glass rounded-2xl p-3.5 space-y-1.5">
                          {box.map((group, idx) => {
                            const ex = group[0]
                            // Same divider-suppression idea as the
                            // straight-set grouped card's prevHadRest
                            // (see renderGroupedCard) - a rest button
                            // right above already signals "next exercise
                            // starts here," so stacking a border line
                            // underneath it too was the redundant third
                            // line Satish flagged. Only exercises that
                            // *don't* follow a rest button get their own
                            // top divider.
                            const prevHadRest = idx > 0 && box[idx - 1][0].restSeconds != null
                            // The round's last exercise still gets its
                            // rest pill shown inside this same box (not
                            // floated below it as a separate element) -
                            // it's the rest leading into the next round,
                            // but visually it belongs to the round that's
                            // ending, same as every other in-round rest.
                            // Only skipped if this is the very last
                            // exercise of the entire day, since there's
                            // nothing left to rest before.
                            const isLastInBox = idx === box.length - 1
                            const showRest =
                              ex.restSeconds != null && (!isLastInBox || exercises.indexOf(ex) < exercises.length - 1)
                            // No row-level ring here anymore either - this
                            // used to highlight the whole compact row when
                            // Finish Workout flagged missing values, same
                            // idea as the straight-set whole-card ring that
                            // was already narrowed to per-field. Satish's
                            // ask this round: replicate that same
                            // per-field precision here too, instead of
                            // highlighting the whole row. renderExerciseCard
                            // itself now handles the actual weight/reps
                            // input highlighting (see its own comment) via
                            // the same missingValuesFlagged check, so
                            // nothing extra is needed at this call site
                            // beyond the existing divider spacing.
                            return (
                              <Fragment key={ex.originalName}>
                                <div className={idx === 0 || prevHadRest ? '' : 'pt-1.5 border-t border-zinc-800/60'}>
                                  {renderExerciseCard(ex, { boxed: false })}
                                </div>
                                {showRest && renderRestPill(ex.restSeconds!)}
                              </Fragment>
                            )
                          })}
                        </div>
                      ) : (
                        renderGroupedCard(box[0])
                      )}
                    </Fragment>
                  )
                })

                // Content that never sets phase (phase === null) has no
                // header/toggle at all - renders exactly as every other
                // group always has.
                if (section.phase == null) {
                  return (
                    <div key={`section-${sectionIndex}`} className="space-y-3">
                      {boxesJsx}
                    </div>
                  )
                }

                const phase = section.phase
                const collapsed = collapsedPhases.has(phase)
                // All three phases (not just the collapsed ones) get the
                // same bg-zinc-900 pill-row header now, whether expanded
                // or not - Satish's "middle option" pick: Main still
                // starts expanded (collapsedPhases' default already only
                // includes warmup/cooldown, unchanged - see its useState
                // above), but every section reads as an equally tappable
                // row instead of Main looking like a plain list with no
                // indication Warm-up/Cool-down even exist as separate,
                // expandable things. Dropped the "Show ▾ / Hide ▴" text
                // label in favor of a bare chevron (the pill itself now
                // carries enough visual weight to read as tappable) and
                // dropped the border-t divider between sections in favor
                // of margin - two already-boxed rows don't need a line
                // between them too.
                return (
                  <div key={phase} className={sectionIndex === 0 ? '' : 'mt-4'}>
                    <button
                      onClick={() => togglePhaseCollapsed(phase)}
                      className="w-full flex items-center justify-between gap-2 bg-zinc-900 rounded-lg px-3 py-2.5 mb-3"
                    >
                      <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">
                        {phaseSectionLabel(phase)} · {sectionExerciseCount} exercise
                        {sectionExerciseCount === 1 ? '' : 's'}
                      </span>
                      <span className="text-zinc-500 text-xs shrink-0">{collapsed ? '▾' : '▴'}</span>
                    </button>
                    {!collapsed && <div className="space-y-3">{boxesJsx}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {guidedPhase !== 'done' && (
              <p className="text-zinc-500 text-xs text-center">
                {currentRound != null
                  ? `Round ${currentRound} of ${totalRounds} · Exercise ${posInRound} of ${roundExercises.length}`
                  : `Exercise ${guidedIndex + 1} of ${listGroups.length}`}
              </p>
            )}

            {guidedPhase === 'roundIntro' && (currentRound != null || introPhase != null) && (
              <div className="glass rounded-2xl p-6 text-center">
                {/* Only phase-transition screens (warm-up/main/cool-down)
                    get an icon - a plain "Round 2 starts" mid-phase
                    screen doesn't correspond to any of the three, so
                    introPhase is null there and no icon renders. */}
                {introPhase &&
                  (() => {
                    const PhaseIcon = phaseIntroIcon(introPhase)
                    return <PhaseIcon className="w-8 h-8 text-orange-400 mx-auto mb-3" aria-hidden="true" />
                  })()}
                <p className="text-white text-xl font-bold mb-2">
                  {introPhase ? phaseIntroText(introPhase) : `Round ${currentRound} starts`}
                </p>
                {introPhase && currentRound != null && (
                  <p className="text-zinc-400 text-sm mb-5">
                    Round {currentRound} of {totalRounds}
                  </p>
                )}
                {!introPhase && currentRound != null && (
                  <p className="text-zinc-400 text-sm mb-5">
                    {roundExercises.length} exercise{roundExercises.length === 1 ? '' : 's'} this round
                  </p>
                )}
                {introPhase === 'cooldown' && (
                  <p className="text-zinc-500 text-xs mb-5">Don&apos;t ignore this.</p>
                )}
                <button
                  onClick={() => setGuidedPhase('exercise')}
                  className="bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold px-6 py-3 rounded-xl transition"
                >
                  {currentRound != null ? `Start round ${currentRound}` : 'Continue'}
                </button>
              </div>
            )}

            {guidedPhase === 'rest' && restTimer && currentEx && (
              <div className="glass rounded-2xl p-6 text-center">
                {/* guidedIndex still points at the just-finished
                    exercise here - advanceGuided() only moves it once
                    this rest ends - so both names are available
                    exactly when someone would want to see them: right
                    as they start resting, before the next card
                    replaces this screen. */}
                {/* "Finished X" stays muted (it's already done, nothing to
                    draw attention to), "Up next" turns orange since it's
                    the forward-looking piece of info - small color pass to
                    make this screen feel less flat (Satish: "the rest page
                    right now looks a little bit bland"). Deliberately not
                    using ring/border-orange anywhere on this card, since
                    that visual language already means "missing values" in
                    this file (see missingValuesFlagged) - text-only color
                    changes avoid that collision. */}
                <div className="flex items-center justify-between gap-2 mb-2.5 text-left">
                  <span className="text-zinc-500 text-xs">Finished {baseName(currentEx.name)}</span>
                  {listGroups[guidedIndex + 1] && (
                    <span className="text-orange-400 text-xs text-right">
                      Up next: {baseName(listGroups[guidedIndex + 1][0].name)}
                    </span>
                  )}
                </div>
                <p className="text-orange-400 text-sm mb-2">Rest</p>
                <p className="text-orange-400 text-5xl font-bold tabular-nums mb-3.5">
                  {formatRestTime(restTimer.remaining)}
                </p>
                <div className="flex items-center justify-center gap-3 mb-3.5">
                  <button
                    onClick={() => adjustRestTimer(-15)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition"
                  >
                    −15s
                  </button>
                  <button
                    onClick={() => adjustRestTimer(15)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white transition"
                  >
                    +15s
                  </button>
                </div>
                <button
                  onClick={() => setRestTimer(null)}
                  className="text-sm font-semibold px-5 py-2 rounded-lg border border-zinc-600 text-zinc-200 hover:border-zinc-400 hover:text-white transition"
                >
                  Skip rest ⏭
                </button>
                {/* Deliberately neutral, not red/danger-toned - red
                    already means "destructive" in this app (Discard),
                    and skipping rest is a legitimate choice sometimes
                    (running late, already feels recovered), not an
                    error. The nudge line does the discouraging instead
                    of the button's color. */}
                <p className="text-zinc-500 text-xs mt-2">
                  Don&apos;t skip rest - it helps you perform better.
                </p>
              </div>
            )}

            {guidedPhase === 'exercise' && currentEx && (
              <>
                {/* A straight-set run (more than one set) collapses to
                    one big card showing every set together, same as the
                    list view's grouped card just sized up - task #30.
                    A single round exercise still gets its own full-focus
                    card exactly as before. */}
                {isGroupedGuidedStep
                  ? renderGroupedCard(currentGroup, { large: true })
                  : renderExerciseCard(currentEx, { large: true })}
                {/* Soft nudge, not a hard block - Satish's ask. Shows
                    the first time Done is tapped while anything's
                    missing (a whole exercise untouched, or just one set
                    among several); a second tap always goes through.
                    The specific empty field(s) also get an orange
                    border via the inputs themselves (see
                    renderExerciseCard/renderGroupedCard) so this isn't
                    just a vague "something's wrong" message with no
                    location to act on. */}
                {confirmEmptyDone && (
                  <div className="mt-3 mb-3 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-center">
                    <p className="text-orange-400 text-xs font-medium">
                      Some values are missing for this exercise
                    </p>
                  </div>
                )}
                <button
                  onClick={() => handleDoneClick(currentGroup)}
                  // Kept the same size/color as Finish Workout on
                  // purpose (Satish's call: shrinking Done - by far the
                  // most-tapped button in the app, once per exercise all
                  // day - to de-emphasize a once-per-session action
                  // would make the common case harder to hit). The
                  // trailing arrow is the actual fix for "doesn't feel
                  // like the natural next step" - a cheap, purely visual
                  // cue that this moves you forward, not that it ends
                  // anything, without touching color or size.
                  className="w-full bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {/* Straight-set groups never force a rest interstitial
                      (see handleGuidedDone) - each set's own optional
                      rest button, and the shared timer, stay available
                      right on this same card instead. */}
                  {confirmEmptyDone
                    ? 'Continue anyway'
                    : !isGroupedGuidedStep && currentEx.restSeconds != null
                      ? `Done - start ${formatDurationLabel(currentEx.restSeconds)} rest`
                      : guidedIndex === listGroups.length - 1
                        ? 'Done'
                        : 'Done - next exercise'}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            )}

            {guidedPhase === 'done' && (
              <div className="glass rounded-2xl p-5 text-center">
                <p className="text-white font-semibold mb-1">That&apos;s the whole session</p>
                <p className="text-zinc-400 text-sm">Tap Finish Workout below to log it.</p>
              </div>
            )}
          </div>
        )}

        {/* Finish Workout now sits in normal document flow at the end
            of the page on mobile too, matching what desktop already did
            (sm:static, before this was ever made `fixed`). Reverted
            away from the floating fixed-bottom-bar approach - Satish's
            concern was that it permanently occupied screen space while
            scrolling and had already caused repeated mis-tap issues
            (this exact bar needed hiding during rest/round-intro below,
            and its bottom clearance got bumped twice, both just to work
            around it floating over content). Since Finish only makes
            sense once everything's actually logged, scrolling to reach
            it at the natural end of the list isn't real extra work -
            it's the same thing desktop has always done without
            complaint. Mid-workout reachability is now handled instead
            by the Discard/Finish choice modal above (discardModalOpen)
            rather than a second persistent button living in the sticky
            top bar next to Discard - two small adjacent controls for
            such different-weight actions read as interchangeable no
            matter how they were colored or spaced, so that approach was
            dropped in favor of meeting people at the moment they already
            reach for Discard.

            Still skipped entirely (not just spaced out) during the
            guided player's rest and round-intro screens - even in
            normal flow, guided mode's screens are short enough that a
            bar directly following them would still land close to Skip
            rest on short screens, the original mis-tap concern that
            justified hiding it there in the first place. Still shown
            for 'exercise' and 'done' guided phases, and always in list
            view (effectiveMode !== 'guided' short-circuits the phase
            check there). */}
        {!(effectiveMode === 'guided' && (guidedPhase === 'rest' || guidedPhase === 'roundIntro')) && (
        <div className="mt-10">
          <div className="max-w-3xl mx-auto">
            <p className="text-zinc-500 text-[11px] text-center mb-2">
              Only tap this once every exercise is logged
            </p>
            {/* onClick goes through handleFinishClick's missing-values
                check now, not finishWorkout directly - see its comment
                above. Relabels to "Finish anyway" once flagged, mainly
                for consistency with Done's identical pattern; the
                banner's own "Finish anyway" button (see the list-view
                warning banner) is the actually-guaranteed-visible path,
                this is just a second way to trigger the same thing for
                anyone who does scroll down here instead. */}
            <button
              onClick={handleFinishClick}
              disabled={isPending}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2.5"
            >
              {isPending ? (
                'Saving...'
              ) : missingValuesFlagged ? (
                'Finish anyway'
              ) : (
                <>
                  <BicepsFlexed className="w-6 h-6" aria-hidden="true" />
                  Finish Workout
                </>
              )}
            </button>
          </div>
        </div>
        )}

        {/* Discard/Finish choice modal - opened by handleCloseSession
            instead of the old window.confirm() whenever something's
            actually been logged. Names exactly what's still missing
            (same dedup logic as the list-view warning banner above) so
            "Finish workout" isn't a surprise, and offers it as the
            primary path alongside the clearly-destructive "Discard
            everything" - Satish's read was that people default to
            assuming Discard is the only way out of a session, so this
            meets them at that exact moment instead of adding a new,
            easy-to-miss button elsewhere. "Keep working" (backdrop
            click does the same) is the only way to leave without either
            saving or erasing anything. */}
        {discardModalOpen &&
          (() => {
            const missing = getMissingExercises(exercises)
            const names = Array.from(new Set(missing.map((ex) => normalizeExerciseIdentity(ex.name))))
            const namesText =
              names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
                onClick={() => setDiscardModalOpen(false)}
              >
                <div
                  className="glass rounded-2xl p-6 max-w-sm w-full text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AlertTriangle className="w-7 h-7 text-orange-400 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-white font-semibold text-sm mb-1.5">You have progress logged</p>
                  <p className="text-zinc-400 text-sm mb-5">
                    {names.length > 0
                      ? `${namesText} still need${names.length === 1 ? 's' : ''} values. Finish now to save what you've logged, or discard to erase everything.`
                      : "Finish now to save what you've logged, or discard to erase everything."}
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setDiscardModalOpen(false)
                        finishWorkout()
                      }}
                      disabled={isPending}
                      className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold py-3 rounded-xl transition"
                    >
                      Finish workout
                    </button>
                    <button
                      onClick={discardSession}
                      className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-semibold py-3 rounded-xl transition"
                    >
                      Discard everything
                    </button>
                    <button
                      onClick={() => setDiscardModalOpen(false)}
                      className="w-full text-zinc-500 hover:text-zinc-300 text-xs font-medium py-1.5 transition"
                    >
                      Keep working
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

        {/* Per-exercise History modal - opened from the "⋯" menu on any
            exercise card (renderExerciseCard/renderGroupedCard both set
            historyFor). Shows a weight-over-time chart (2+ numeric data
            points only) plus the full chronological list below it,
            drawn from the `history` prop that's already fetched for the
            Completed Workouts tab - no separate query. */}
        {historyFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="glass rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-white font-semibold text-sm">{historyFor.label}</p>
                <button
                  onClick={() => setHistoryFor(null)}
                  aria-label="Close"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {historyEntries.length === 0 ? (
                <p className="text-zinc-500 text-sm py-6 text-center">
                  No history logged for this exercise yet.
                </p>
              ) : (
                <>
                  {historyChartPoints.length >= 2 && renderWeightChart(historyChartPoints)}
                  <div className="space-y-2">
                    {historyEntries.map((entry) => (
                      <div key={entry.sessionId} className="glass rounded-xl px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-white text-xs font-medium">
                            Week {entry.week}, Day {entry.day}
                            {entry.label ? `: ${entry.label}` : ''}
                          </span>
                          <span className="text-zinc-500 text-[11px] whitespace-nowrap">
                            {new Date(entry.completedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-zinc-400 text-xs">
                          {entry.sets.map((s) => `${s.weight ?? '-'}x${s.reps ?? '-'}`).join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Which week the highlighted "up next" cell falls in - used to give
  // that one week card a slightly brighter treatment than the rest, so
  // the eye lands on the right place first without anything loud.
  const currentWeek = nextDueKey
    ? allCells.find((c) => c.key === nextDueKey)!.week
    : weekNumbers[weekNumbers.length - 1]

  const totalCells = allCells.length
  const doneCells = completedSet.size

  return (
    <div className="space-y-4">
      {/* Fixed percentage-of-program line (progressBracketMessage), not
          the random celebration pool - that one now lives exclusively
          in the finish-workout modal below. Pops in via
          celebrationVisible's one-frame-delayed scale/opacity flip,
          stays up briefly, then fades back out and unmounts on its own
          (see the justFinished effect above) - kept deliberately
          simple, one line, no icon, per Satish's ask not to overbuild
          this part. */}
      {justFinished && totalCells > 0 && (
        <div
          className={`text-orange-400 text-sm font-medium transition-all duration-300 ease-out ${
            celebrationVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          }`}
        >
          {progressBracketMessage(Math.round((doneCells / totalCells) * 100))}
        </div>
      )}

      {/* Blocking finish-workout celebration modal - appears the
          instant Finish Workout completes (see celebrationModalOpen in
          finishWorkout), stays up until one of its own two buttons is
          tapped. No backdrop-click dismiss and no auto-timeout, unlike
          the inline banner above - Satish's explicit call for a real
          blocking modal here, since this is the actual "stop and
          register what you did" moment; the banner is just a residual
          afterglow once you're back on the overview screen. */}
      {celebrationModalOpen && celebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass rounded-2xl p-6 max-w-sm w-full text-center">
            <celebration.Icon className="w-9 h-9 text-orange-400 mx-auto mb-3" aria-hidden="true" />
            <p className="text-white text-lg font-semibold mb-6">{celebration.text}</p>
            <div className="space-y-2">
              {/* "Post a win" is the bold primary - Satish's pick.
                  Navigates to the feed with its always-visible post box
                  already scrolled into view, focused, and filled in
                  with a random day-name+💪 line (pickWinPostText) -
                  nothing to open, it's just there ready to edit or
                  post as-is. */}
              <button
                onClick={() => {
                  const text = pickWinPostText(finishedDayLabel || "today's workout")
                  setCelebrationModalOpen(false)
                  router.push(`/feed?prefill=${encodeURIComponent(text)}`)
                }}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold py-3 rounded-xl transition"
              >
                Post a win in the community
              </button>
              <button
                onClick={() => setCelebrationModalOpen(false)}
                className="w-full border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-sm font-semibold py-3 rounded-xl transition"
              >
                Continue to program
              </button>
            </div>
          </div>
        </div>
      )}

      {programComplete && (
        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-white font-semibold mb-1">You&apos;ve completed this program 🎉</p>
          <p className="text-zinc-400 text-sm">Pick a fresh program whenever you&apos;re ready for what&apos;s next.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all"
            style={{ width: `${totalCells > 0 ? (doneCells / totalCells) * 100 : 0}%` }}
          />
        </div>
        <span className="text-zinc-400 text-xs whitespace-nowrap">
          {doneCells} / {totalCells}
        </span>
      </div>

      {/* Horizontal week-jump bar - scrolls with the page (not pinned),
          just a fast way to hop to a week's card below instead of
          scrolling past everything in between on a long program.
          Highlights the "up next" week the same way its card below
          does, so both agree on where you'd naturally look first. */}
      {weekNumbers.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {weekNumbers.map((week) => {
            const isCurrentWeek = week === currentWeek && !programComplete
            return (
              <button
                key={week}
                onClick={() =>
                  document.getElementById(`week-${week}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                  isCurrentWeek
                    ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                    : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                }`}
              >
                Week {week}
              </button>
            )
          })}
        </div>
      )}

      {weekNumbers.map((week) => {
        const weekCells = allCells.filter((c) => c.week === week)
        const weekDone = weekCells.filter((c) => completedSet.has(c.key)).length
        const isCurrentWeek = week === currentWeek && !programComplete

        return (
          <div
            key={week}
            id={`week-${week}`}
            className={`rounded-2xl p-3.5 transition scroll-mt-20 ${
              isCurrentWeek
                ? 'bg-orange-500/[0.06] border border-orange-500/30'
                : 'bg-zinc-950/60 border border-zinc-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-white text-sm font-medium">Week {week}</span>
              <span
                className={`text-xs whitespace-nowrap ${
                  isCurrentWeek ? 'text-orange-400 font-medium' : 'text-zinc-500'
                }`}
              >
                {weekDone} / {weekCells.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {weekCells.map((cell) => {
                const isDone = completedSet.has(cell.key)
                const isNextDue = cell.key === nextDueKey
                const isExpanded = expandedDayKeys.has(cell.key)
                // Only build the (moderately expensive) preview
                // sections for days that are actually expanded - no
                // point doing this work for every collapsed row.
                const sections = isExpanded ? buildPreviewSections(cell.exercises) : []
                const dayPhaseCollapse = expandedDayPhases[cell.key] ?? new Set(['warmup', 'cooldown'])
                const dayButtonClass = isNextDue
                  ? `bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/15${
                      isExpanded ? ' rounded-b-none border-b-0' : ''
                    }`
                  : `hover:bg-zinc-900/60${isExpanded ? ' bg-zinc-900/60' : ''}`
                return (
                  <div key={cell.key}>
                    <button
                      onClick={() => toggleDayExpanded(cell)}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${dayButtonClass}`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full shrink-0 ${
                          isDone
                            ? 'bg-orange-500'
                            : isNextDue
                              ? 'border-2 border-orange-500'
                              : 'border-2 border-zinc-700'
                        }`}
                      />
                      <span
                        className={`text-sm font-medium flex-1 ${isDone ? 'text-zinc-500' : 'text-white'}`}
                      >
                        Day {cell.day}: {cell.label}
                      </span>
                      {isNextDue && !isExpanded && (
                        <span className="text-orange-500 text-xs font-semibold whitespace-nowrap">
                          Up next
                        </span>
                      )}
                      <span className="text-zinc-500 text-xs shrink-0" aria-hidden="true">
                        {isExpanded ? '▴' : '▾'}
                      </span>
                    </button>

                    {/* Inline day preview - expands in place instead of
                        navigating to a separate screen, per Satish's
                        explicit ask, and more than one day can stay
                        expanded at once. */}
                    {isExpanded && (
                      <div
                        className={`rounded-b-xl px-3 pt-2 pb-3 bg-black ${
                          isNextDue ? 'border border-t-0 border-orange-500/40' : ''
                        }`}
                      >
                        <p className="text-zinc-500 text-xs mb-2">
                          {cell.exercises.length} exercise{cell.exercises.length === 1 ? '' : 's'}
                        </p>
                        <div className="space-y-3">
                          {sections.map((section, sectionIndex) => {
                            const sectionExerciseCount = section.items.reduce(
                              (sum, item) => sum + (item.type === 'single' ? 1 : item.blocks.length),
                              0
                            )
                            const collapsed = dayPhaseCollapse.has(section.phase)
                            return (
                              <div
                                key={section.phase}
                                className={sectionIndex === 0 ? '' : 'pt-3 border-t border-zinc-800'}
                              >
                                <button
                                  onClick={() => toggleDayPhaseCollapsed(cell.key, section.phase)}
                                  className="w-full flex items-center justify-between gap-2 mb-2"
                                >
                                  <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">
                                    {PHASE_LABELS_PREVIEW[section.phase]} · {sectionExerciseCount} exercise
                                    {sectionExerciseCount === 1 ? '' : 's'}
                                  </span>
                                  <span className="text-zinc-500 text-xs font-medium normal-case shrink-0">
                                    {collapsed ? 'Show ▾' : 'Hide ▴'}
                                  </span>
                                </button>
                                {!collapsed && (
                                  <div className="space-y-1.5">
                                    {section.items.map((item) =>
                                      item.type === 'single' ? (
                                        <div
                                          key={item.block.id}
                                          className="glass rounded-xl px-3 py-2 flex items-center justify-between gap-3"
                                        >
                                          <span className="text-white text-sm">{item.block.name}</span>
                                          <span className="text-zinc-500 text-xs text-right shrink-0">
                                            {item.block.setsCount} x {item.block.reps}
                                            {item.block.restSeconds ? (
                                              <span className="text-zinc-600">
                                                {' '}
                                                · rest {formatDurationLabel(item.block.restSeconds)}
                                              </span>
                                            ) : null}
                                            {item.block.timerSeconds ? (
                                              <span className="text-zinc-600">
                                                {' '}
                                                · {formatDurationLabel(item.block.timerSeconds)} timer
                                              </span>
                                            ) : null}
                                          </span>
                                        </div>
                                      ) : (
                                        <div key={item.groupId} className="glass rounded-xl px-3 py-2.5">
                                          <p className="text-zinc-400 text-xs font-medium mb-1.5">
                                            Round x {item.blocks[0].setsCount}
                                          </p>
                                          <div className="space-y-1">
                                            {item.blocks.map((b) => (
                                              <div key={b.id} className="flex items-center justify-between gap-3">
                                                <span className="text-white text-sm">{b.name}</span>
                                                <span className="text-zinc-500 text-xs text-right shrink-0">
                                                  {b.reps}
                                                  {b.restSeconds ? (
                                                    <span className="text-zinc-600">
                                                      {' '}
                                                      · rest {formatDurationLabel(b.restSeconds)}
                                                    </span>
                                                  ) : null}
                                                  {b.timerSeconds ? (
                                                    <span className="text-zinc-600">
                                                      {' '}
                                                      · {formatDurationLabel(b.timerSeconds)} timer
                                                    </span>
                                                  ) : null}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => openStartPopup(cell)}
                          className="w-full mt-3 bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold py-2.5 rounded-xl transition"
                        >
                          Start Workout
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Start-mode popup - opened by "Start Workout" inside an
          expanded day row. Replaces the old one-time-only List-vs-
          Guided explainer: the explanation now lives inside the choice
          itself and shows every time, since seeing it only after
          already tapping Start (the old flow) was backwards. Tapping
          either block is what actually commits into startCell. */}
      {startPopupCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-white font-semibold text-sm">
                Day {startPopupCell.day}: {startPopupCell.label}
              </p>
              <button
                onClick={closeStartPopup}
                aria-label="Cancel"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="3" y1="3" x2="13" y2="13" strokeLinecap="round" />
                  <line x1="13" y1="3" x2="3" y2="13" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => commitStart(startPopupCell, 'list')}
              className="w-full text-left bg-orange-500 hover:bg-orange-400 text-black rounded-xl p-3.5 mb-2 transition"
            >
              <p className="font-semibold text-sm mb-1">Start as a list</p>
              <p className="text-black/70 text-xs leading-relaxed">
                See every exercise on one screen - log sets at your own pace and jump around freely.
              </p>
            </button>

            {startPopupCell.exercises.length > 1 && (
              <button
                onClick={() => commitStart(startPopupCell, 'guided')}
                className="w-full text-left bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl p-3.5 transition"
              >
                <p className="font-semibold text-sm mb-1">Start as guided</p>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Walk through one exercise (or round) at a time, with rest between each - better if
                  you&apos;d rather be led through it.
                </p>
              </button>
            )}

            <p className="text-zinc-600 text-xs mt-3 text-center">
              Don&apos;t worry - you can always switch between the two mid-workout.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
