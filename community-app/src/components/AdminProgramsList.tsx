'use client'

import { useRef, useState } from 'react'
import { toggleProgramPublished, updateProgramMetadata } from '@/app/admin/actions'
import { renderRichText } from '@/lib/richText'

interface ProgramRow {
  id: string
  name: string
  level: string
  equipment_tier: string
  duration_weeks: number
  description: string | null
  is_published: boolean
}

// Wraps (or unwraps) the current textarea selection with a marker pair
// - "**" for bold, "*" for italic. If nothing's selected, inserts a
// placeholder between the markers instead so there's something visible
// to type over, rather than leaving an empty "****" a user has to
// notice and delete.
function wrapSelection(
  textarea: HTMLTextAreaElement,
  marker: string,
  placeholder: string,
  onChange: (next: string) => void
) {
  const { selectionStart, selectionEnd, value } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const already = selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2
  const inserted = already ? selected.slice(marker.length, selected.length - marker.length) : `${marker}${selected || placeholder}${marker}`
  const next = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd)
  onChange(next)

  const cursorStart = selectionStart + (already ? 0 : marker.length)
  const cursorEnd = cursorStart + (already ? inserted.length : inserted.length - marker.length * 2)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorStart, cursorEnd)
  })
}

// Prefixes every selected line (expanding the selection out to full
// lines first) with "- ", or removes the prefix if every line already
// has one - same toggle-on/toggle-off feel as the bold/italic buttons.
function toggleBulletList(textarea: HTMLTextAreaElement, onChange: (next: string) => void) {
  const { selectionStart, selectionEnd, value } = textarea
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const nextBreak = value.indexOf('\n', selectionEnd)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak

  const selectedLines = value.slice(lineStart, lineEnd).split('\n')
  const allPrefixed = selectedLines.every((l) => l.startsWith('- ') || l.trim() === '')
  const newLines = selectedLines.map((l) => {
    if (l.trim() === '') return l
    return allPrefixed ? l.replace(/^- /, '') : l.startsWith('- ') ? l : `- ${l}`
  })
  const replacement = newLines.join('\n')

  const next = value.slice(0, lineStart) + replacement + value.slice(lineEnd)
  onChange(next)

  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(lineStart, lineStart + replacement.length)
  })
}

function PublishToggle({
  isPublished,
  onToggle,
  pending,
}: {
  isPublished: boolean
  onToggle: () => void
  pending: boolean
}) {
  return (
    <button
      onClick={onToggle}
      disabled={pending}
      type="button"
      aria-label={isPublished ? 'Unpublish program' : 'Publish program'}
      className="flex items-center gap-2 disabled:opacity-50"
    >
      <span className={`text-xs font-medium ${isPublished ? 'text-orange-400' : 'text-zinc-500'}`}>
        {isPublished ? 'Published' : 'Draft'}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          isPublished ? 'bg-orange-500' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
            isPublished ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  )
}

function ProgramCard({ program }: { program: ProgramRow }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublished, setIsPublished] = useState(program.is_published)
  const [isTogglePending, setIsTogglePending] = useState(false)

  const [name, setName] = useState(program.name)
  const [level, setLevel] = useState(program.level)
  const [equipmentTier, setEquipmentTier] = useState(program.equipment_tier)
  const [durationWeeks, setDurationWeeks] = useState(String(program.duration_weeks))
  const [description, setDescription] = useState(program.description || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function startEdit() {
    setName(program.name)
    setLevel(program.level)
    setEquipmentTier(program.equipment_tier)
    setDurationWeeks(String(program.duration_weeks))
    setDescription(program.description || '')
    setIsEditing(true)
  }

  async function handleToggle() {
    const next = !isPublished
    setIsTogglePending(true)
    setIsPublished(next)
    await toggleProgramPublished(program.id, next)
    setIsTogglePending(false)
  }

  async function handleSave() {
    setIsSaving(true)
    await updateProgramMetadata(program.id, {
      name,
      level,
      equipmentTier,
      durationWeeks: Number(durationWeeks) || program.duration_weeks,
      description,
    })
    setIsSaving(false)
    setIsEditing(false)
  }

  if (!isEditing) {
    return (
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <p className="text-white font-semibold">{program.name}</p>
            <p className="text-zinc-500 text-xs mt-1">
              {program.level} &middot; {program.equipment_tier} &middot; {program.duration_weeks} week
              {program.duration_weeks === 1 ? '' : 's'}
            </p>
          </div>
          <PublishToggle isPublished={isPublished} onToggle={handleToggle} pending={isTogglePending} />
        </div>
        {program.description ? (
          <div className="text-zinc-300 text-sm space-y-2">{renderRichText(program.description)}</div>
        ) : (
          <p className="text-zinc-600 text-sm italic">No description yet.</p>
        )}
        <button
          onClick={startEdit}
          className="mt-3 text-xs font-medium text-orange-400 hover:text-orange-300 transition"
        >
          Edit program
        </button>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="grid sm:grid-cols-2 gap-3 flex-1 min-w-[280px]">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Program title</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Duration (weeks)</label>
            <input
              type="number"
              min={1}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Level</label>
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="e.g. beginner"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Equipment tier</label>
            <input
              type="text"
              value={equipmentTier}
              onChange={(e) => setEquipmentTier(e.target.value)}
              placeholder="e.g. minimal_equipment"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
          </div>
        </div>
        <PublishToggle isPublished={isPublished} onToggle={handleToggle} pending={isTogglePending} />
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => textareaRef.current && wrapSelection(textareaRef.current, '**', 'bold text', setDescription)}
            className="text-xs font-bold px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => textareaRef.current && wrapSelection(textareaRef.current, '*', 'italic text', setDescription)}
            className="text-xs italic px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
          >
            i
          </button>
          <button
            type="button"
            onClick={() => textareaRef.current && toggleBulletList(textareaRef.current, setDescription)}
            className="text-xs px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-orange-500/40 transition"
          >
            • List
          </button>
          <span className="text-zinc-600 text-[11px] ml-1">
            Select text first, then tap a button to format it
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Who is this program for? What should someone know before picking it? A few sentences is great."
            rows={7}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
          />
          <div>
            <p className="text-zinc-600 text-[11px] mb-1">Preview - exactly how members will see it</p>
            <div className="glass rounded-xl p-3 min-h-[7rem]">
              <p className="text-white font-semibold text-sm">{name || 'Untitled program'}</p>
              <p className="text-zinc-500 text-xs mt-1 mb-2">
                {level || '-'} &middot; {equipmentTier || '-'} &middot; {durationWeeks || '-'} week
                {durationWeeks === '1' ? '' : 's'}
              </p>
              {description.trim() ? (
                <div className="text-zinc-300 text-sm space-y-2">{renderRichText(description)}</div>
              ) : (
                <p className="text-zinc-600 text-sm italic">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim() || !level.trim() || !equipmentTier.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => setIsEditing(false)}
          disabled={isSaving}
          className="text-zinc-500 hover:text-white disabled:opacity-50 text-sm font-medium transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function AdminProgramsList({ programs }: { programs: ProgramRow[] }) {
  if (programs.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-12">No programs yet.</p>
  }

  return (
    <div className="space-y-4">
      {programs.map((program) => (
        <ProgramCard key={program.id} program={program} />
      ))}
    </div>
  )
}
