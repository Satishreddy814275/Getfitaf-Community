'use client'

import { useEffect, useState, type RefObject } from 'react'
import { getMentionableMembers } from '@/app/feed/actions'
import type { MentionCandidate } from './mentions'
import type { Space } from '@/types'

// Shared @mention autocomplete logic, extracted so PostComposer (new
// posts), PostCard (top-level comments), and CommentThread (replies)
// all drive the same trigger-detection/fetch/insert behavior instead
// of three near-identical copies (Satish 2026-08-04: wanted the same
// tagging capability on comments too, opt-in only - not auto-inserted
// on reply, since replying already notifies the right person via
// post_comment/comment_reply).
//
// Satish 2026-08-13: picking a name used to insert the raw
// "@[Full Name](id)" marker directly into the visible box - correct
// data, but it read like exposed database syntax while composing (it
// only ever rendered as a clean highlighted mention AFTER posting, via
// FormattedPostText). Now the box shows plain "@Full Name" the whole
// time - the box's own value is what's typed/edited natively, with no
// translation layer on keystrokes - and a separate `mentionSpans` list
// tracks which "@Full Name" substrings are real, notification-worthy
// mentions vs. plain text the user happened to type. Every edit
// (typing, deleting, pasting) is diffed against the previous value to
// shift or drop spans, same technique most mention-aware text editors
// use: touch a span at all (even partially) and it demotes back to
// plain text rather than trying to guess what the edit meant - editing
// "into" a mention un-mentioning it is the expected, safe behavior.
// getSubmitContent() is what turns the tracked spans back into real
// "@[Name](id)" markers for the server - the box itself never shows
// that format.

export interface MentionTrigger {
  atIndex: number
  query: string
}

interface MentionSpan {
  id: string
  name: string
  start: number
  end: number // exclusive, covers "@Name" (not the trailing space)
}

// Finds an in-progress "@query" ending exactly at the cursor - the
// character before "@" must be the start of the text or whitespace
// (so "email@x" mid-word never triggers this), and nothing between
// "@" and the cursor can be whitespace (so the trigger clears itself
// the moment you type a space, rather than staying open indefinitely).
function findMentionTrigger(text: string, cursor: number): MentionTrigger | null {
  const uptoCursor = text.slice(0, cursor)
  const at = uptoCursor.lastIndexOf('@')
  if (at === -1) return null
  const charBefore = at === 0 ? '' : uptoCursor[at - 1]
  if (charBefore && !/\s/.test(charBefore)) return null
  const query = uptoCursor.slice(at + 1)
  if (/\s/.test(query)) return null
  return { atIndex: at, query }
}

// Common-prefix/common-suffix diff between the previous and next box
// value - standard technique for figuring out "what actually changed"
// from a plain onChange event (which only gives you the final string,
// not the edit itself). Works for typing, backspace/delete, and
// paste-over-a-selection alike.
function diffEdit(oldStr: string, newStr: string) {
  const maxStart = Math.min(oldStr.length, newStr.length)
  let start = 0
  while (start < maxStart && oldStr[start] === newStr[start]) start++
  let oldEnd = oldStr.length
  let newEnd = newStr.length
  while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  return { editStart: start, deletedLength: oldEnd - start, insertedLength: newEnd - start }
}

// Shifts spans that sit entirely after an edit, drops any span the
// edit touches at all (even partially - see the module comment above
// for why that's the safe choice), and leaves untouched spans alone.
function adjustSpans(
  spans: MentionSpan[],
  editStart: number,
  deletedLength: number,
  insertedLength: number
): MentionSpan[] {
  const editEnd = editStart + deletedLength
  const delta = insertedLength - deletedLength
  const next: MentionSpan[] = []
  for (const span of spans) {
    if (span.end <= editStart) {
      next.push(span)
    } else if (span.start >= editEnd) {
      next.push({ ...span, start: span.start + delta, end: span.end + delta })
    }
    // else: edit overlaps this span - drop it, demoting back to plain text
  }
  return next
}

