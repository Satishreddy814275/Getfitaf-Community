'use client'

import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { logWorkoutSession, requestExerciseVideo, swapExercise } from '@/app/workouts/actions'
import { parseTargetSetCount } from '@/lib/workoutPlan'
import { findExerciseVideo, youtubeSearchUrl, type ExerciseVideo } from '@/lib/exerciseVideos'
import type { WorkoutPlanDay, LastLoggedSet, WorkoutExerciseSwap } from '@/types'

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

interface Draft {
  cell: Cell
  sets: Record<string, SetRow[]>
  // Where the guided player was, so resuming a closed tab lands back
  // on roughly the right exercise instead of restarting at the top.
  // Optional so old drafts saved before this existed still parse fine.
  guidedIndex?: number
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

function saveDraft(generationId: string, cell: Cell, sets: Record<string, SetRow[]>, guidedIndex: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DRAFT_KEY_PREFIX + generationId, JSON.stringify({ cell, sets, guidedIndex }))
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

// True when this index is the first exercise of its round - i.e. the
// round number here differs from the previous exercise's. Derived
// straight from the array position rather than tracked through
// session state, so it works identically whether arriving here via
// normal forward progress or resuming a draft partway through.
function isFirstOfRound(exercises: CellExercise[], index: number): boolean {
  const round = exercises[index]?.round
  if (round == null) return false
  return exercises[index - 1]?.round !== round
}

// Same idea as isFirstOfRound, one level up - true the moment the
// phase changes (warmup -> main -> cooldown), so a phase screen shows
// at most 2-3 times across a whole day no matter how many rounds or
// sets "main" contains. Content that never sets phase never triggers
// this.
function isFirstOfPhase(exercises: CellExercise[], index: number): boolean {
  const phase = exercises[index]?.phase
  if (phase == null) return false
  return exercises[index - 1]?.phase !== phase
}

function phaseIntroText(phase: 'warmup' | 'main' | 'cooldown'): string {
  if (phase === 'warmup') return "Let's warm up"
  if (phase === 'main') return 'Time for the main workout'
  return "Nice work, let's cool down."
}

// Strips a trailing "(N)" set-number suffix - "Squats (2)" -> "Squats".
// Deliberately only matches a bare number in parens, not "(Round 2)"
// or "(Warm-Up)" etc., so round-tagged and one-off exercises are
// never accidentally grouped - only the straight-set unrolling
// convention (see seed content) uses this exact "(N)" shape.
function baseName(name: string): string {
  return name.replace(/\s\(\d+\)$/, '')
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
  videos,
  swaps,
}: {
  generationId: string
  days: WorkoutPlanDay[]
  completedCells: string[]
  lastByExercise: Record<string, LastLoggedSet>
  videos: ExerciseVideo[]
  swaps: WorkoutExerciseSwap[]
}) {
  const [activeCell, setActiveCell] = useState<Cell | null>(null)
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({})
  const [isPending, startTransition] = useTransition()
  const [justFinished, setJustFinished] = useState(false)
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
  const restoredRef = useRef(false)
  // Guided one-at-a-time player state, only relevant on round-based
  // days (see hasGuidedFlow below) - single-exercise days ignore all of this.
  // Every day always lands on the list first (an overview of what's
  // coming, not the player) - guided mode is only ever entered by
  // explicitly tapping "Start Now"/"Continue", never the default on
  // arrival. guidedIndex/Phase are per-session. 'roundIntro' is the
  // "Round N starts" interstitial shown on the first exercise of each
  // round; 'done' is reached after the last exercise (rest or not)
  // with nothing left to advance to.
  const [viewMode, setViewMode] = useState<'guided' | 'list'>('list')
  const [guidedIndex, setGuidedIndex] = useState(0)
  const [guidedPhase, setGuidedPhase] = useState<'roundIntro' | 'exercise' | 'rest' | 'done'>('exercise')
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

  // Moves the guided player forward one exercise, landing on
  // 'roundIntro' if that next exercise starts a new round or plain
  // 'exercise' otherwise. Reads activeCell/guidedIndex fresh each call
  // rather than via functional state updates, which is fine since this
  // only ever runs from a click handler or the auto-advance effect
  // below, never concurrently with itself.
  function advanceGuided() {
    if (!activeCell) return
    const nextIndex = guidedIndex + 1
    if (nextIndex >= activeCell.exercises.length) {
      setGuidedPhase('done')
      return
    }
    setGuidedIndex(nextIndex)
    setGuidedPhase(
      isFirstOfRound(activeCell.exercises, nextIndex) || isFirstOfPhase(activeCell.exercises, nextIndex)
        ? 'roundIntro'
        : 'exercise'
    )
  }

  // Tapping "Done" on the current exercise either starts its rest
  // timer (most circuit moves have one) or, for the rare exercise with
  // no rest configured, skips straight to the next one.
  function handleGuidedDone(ex: CellExercise) {
    if (ex.restSeconds != null) {
      startRestTimer(ex.restSeconds)
      setGuidedPhase('rest')
    } else {
      advanceGuided()
    }
  }

  function toggleViewMode() {
    setViewMode((prev) => (prev === 'guided' ? 'list' : 'guided'))
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
      setActiveCell(draft.cell)
      setSetsByExercise(draft.sets)
      const index = draft.guidedIndex ?? 0
      setGuidedIndex(index)
      setGuidedPhase(
        isFirstOfRound(draft.cell.exercises, index) || isFirstOfPhase(draft.cell.exercises, index)
          ? 'roundIntro'
          : 'exercise'
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
    if (!activeCell) return
    saveDraft(generationId, activeCell, setsByExercise, guidedIndex)
  }, [generationId, activeCell, setsByExercise, guidedIndex])

  function startCell(cell: Cell) {
    // Pre-fill one row per target set (e.g. "3-5" -> 3 rows) - just a
    // starting point, the +/- controls below let them adjust freely.
    const initial: Record<string, SetRow[]> = {}
    for (const ex of cell.exercises) {
      const count = parseTargetSetCount(ex.sets)
      initial[ex.name] = Array.from({ length: count }, () => ({ weight: '', reps: '' }))
    }
    setSetsByExercise(initial)
    setActiveCell(cell)
    setJustFinished(false)
    setSwapPanelFor(null)
    setSwapInput('')
    setOverflowOpenFor(null)
    setRestPickerFor(null)
    setRestTimer(null)
    setGuidedIndex(0)
    setGuidedPhase(
      isFirstOfRound(cell.exercises, 0) || isFirstOfPhase(cell.exercises, 0) ? 'roundIntro' : 'exercise'
    )
    setViewMode('list')
  }

  // Single close action for the session - replaces what used to be
  // two separate controls ("Back to your program" + "Discard
  // workout") that said almost the same thing in two places. Silent
  // if nothing's been typed yet (nothing to lose), otherwise confirms
  // with the same explicit wording every time - one unambiguous way
  // out instead of several half-redundant ones.
  function handleCloseSession() {
    const hasAnyInput = Object.values(setsByExercise).some((rows) =>
      rows.some((r) => r.weight.trim() !== '' || r.reps.trim() !== '')
    )
    if (
      hasAnyInput &&
      !confirm('This is going to erase all progress in the workout. Would you like to continue?')
    ) {
      return
    }
    clearDraft(generationId)
    setActiveCell(null)
    setSwapPanelFor(null)
    setSwapInput('')
    setOverflowOpenFor(null)
    setRestPickerFor(null)
    setRestTimer(null)
    setGuidedIndex(0)
    setGuidedPhase('exercise')
    setViewMode('list')
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
  }

  function addSetRow(exerciseName: string) {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseName]: [...(prev[exerciseName] || []), { weight: '', reps: '' }],
    }))
  }

  function removeSetRow(exerciseName: string, index: number) {
    setSetsByExercise((prev) => {
      const rows = [...(prev[exerciseName] || [])]
      rows.splice(index, 1)
      return { ...prev, [exerciseName]: rows }
    })
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
      setRestTimer(null)
    })
  }

  if (activeCell) {
    // Suggestions only, not a restriction - the input still accepts
    // free text, this just surfaces exercises we already have videos
    // for so a swap is more likely to land somewhere they can
    // immediately watch a demo.
    const exerciseSuggestions = Array.from(new Set(videos.map((v) => v.exerciseName))).sort()

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
    const currentEx: CellExercise | undefined = exercises[guidedIndex]
    const currentRound = currentEx?.round ?? null
    const roundExercises = currentRound != null ? exercises.filter((ex) => ex.round === currentRound) : []
    const posInRound = currentEx ? roundExercises.indexOf(currentEx) + 1 : 0
    // List-view-only grouping: consecutive non-round entries sharing a
    // base name (Squats (1), (2), (3)) are one visual card with
    // stacked set rows, instead of three near-identical cards in a
    // row. Round-tagged entries never merge (their names carry "Round
    // N", not a bare "(N)"), so they always come through as their own
    // singleton group and render exactly as before. Guided view still
    // walks the raw exercises array one entry at a time regardless -
    // this grouping is purely cosmetic for the list.
    const listGroups: CellExercise[][] = []
    for (const ex of exercises) {
      const prev = listGroups[listGroups.length - 1]
      if (prev && ex.round == null && prev[0].round == null && baseName(ex.originalName) === baseName(prev[0].originalName)) {
        prev.push(ex)
      } else {
        listGroups.push([ex])
      }
    }
    // Only rendered while the roundIntro screen is showing - whether
    // *this* transition is a phase change (warmup->main->cooldown) as
    // opposed to just a same-phase round bump (round 2, 3... within
    // main). Phase takes headline priority when both happen at once
    // (main phase's round 1), since "Time for the main workout" says
    // more than "Round 1 starts" would on its own.
    const introIsPhaseFirst = isFirstOfPhase(exercises, guidedIndex)
    const introPhase = introIsPhaseFirst ? currentEx?.phase ?? null : null

    // The interactive body of a single exercise - video/timer/overflow
    // row, swap panel, rest picker, and the set-logging inputs. Shared
    // between the list view (one per card, all shown at once) and the
    // guided view (just the current one, rendered larger since it's
    // the sole focus of the screen there) so neither mode duplicates
    // this logic. Rest is deliberately not shown inline here anymore -
    // list view surfaces it as a strip between cards instead (see
    // below), and guided view's "Done" button already states it.
    function renderExerciseCard(ex: CellExercise, options?: { large?: boolean }) {
      const large = options?.large ?? false
      const last = lastByExercise[ex.name]
      const video = findExerciseVideo(ex.name, videos)
      const alreadyRequested = requestedVideos.has(ex.name)
      const swapOpen = swapPanelFor === ex.originalName
      const overflowOpen = overflowOpenFor === ex.originalName
      const restPickerOpen = restPickerFor === ex.originalName
      return (
        <div className={large ? 'glass rounded-2xl p-6 text-center' : 'glass rounded-2xl p-4'}>
          <div
            className={
              large
                ? 'mb-3'
                : 'flex items-baseline justify-between mb-1 gap-2'
            }
          >
            <p className={large ? 'text-white text-2xl font-bold mb-1' : 'text-white font-semibold'}>
              {ex.name}
            </p>
            <p className={large ? 'text-zinc-400 text-sm' : 'text-zinc-500 text-xs whitespace-nowrap'}>
              Target: {ex.sets} x {ex.reps}
            </p>
          </div>
          {ex.name !== ex.originalName && (
            <p className="text-zinc-600 text-[11px] mb-1">Swapped from {ex.originalName}</p>
          )}
          {last && (
            <p className="text-zinc-500 text-xs mb-2">
              Last time: {last.weight ?? '-'} x {last.reps ?? '-'}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-3">
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
                  Search on YouTube ↗
                </a>
              )}
              {ex.timerSeconds ? (
                <>
                  <button
                    onClick={() =>
                      ex.perSide ? startSideTimer(ex, false) : startRestTimer(ex.timerSeconds!)
                    }
                    className="text-xs font-medium text-orange-400 hover:text-orange-300 transition"
                  >
                    ▶ {formatDurationLabel(ex.timerSeconds)} timer
                  </button>
                  <button
                    onClick={() => setRestPickerFor(restPickerOpen ? null : ex.originalName)}
                    className="text-xs font-medium text-zinc-400 hover:text-white transition"
                  >
                    ⏱ custom
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setRestPickerFor(restPickerOpen ? null : ex.originalName)}
                  className="text-xs font-medium text-zinc-400 hover:text-white transition"
                >
                  ⏱ Timer
                </button>
              )}
            </div>

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
                  <div className="absolute right-0 top-full mt-1 min-w-[170px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg py-1 z-20">
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
                  </div>
                </>
              )}
            </div>
          </div>

          {ex.perSide && ex.timerSeconds != null && awaitingOtherSideFor === ex.originalName && (
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

          <div className="space-y-2 mt-3 pt-3 border-t border-zinc-800">
            {(setsByExercise[ex.name] || []).map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs w-11 shrink-0">Set {i + 1}</span>
                {ex.trackWeight !== false && (
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={last?.weight != null ? String(last.weight) : 'weight'}
                    value={row.weight}
                    onChange={(e) => updateSet(ex.name, i, 'weight', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                  />
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={ex.reps || 'reps'}
                  value={row.reps}
                  onChange={(e) => updateSet(ex.name, i, 'reps', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                />
                <button
                  onClick={() => removeSetRow(ex.name, i)}
                  aria-label="Remove set"
                  className="text-zinc-600 hover:text-red-400 transition text-sm shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => addSetRow(ex.name)}
              className="text-xs text-orange-400 hover:text-orange-300 transition"
            >
              + Add set
            </button>
          </div>
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
    function renderGroupedCard(group: CellExercise[]) {
      const rep = group[0]
      const last = lastByExercise[rep.name]
      const video = findExerciseVideo(rep.name, videos)
      const alreadyRequested = requestedVideos.has(rep.name)
      const swapOpen = swapPanelFor === rep.originalName
      const overflowOpen = overflowOpenFor === rep.originalName
      const restPickerOpen = restPickerFor === rep.originalName
      const label = baseName(rep.name)
      return (
        <div className="glass rounded-2xl p-4">
          <div className="flex items-baseline justify-between mb-1 gap-2">
            <p className="text-white font-semibold">{label}</p>
            <p className="text-zinc-500 text-xs whitespace-nowrap">
              Target: {group.length} x {rep.reps}
            </p>
          </div>
          {rep.name !== rep.originalName && (
            <p className="text-zinc-600 text-[11px] mb-1">Swapped from {baseName(rep.originalName)}</p>
          )}
          {last && (
            <p className="text-zinc-500 text-xs mb-2">
              Last time: {last.weight ?? '-'} x {last.reps ?? '-'}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-3">
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
                  Search on YouTube ↗
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
                    className="text-xs font-medium text-zinc-400 hover:text-white transition"
                  >
                    ⏱ custom
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setRestPickerFor(restPickerOpen ? null : rep.originalName)}
                  className="text-xs font-medium text-zinc-400 hover:text-white transition"
                >
                  ⏱ Timer
                </button>
              )}
            </div>

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

          <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
            {group.map((ex, i) => {
              const rows = setsByExercise[ex.name] || []
              const row = rows[0]
              return (
                <Fragment key={ex.originalName}>
                  <div className={`flex items-center gap-2 ${i === 0 ? '' : 'pt-2 border-t border-zinc-800/60'}`}>
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
                    {ex.trackWeight !== false && (
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={last?.weight != null ? String(last.weight) : 'weight'}
                        value={row?.weight ?? ''}
                        onChange={(e) => updateSet(ex.name, 0, 'weight', e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                      />
                    )}
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={ex.reps || 'reps'}
                      value={row?.reps ?? ''}
                      onChange={(e) => updateSet(ex.name, 0, 'reps', e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600"
                    />
                  </div>
                  {ex.restSeconds != null && (
                    <div className="flex justify-end pb-1">
                      <button
                        onClick={() => startRestTimer(ex.restSeconds!)}
                        className="text-orange-400 hover:text-orange-300 text-xs font-medium transition"
                      >
                        ▶ {formatDurationLabel(ex.restSeconds)}
                      </button>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div>
        <datalist id="exercise-swap-suggestions">
          {exerciseSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {/* Fixed to the viewport, not the page - stays visible no
            matter how far into the exercise list you've scrolled,
            unlike the old version which lived inside the sticky
            Finish Workout bar and only came into view once you'd
            scrolled all the way back down. Offset below both header
            heights (top-16/top-20) so it doesn't sit under the logo
            and notification bell at the very top of the page.
            Suppressed during the guided player's own rest screen,
            which already shows this same countdown as its main
            content - no need for both at once. */}
        {restTimer && !(effectiveMode === 'guided' && guidedPhase === 'rest') && (
          <div className="fixed top-16 sm:top-20 right-4 z-40 flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full shadow-lg pl-3 pr-2 py-2">
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

        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-white text-lg font-bold">
              Week {activeCell.week}, Day {activeCell.day}: {activeCell.label}
            </h2>
            {exercises.length > 0 && (
              <p className="text-zinc-500 text-xs mt-0.5">
                {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
              </p>
            )}
            {activeCell.notes && (
              <p className="text-orange-400/80 text-xs mt-1">{activeCell.notes}</p>
            )}
          </div>
          <button
            onClick={handleCloseSession}
            aria-label="Close workout"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="3" x2="13" y2="13" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {effectiveMode === 'list' ? (
          <div className="mt-4">
            {/* The primary way into the guided player - always shown as
                an overview first (per how this reads best: see what's
                coming, then commit to running through it) rather than
                defaulting straight into the player on arrival. Label
                reflects whether this is a fresh start or picking back
                up partway through. */}
            {hasGuidedFlow && (
              <button
                onClick={toggleViewMode}
                className="w-full bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold py-3 rounded-xl transition mb-4"
              >
                ▶ {guidedIndex > 0 && guidedPhase !== 'done' ? 'Continue' : 'Start Now'}
              </button>
            )}
            <div className="space-y-4">
              {listGroups.map((group) => {
                const first = group[0]
                const i = exercises.indexOf(first)
                const isRoundCard = first.round != null
                return (
                <Fragment key={first.originalName}>
                  {isRoundCard && isFirstOfRound(exercises, i) && (
                    <p
                      className={`text-orange-400 text-xs font-bold uppercase tracking-wider ${
                        i === 0 ? '' : 'pt-3 border-t border-zinc-800'
                      }`}
                    >
                      Round {first.round}
                    </p>
                  )}
                  {isRoundCard ? renderExerciseCard(first) : renderGroupedCard(group)}
                  {isRoundCard && first.restSeconds != null && i < exercises.length - 1 && (
                    <div className="flex items-center gap-2 -mt-2">
                      <div className="flex-1 h-px bg-zinc-800" />
                      <button
                        onClick={() => startRestTimer(first.restSeconds!)}
                        className="text-orange-400 hover:text-orange-300 text-xs font-medium whitespace-nowrap transition"
                      >
                        ▶ Rest {formatDurationLabel(first.restSeconds)}
                      </button>
                      <div className="flex-1 h-px bg-zinc-800" />
                    </div>
                  )}
                </Fragment>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <button
              onClick={toggleViewMode}
              className="text-xs font-medium text-zinc-400 hover:text-white transition"
            >
              ← Switch to list view
            </button>

            {guidedPhase !== 'done' && (
              <p className="text-zinc-500 text-xs text-center">
                {currentRound != null
                  ? `Round ${currentRound} of ${totalRounds} · Exercise ${posInRound} of ${roundExercises.length}`
                  : `Exercise ${guidedIndex + 1} of ${exercises.length}`}
              </p>
            )}

            {guidedPhase === 'roundIntro' && (currentRound != null || introPhase != null) && (
              <div className="glass rounded-2xl p-8 text-center">
                <p className="text-white text-xl font-bold mb-2">
                  {introPhase ? phaseIntroText(introPhase) : `Round ${currentRound} starts`}
                </p>
                {introPhase && currentRound != null && (
                  <p className="text-zinc-400 text-sm mb-6">
                    Round {currentRound} of {totalRounds}
                  </p>
                )}
                {!introPhase && currentRound != null && (
                  <p className="text-zinc-400 text-sm mb-6">
                    {roundExercises.length} exercise{roundExercises.length === 1 ? '' : 's'} this round
                  </p>
                )}
                {introPhase === 'cooldown' && (
                  <p className="text-zinc-500 text-xs mb-6">Don&apos;t ignore this.</p>
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
              <div className="glass rounded-2xl p-8 text-center">
                {/* guidedIndex still points at the just-finished
                    exercise here - advanceGuided() only moves it once
                    this rest ends - so both names are available
                    exactly when someone would want to see them: right
                    as they start resting, before the next card
                    replaces this screen. */}
                <div className="flex items-center justify-between gap-2 mb-3 text-left">
                  <span className="text-zinc-500 text-xs">Finished {currentEx.name}</span>
                  {exercises[guidedIndex + 1] && (
                    <span className="text-zinc-500 text-xs text-right">
                      Up next: {exercises[guidedIndex + 1].name}
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-sm mb-2">Rest</p>
                <p className="text-white text-5xl font-bold tabular-nums mb-4">
                  {formatRestTime(restTimer.remaining)}
                </p>
                <div className="flex items-center justify-center gap-3 mb-4">
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
              </div>
            )}

            {guidedPhase === 'exercise' && currentEx && (
              <>
                {renderExerciseCard(currentEx, { large: true })}
                <button
                  onClick={() => handleGuidedDone(currentEx)}
                  className="w-full bg-orange-500 hover:bg-orange-400 text-black text-sm font-semibold py-3 rounded-xl transition"
                >
                  {currentEx.restSeconds != null
                    ? `Done - start ${formatDurationLabel(currentEx.restSeconds)} rest`
                    : guidedIndex === exercises.length - 1
                      ? 'Done'
                      : 'Done - next exercise'}
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

        {/* Pinned above the mobile bottom tab bar (bottom-16 matches
            the pb-16 clearance layout.tsx already gives page content)
            so the primary action never requires scrolling back down
            through a long session to reach - normal, non-sticky flow
            on desktop (sm:static) where that isn't a concern. Extra
            top margin (mt-10 vs the rest of the page's mt-4/mt-6) and
            the caption right above it are both there so this doesn't
            read as "the next step" of the guided player's rest/exercise
            screens sitting right above it - it's a separate, rarer
            action, not part of that flow. */}
        <div className="sticky bottom-16 sm:static z-30 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-3 sm:pb-0 mt-10 bg-[#0a0a0a]/95 backdrop-blur sm:bg-transparent sm:backdrop-blur-none border-t border-zinc-800 sm:border-0">
          <p className="text-zinc-500 text-[11px] text-center mb-2">
            Only tap this once every exercise is logged
          </p>
          <button
            onClick={finishWorkout}
            disabled={isPending}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold py-3 rounded-xl transition"
          >
            {isPending ? 'Saving...' : 'Finish Workout'}
          </button>
        </div>
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
    <div className="space-y-5">
      {justFinished && (
        <p className="text-sm text-orange-400">Nice work - that session&apos;s logged.</p>
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

      {weekNumbers.map((week) => {
        const weekCells = allCells.filter((c) => c.week === week)
        const weekDone = weekCells.filter((c) => completedSet.has(c.key)).length
        const isCurrentWeek = week === currentWeek && !programComplete

        return (
          <div
            key={week}
            className={`rounded-2xl p-4 transition ${
              isCurrentWeek
                ? 'bg-orange-500/[0.06] border border-orange-500/30'
                : 'bg-zinc-950/60 border border-zinc-700/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-white text-sm font-medium">Week {week}</span>
              <span
                className={`text-xs whitespace-nowrap ${
                  isCurrentWeek ? 'text-orange-400 font-medium' : 'text-zinc-500'
                }`}
              >
                {weekDone} / {weekCells.length}
              </span>
            </div>
            <div className="space-y-2">
              {weekCells.map((cell) => {
                const isDone = completedSet.has(cell.key)
                const isNextDue = cell.key === nextDueKey
                return (
                  <button
                    key={cell.key}
                    onClick={() => startCell(cell)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isNextDue
                        ? 'bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/15'
                        : 'hover:bg-zinc-900/60'
                    }`}
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
                    {isNextDue && (
                      <span className="text-orange-500 text-xs font-semibold whitespace-nowrap">
                        Up next
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
