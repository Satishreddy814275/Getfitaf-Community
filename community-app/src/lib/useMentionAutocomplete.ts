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

export interface MentionTrigger {
  atIndex: number
  query: string
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
    setContent(value)
    setTrigger(findMentionTrigger(value, e.target.selectionStart ?? value.length))
  }

  function select(member: MentionCandidate) {
    if (!trigger) return
    const cursor = inputRef.current?.selectionStart ?? content.length
    const marker = `@[${member.fullName}](${member.id}) `
    const next = content.slice(0, trigger.atIndex) + marker + content.slice(cursor)
    setContent(next)
    setTrigger(null)
    // Put the caret right after the inserted marker+space, not
    // wherever it happened to land from the raw value swap above.
    requestAnimationFrame(() => {
      const node = inputRef.current
      if (!node) return
      const pos = trigger.atIndex + marker.length
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
  }

  return { trigger, matches, loading, handleChange, select, handleKeyDown, reset }
}
