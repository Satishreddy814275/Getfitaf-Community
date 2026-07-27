import { useCallback, type RefObject } from 'react'

// Cmd/Ctrl+B and Cmd/Ctrl+I for any plain-text textarea that stores
// content as **bold**/_italic_ markers (see FormattedPostText for the
// display side). Shared by PostComposer (new post) and PostCard (edit
// post) rather than duplicated - same wrap/insert/cursor-restore
// behavior in both places.
export function useMarkdownShortcuts(
  value: string,
  setValue: (v: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>
) {
  const applyFormatting = useCallback(
    (marker: string) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const before = value.slice(0, start)
      const selected = value.slice(start, end)
      const after = value.slice(end)

      setValue(`${before}${marker}${selected}${marker}${after}`)

      // Has to wait for React to re-render the textarea with the new
      // value first - setSelectionRange called synchronously here
      // would still be operating on the stale DOM value.
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        const cursor = selected ? start + marker.length * 2 + selected.length : start + marker.length
        el.setSelectionRange(cursor, cursor)
      })
    },
    [value, setValue, textareaRef]
  )

  return useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        applyFormatting('**')
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        applyFormatting('_')
      }
    },
    [applyFormatting]
  )
}