export function useMentionAutocomplete({
  space,
  content,
  setContent,
  inputRef,
}: {
  // Null when there's nowhere valid to post/comment yet (e.g. the
  // composer's "select a space above" state) - the hook just stays
  // inert until a real space is available.
  space: Space | null
  content: string
  setContent: (value: string) => void
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>
}) {
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null)
  const [candidates, setCandidates] = useState<MentionCandidate[] | null>(null)
  const [candidatesSpace, setCandidatesSpace] = useState<Space | null>(null)
  const [loading, setLoading] = useState(false)
  const [mentionSpans, setMentionSpans] = useState<MentionSpan[]>([])

  // Fetches the space-scoped candidate list the moment "@" is first
  // typed, not eagerly on mount - most posts/comments never use a
  // mention at all. Cached per space rather than re-fetched on every
  // "@" - the effect below invalidates the cache if space changes.
  useEffect(() => {
    if (!trigger || !space) return
    if (candidatesSpace === space) return
    let cancelled = false
    setLoading(true)
    getMentionableMembers(space)
      .then((members) => {
        if (cancelled) return
        setCandidates(members)
        setCandidatesSpace(space)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [trigger, space, candidatesSpace])

  useEffect(() => {
    setCandidates(null)
    setCandidatesSpace(null)
    setTrigger(null)
  }, [space])

  const matches = (candidates || [])
    .filter((m) => m.fullName.toLowerCase().includes((trigger?.query || '').toLowerCase()))
    .slice(0, 6)

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    const value = e.target.value
    const { editStart, deletedLength, insertedLength } = diffEdit(content, value)
    if (deletedLength > 0 || insertedLength > 0) {
      setMentionSpans((spans) => adjustSpans(spans, editStart, deletedLength, insertedLength))
    }
    setContent(value)
    setTrigger(findMentionTrigger(value, e.target.selectionStart ?? value.length))
  }

  function select(member: MentionCandidate) {
    if (!trigger) return
    const cursor = inputRef.current?.selectionStart ?? content.length
    // Plain "@Full Name " in the box - no brackets/id, that's tracked
    // separately in mentionSpans and only reassembled into the real
    // "@[Name](id)" marker at submit time (see getSubmitContent).
    const insertText = `@${member.fullName} `
    const next = content.slice(0, trigger.atIndex) + insertText + content.slice(cursor)
    const deletedLength = cursor - trigger.atIndex // the "@query" text being replaced
    setMentionSpans((spans) => {
      const adjusted = adjustSpans(spans, trigger.atIndex, deletedLength, insertText.length)
      const newSpan: MentionSpan = {
        id: member.id,
        name: member.fullName,
        start: trigger.atIndex,
        end: trigger.atIndex + 1 + member.fullName.length,
      }
      return [...adjusted, newSpan].sort((a, b) => a.start - b.start)
    })
    setContent(next)
    setTrigger(null)
    // Put the caret right after the inserted text+space, not wherever
    // it happened to land from the raw value swap above.
    requestAnimationFrame(() => {
      const node = inputRef.current
      if (!node) return
      const pos = trigger.atIndex + insertText.length
      node.focus()
      node.setSelectionRange(pos, pos)
    })
  }

  // Returns true if it handled the key (caller should skip its own
  // handling, e.g. not also treat Escape as "close the whole form").
  function handleKeyDown(e: React.KeyboardEvent): boolean {
    if (e.key === 'Escape' && trigger) {
      setTrigger(null)
      return true
    }
    return false
  }

  function reset() {
    setTrigger(null)
    setMentionSpans([])
  }

  // Reassembles the box's plain "@Full Name" display text back into
  // real "@[Full Name](id)" markers for the server - this is the only
  // place that format exists now; everywhere the user actually looks
  // at (the box itself) stays plain the whole time. Each span is
  // re-verified against the live content before being trusted (a span
  // whose text no longer reads "@Name" at its tracked position has
  // gone stale - e.g. an edit path that bypassed handleChange, like a
  // markdown-shortcut wrap - and is safely left as plain text instead
  // of risking a marker pointing at the wrong stretch of text).
  function getSubmitContent(): string {
    if (mentionSpans.length === 0) return content
    const sorted = [...mentionSpans].sort((a, b) => a.start - b.start)
    let result = ''
    let cursor = 0
    for (const span of sorted) {
      if (span.start < cursor) continue // overlapping/out-of-order - skip defensively
      const slice = content.slice(span.start, span.end)
      if (slice !== `@${span.name}`) continue
      result += content.slice(cursor, span.start)
      result += `@[${span.name}](${span.id})`
      cursor = span.end
    }
    result += content.slice(cursor)
    return result
  }

  return { trigger, matches, loading, handleChange, select, handleKeyDown, reset, getSubmitContent }
}
