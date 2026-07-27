// Turns the **bold**/_italic_ markers PostComposer's Cmd/Ctrl+B and
// Cmd/Ctrl+I shortcuts insert back into real <strong>/<em> elements.
// Deliberately not dangerouslySetInnerHTML - this builds actual React
// elements from parsed segments, so there's no HTML string being
// injected and no sanitization to get right. Posts only for now (not
// comments - see project_community_guidelines-adjacent discussion),
// since comments don't even preserve whitespace today.
interface Segment {
  type: 'text' | 'bold' | 'italic'
  content: string
}

function parseFormattedText(text: string): Segment[] {
  const segments: Segment[] = []
  const regex = /\*\*(.+?)\*\*|_(.+?)_/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'bold', content: match[1] })
    } else {
      segments.push({ type: 'italic', content: match[2] })
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return segments
}

export default function FormattedPostText({ text }: { text: string }) {
  return (
    <>
      {parseFormattedText(text).map((seg, i) => {
        // Explicit font-bold/italic classes rather than relying on the
        // browser's bare <strong>/<em> default weight - against
        // Manrope (loaded at 400/500/600/700/800, see layout.tsx) the
        // UA default didn't read as clearly bold as it should have.
        // font-bold pins it to the actual 700 weight instead of
        // whatever the browser computes for the unitless "bolder"
        // keyword.
        if (seg.type === 'bold') return (
          <strong key={i} className="font-bold text-white">
            {seg.content}
          </strong>
        )
        if (seg.type === 'italic') return (
          <em key={i} className="italic">
            {seg.content}
          </em>
        )
        return <span key={i}>{seg.content}</span>
      })}
    </>
  )
}
