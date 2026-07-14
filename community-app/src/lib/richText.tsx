import { Fragment, type ReactNode } from 'react'

// Deliberately not a real markdown library - this only ever needs to
// support what the /admin/programs formatting toolbar produces
// (**bold**, *italic*, "- " bullet lines, blank-line-separated
// paragraphs), so a small hand-rolled parser keeps this dependency-free
// and predictable, same philosophy as normalize() in exerciseVideos.ts.
// Used identically by the admin live preview and the real /programs
// page - same function, so what Satish sees while editing is exactly
// what members see.

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((p) => p.length > 0)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

export function renderRichText(text: string | null | undefined): ReactNode {
  if (!text || !text.trim()) return null

  const blocks = text.trim().split(/\n\s*\n/)

  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
        const isList = lines.length > 0 && lines.every((l) => l.startsWith('- '))

        if (isList) {
          return (
            <ul key={bi} className="list-disc list-inside space-y-0.5">
              {lines.map((line, li) => (
                <li key={li}>{parseInline(line.slice(2), `${bi}-${li}`)}</li>
              ))}
            </ul>
          )
        }

        const rawLines = block.split('\n')
        return (
          <p key={bi}>
            {rawLines.map((line, li) => (
              <Fragment key={li}>
                {parseInline(line, `${bi}-${li}`)}
                {li < rawLines.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
