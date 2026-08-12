'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import LeaderboardTabs from './LeaderboardTabs'
import HeadphoneIcon from './HeadphoneIcon'
import type { Lesson, LeaderboardRow, WorkoutLeaderboardRow } from '@/types'

// Ported from learn.getfitaf.fitness/dashboard.html's tab bar (weeks,
// All Lessons w/ tag filter + search, Audio, My Submissions,
// Leaderboard) - same tabs, same drip-lock behaviour for low-ticket
// members, now a real React component instead of hand-rolled DOM
// manipulation. One deliberate scope cut for this first pass: the old
// dashboard also showed a "forms due this week" strip above each
// week's lessons - skipped here since the forms that actually matter
// already surface directly on their assigned lesson page (see
// LESSON_FORMS in lessons/[slug]/page.tsx); can be added back if it's
// missed.
const TAGS = ['All', 'Mindset', 'Training', 'Nutrition', 'Tracking', 'Recovery'] as const

const TAG_CLASSES: Record<string, string> = {
  Mindset: 'bg-purple-500/10 text-purple-400 border border-purple-500/25',
  Training: 'bg-blue-500/10 text-blue-400 border border-blue-500/25',
  Nutrition: 'bg-green-500/10 text-green-400 border border-green-500/25',
  Tracking: 'bg-orange-500/10 text-orange-400 border border-orange-500/25',
  Recovery: 'bg-teal-500/10 text-teal-400 border border-teal-500/25',
  Forms: 'bg-pink-500/10 text-pink-400 border border-pink-500/25',
}

const FORMS = [
  { name: 'Nutrition Assessment', desc: 'Understand your current eating patterns and nutritional gaps.', url: 'https://forms.getfitaf.fitness/nutrition-assessment.html' },
  { name: 'Anti-Nutrient Assessment', desc: 'Identify foods that may be working against your progress.', url: 'https://forms.getfitaf.fitness/antinutrient-assessment.html' },
  { name: 'Eating Habits', desc: 'Assess your daily eating behaviours and meal structure.', url: 'https://forms.getfitaf.fitness/eating-habits.html' },
  { name: 'Calorie Planner', desc: 'Calculate your personalised daily calorie and macro targets.', url: 'https://forms.getfitaf.fitness/calorie-planner.html' },
  { name: '7-Day Food Diary', desc: 'Track everything you eat for a week to spot patterns.', url: 'https://forms.getfitaf.fitness/food-diary-7day.html' },
  { name: 'Food Intolerance Assessment', desc: 'Check for common food sensitivities affecting your energy and gut.', url: 'https://forms.getfitaf.fitness/food-intolerance-assessment.html' },
  { name: 'Food Pyramid Assessment', desc: 'See how your diet stacks up against a balanced food pyramid.', url: 'https://forms.getfitaf.fitness/food-pyramid-assessment.html' },
  { name: 'Goal Setting Sheet', desc: 'Define your goals, timeline, and the actions that will get you there.', url: 'https://forms.getfitaf.fitness/goal-setting-sheet.html' },
  { name: 'Perceived Stress Scale', desc: 'Measure how stress is affecting your body and your results.', url: 'https://forms.getfitaf.fitness/perceived-stress-scale.html' },
  { name: 'Sleep & Wake Questionnaire', desc: 'Analyse your sleep quality and how it impacts your recovery.', url: 'https://forms.getfitaf.fitness/sleep-wake-questionnaire.html' },
  { name: 'Supplement Questionnaire', desc: 'Find out which supplements are worth taking for your specific goals.', url: 'https://forms.getfitaf.fitness/supplement-questionnaire.html' },
  { name: 'Weight History', desc: 'Log your weight history to track trends and rate of change.', url: 'https://forms.getfitaf.fitness/weight-history.html' },
]

function slugOf(l: Lesson) {
  return (l.url || '').replace('/lessons/', '').replace('.html', '')
}

