'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lesson } from '@/types'

// Ported from learn.getfitaf.fitness's individual lesson pages (see
// gfa-portal/lessons/day5-lesson.html), which had a persistent left
// panel - "Day X of 42", a progress bar, and the full lesson list so a
// member could jump straight to any lesson without going back to the
// grid first. The new /lessons/[slug] page dropped this when it first
// shipped (prev/next buttons only) - this restores it.
//
// Desktop: a persistent sticky column, always visible.
// Mobile: collapsed into a single summary bar that expands into a
// full-screen slide-up sheet on tap, closing again once a lesson is
// picked - a persistent full-height sidebar doesn't fit a phone screen,
// and this keeps the reading view itself uncluttered by default.

function slugOf(lesson: Lesson) {
  return (lesson.url || '').replace('/lessons/', '').replace('.html', '')
}

function LessonRow({
  lesson,
  isCurrent,
  isCompleted,
  isLocked,
  href,
  onClick,
}: {
  lesson: Lesson
  isCurrent: boolean
  isCompleted: boolean
  isLocked: boolean
  href: string
  onClick?: () => void
}) {
  const rowClass = `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition ${
    isCurrent
      ? 'bg-[#e8552e]/10 border border-[#e8552e]/30'
      : isLocked
        ? ''
        : 'hover:bg-black/[0.04]'
  }`

  const inner = (
    <>
      <span
        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
          isCompleted
            ? 'bg-[#1a7f3c] text-white'
            : isCurrent
              ? 'bg-[#e8552e] text-white'
              : isLocked
                ? 'bg-black/[0.06] text-[#aaa]'
                : 'bg-black/[0.06] text-[#888]'
        }`}
      >
        {isCompleted ? '✓' : isLocked ? '🔒' : lesson.order}
      </span>
      <span
        className={`text-[13px] leading-snug truncate ${
          isCurrent ? 'font-semibold text-[#1a1a1a]' : isLocked ? 'text-[#aaa]' : 'text-[#444]'
        }`}
      >
        {lesson.title}
      </span>
    </>
  )

  if (isLocked) {
    return (
      <div className={rowClass} title="Unlocks on its scheduled day">
        {inner}
      </div>
    )
  }

  return (
    <Link href={href} onClick={onClick} className={rowClass}>
      {inner}
    </Link>
  )
}

export default function LessonSidebar({
  lessons,
  completedIds,
  currentLessonId,
  unlockedDay,
  viewAsId,
}: {
  lessons: Lesson[]
  completedIds: string[]
  currentLessonId: string
  // null = no drip lock at all (admin/approved members see every lesson
  // unlocked); a number = low-ticket day-drip cutoff, same value the
  // page itself already enforces server-side for direct navigation.
  unlockedDay: number | null
  viewAsId?: string
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const completedSet = new Set(completedIds)
  const completedCount = lessons.filter((l) => completedSet.has(l.id)).length
  const current = lessons.find((l) => l.id === currentLessonId)
  const withViewAs = (href: string) => (viewAsId ? `${href}?view_as=${viewAsId}` : href)

  const list = (onRowClick?: () => void) => (
    <div className="space-y-1">
      {lessons.map((lesson) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          isCurrent={lesson.id === currentLessonId}
          isCompleted={completedSet.has(lesson.id)}
          isLocked={unlockedDay !== null && lesson.order > unlockedDay}
          href={withViewAs(`/lessons/${slugOf(lesson)}`)}
          onClick={onRowClick}
        />
      ))}
    </div>
  )

  return (
    <>
      {/* Desktop sidebar - sticky column, sits alongside the reading
          column rather than above it (see lessons/[slug]/page.tsx's
          layout). top-[73px] clears AppNav's own sticky header height
          so both stay visible without overlapping while scrolling. */}
      <aside className="hidden lg:block w-[260px] shrink-0">
        <div className="sticky top-[88px] bg-white rounded-lg shadow-sm p-4 max-h-[calc(100vh-104px)] flex flex-col">
          <p className="text-xs font-bold text-[#e8552e] uppercase tracking-wide mb-1">
            Day {current?.order ?? '-'} of {lessons.length}
          </p>
          <div className="w-full h-1.5 bg-black/[0.06] rounded-full overflow-hidden mb-1 mt-1.5">
            <div
              className="h-full bg-[#e8552e] rounded-full"
              style={{ width: `${lessons.length ? (completedCount / lessons.length) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[11px] text-[#999] mb-3">{completedCount} of {lessons.length} done</p>
          <div className="overflow-y-auto flex-1 -mx-1 px-1">{list()}</div>
        </div>
      </aside>

      {/* Mobile summary bar + slide-up sheet. Placed inline in the page
          flow (not fixed) so it scrolls away naturally like the old
          site's own mobile behaviour - it's a jump-to-lesson tool, not
          something that needs to stay pinned on screen while reading. */}
      <div className="lg:hidden mb-6">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-full bg-white rounded-lg shadow-sm px-4 py-3 flex items-center justify-between text-left"
        >
          <div>
            <p className="text-xs font-bold text-[#e8552e] uppercase tracking-wide">
              Day {current?.order ?? '-'} of {lessons.length}
            </p>
            <p className="text-[11px] text-[#999] mt-0.5">{completedCount} of {lessons.length} done - tap to jump to a lesson</p>
          </div>
          <span className="text-[#aaa] text-sm">▾</span>
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative bg-[#f2f2f2] rounded-t-2xl max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <p className="text-xs font-bold text-[#e8552e] uppercase tracking-wide">
                  Day {current?.order ?? '-'} of {lessons.length}
                </p>
                <p className="text-[11px] text-[#999] mt-0.5">{completedCount} of {lessons.length} done</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-[#888] text-sm font-semibold px-2 py-1"
              >
                Close
              </button>
            </div>
            <div className="w-full h-1.5 bg-black/[0.06] mx-4 rounded-full overflow-hidden mb-2" style={{ width: 'calc(100% - 2rem)' }}>
              <div
                className="h-full bg-[#e8552e] rounded-full"
                style={{ width: `${lessons.length ? (completedCount / lessons.length) * 100 : 0}%` }}
              />
            </div>
            <div className="overflow-y-auto px-4 pb-4 pt-1">{list(() => setMobileOpen(false))}</div>
          </div>
        </div>
      )}
    </>
  )
}
