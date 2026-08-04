// Shared @mention marker format - used by the post composer's
// autocomplete (inserting a marker), the server (parsing markers out
// of saved content to create notifications), and the renderer (turning
// markers back into a highlighted "@Full Name"). Satish 2026-08-04.
//
// Format: @[Full Name](profileId) - not just "@Full Name" in plain
// text, since names collide and aren't a stable identifier (two
// members could share a first name, a display name could change
// later) - the id is the source of truth for who actually gets
// notified, the bracketed name is only ever used for display.
//
// Each function below declares its own regex literal rather than
// sharing one module-level instance - a `g`-flagged regex carries
// lastIndex state across calls when reused with .exec()/.test(), which
// silently breaks on the second call in the same request. A fresh
// literal per function call sidesteps that entirely.

export interface MentionCandidate {
  id: string
  fullName: string
  avatarUrl: string | null
}

// Extracts the distinct set of profile ids mentioned in a piece of
// content - used server-side (createPost) to know who to notify.
export function extractMentionedIds(content: string | null): string[] {
  if (!content) return []
  const ids = new Set<string>()
  for (const match of content.matchAll(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi)) {
    ids.add(match[2])
  }
  return Array.from(ids)
}

// Collapses every @[Name](id) marker down to plain "@Name" - used
// anywhere a marker-bearing content string needs to read as plain
// text instead of the actual rendered post (push notification
// previews today; anywhere else a raw content string might surface
// later).
export function stripMentionMarkers(content: string): string {
  return content.replace(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi, '@$1')
}

export type ContentSegment =
  | { type: 'text'; content: string }
  | { type: 'mention'; name: string; profileId: string }

// Splits content into plain-text and mention segments for rendering -
// the mention counterpart to FormattedPostText's bold/italic segment
// parser, kept separate since bold/italic and mentions are parsed and
// rendered independently (see FormattedPostText.tsx).
export function parseMentionSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const regex = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'mention', name: match[1], profileId: match[2] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return segments
}