export default function LessonsTabs({
  lessons,
  completedIds,
  isLowTicketOnly,
  isFreePreviewOnly = false,
  unlockedDay,
  leaderboardRows,
  workoutLeaderboardRows,
  currentUserId,
  submissions,
  viewAsId,
}: {
  lessons: Lesson[]
  completedIds: string[]
  isLowTicketOnly: boolean
  // Free (not-yet-paid) member previewing the first N lessons (see
  // FREE_PREVIEW_LESSON_COUNT in lessons/page.tsx). Optional/defaulted
  // rather than required so this doesn't need touching anywhere the
  // caller genuinely can't be in this tier (e.g. an admin's "view as").
  isFreePreviewOnly?: boolean
  unlockedDay: number | null
  leaderboardRows: LeaderboardRow[]
  workoutLeaderboardRows: WorkoutLeaderboardRow[]
  currentUserId: string
  submissions: { form_title: string; submitted_at: string }[]
  // Admin "view as" preview (see /lessons/page.tsx) - appended to every
  // lesson link so clicking through from the previewed grid lands on
  // that same client's view of the lesson page, not the admin's own.
  viewAsId?: string
}) {
  // Both tiers get the same restricted display (no Submissions tab, no
  // Forms filter) - low-ticket members because those forms promise
  // personalised coach follow-up their tier doesn't include, free
  // members because there's nothing to submit without a real program
  // yet. Kept as one derived flag rather than threading two separate
  // booleans through every check below.
  const restrictedView = isLowTicketOnly || isFreePreviewOnly
  const lessonHref = (l: Lesson) => (viewAsId ? `/lessons/${slugOf(l)}?view_as=${viewAsId}` : `/lessons/${slugOf(l)}`)
  const weeks = useMemo(
    () => [...new Set(lessons.map((l) => Math.ceil(l.order / 7)))].sort((a, b) => a - b),
    [lessons]
  )
  const [activeTab, setActiveTab] = useState<string>(weeks[0] ? `week-${weeks[0]}` : 'all')
  const [activeTag, setActiveTag] = useState<(typeof TAGS)[number] | 'Forms'>('All')
  const [search, setSearch] = useState('')

  const doneSet = useMemo(() => new Set(completedIds), [completedIds])
  const total = lessons.length
  const done = completedIds.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const showTagFilters = activeTab === 'all'

  let visibleLessons = lessons
  if (activeTab === 'all') {
    if (activeTag !== 'All' && activeTag !== 'Forms') {
      visibleLessons = visibleLessons.filter((l) => l.tag === activeTag)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      visibleLessons = visibleLessons.filter((l) => l.title.toLowerCase().includes(q))
    }
  } else if (activeTab.startsWith('week-')) {
    const week = parseInt(activeTab.replace('week-', ''), 10)
    visibleLessons = lessons.filter((l) => Math.ceil(l.order / 7) === week)
  }

  const audioLessons = lessons.filter((l) => l.audio_url)

  return (
    <div>
      {/* Progress */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-semibold">Program Progress</span>
          <span className="text-orange-500 font-bold text-sm">{pct}%</span>
        </div>
        <div className="bg-zinc-800 rounded-full h-2">
          <div
            className="rounded-full h-2 transition-all"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#F97316,#fb923c)' }}
          />
        </div>
        <p className="text-zinc-500 text-xs mt-2">
          {done} of {total} lessons completed
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {weeks.map((w) => (
          <button
            key={w}
            onClick={() => setActiveTab(`week-${w}`)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition ${
              activeTab === `week-${w}` ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Week {w}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('all')}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition ${
            activeTab === 'all' ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
          }`}
        >
          All Lessons
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition inline-flex items-center gap-1.5 ${
            activeTab === 'audio' ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <HeadphoneIcon size={14} /> Audio
        </button>
        {!restrictedView && (
          <button
            onClick={() => setActiveTab('submissions')}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition ${
              activeTab === 'submissions' ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
            }`}
          >
            My Submissions
          </button>
        )}
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`text-sm font-semibold px-4 py-2 rounded-xl transition ${
            activeTab === 'leaderboard' ? 'bg-orange-500 text-white' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
          }`}
        >
          🏆 Leaderboard
        </button>
      </div>

      {showTagFilters && (
        <div className="flex gap-2 flex-wrap mb-4">
          {[...TAGS, ...(restrictedView ? [] : (['Forms'] as const))].map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                activeTag === tag
                  ? tag === 'All'
                    ? 'bg-white/10 border-white/20 text-white'
                    : TAG_CLASSES[tag]
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {showTagFilters && (
        <div className="mb-6 max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lessons"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
          />
        </div>
      )}

      {/* Leaderboard tab */}
      {activeTab === 'leaderboard' && (
        <LeaderboardTabs
          communityRows={leaderboardRows}
          workoutRows={workoutLeaderboardRows}
          currentUserId={currentUserId}
        />
      )}

      {/* Audio tab */}
      {activeTab === 'audio' && (
        <div className="space-y-3">
          {audioLessons.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-12">
              No audio lessons yet - narration is rolling out gradually.
            </p>
          ) : (
            audioLessons.map((l) => (
              <div key={l.id} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <Link href={lessonHref(l)} className="text-white text-sm font-semibold hover:text-orange-400 transition">
                    Day {l.order} · {l.title}
                  </Link>
                  {doneSet.has(l.id) && <span className="text-green-500 text-xs">✓ Done</span>}
                </div>
                <audio controls preload="none" src={l.audio_url!} className="w-full" />
              </div>
            ))
          )}
        </div>
      )}

      {/* Submissions tab */}
      {activeTab === 'submissions' && !restrictedView && (
        <div className="glass rounded-2xl divide-y divide-zinc-800">
          {submissions.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-12">No form submissions yet.</p>
          ) : (
            submissions.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-4">
                <span className="text-white text-sm font-medium">{s.form_title}</span>
                <span className="text-zinc-500 text-xs">
                  {new Date(s.submitted_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Forms tag (within All Lessons) */}
      {activeTab === 'all' && activeTag === 'Forms' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FORMS.map((form) => (
            <a
              key={form.name}
              href={form.url}
              target="_blank"
              rel="noopener"
              className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 flex flex-col gap-3 hover:border-orange-500/30 transition"
            >
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${TAG_CLASSES.Forms}`}>Form</span>
              <h3 className="text-white font-bold text-[15px] leading-snug">{form.name}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed flex-1">{form.desc}</p>
              <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 w-fit">
                Open Form →
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Lessons list (weeks + all-lessons-not-forms) */}
      {((activeTab === 'all' && activeTag !== 'Forms') || activeTab.startsWith('week-')) && (
        <div className="rounded-2xl overflow-hidden border border-zinc-800">
          {visibleLessons.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">No lessons match your search.</div>
          ) : (
            visibleLessons.map((l) => {
              const isDone = doneSet.has(l.id)
              const locked = unlockedDay !== null && l.order > unlockedDay
              const content = (
                <div
                  className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0 ${
                    locked ? 'opacity-50' : 'hover:bg-zinc-900/50 transition cursor-pointer'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isDone ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {locked ? '🔒' : isDone ? '✓' : l.order}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-zinc-200">{l.title}</span>
                  {l.tag && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TAG_CLASSES[l.tag] || 'bg-zinc-800 text-zinc-400'}`}>
                      {l.tag}
                    </span>
                  )}
                  {l.audio_url && <HeadphoneIcon size={14} className="text-zinc-500 shrink-0" />}
                </div>
              )
              return locked ? (
                <div key={l.id}>{content}</div>
              ) : (
                <Link key={l.id} href={lessonHref(l)}>
                  {content}
                </Link>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
