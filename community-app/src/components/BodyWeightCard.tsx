'use client'

import { useState } from 'react'
import { logBodyWeight } from '@/app/profile/actions'
import { convertWeightForDisplay } from '@/lib/weightUnit'
import MiniTrendChart from './MiniTrendChart'
import type { BodyWeightEntry } from '@/types'

// Local calendar date as YYYY-MM-DD, in the device's own timezone - the
// 'en-CA' locale is a well-known trick for getting ISO-shaped output
// from toLocaleDateString without a date library. Deliberately NOT
// `new Date().toISOString()`, which is UTC and would log "yesterday"
// or "tomorrow" for anyone logging near midnight outside UTC.
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

export default function BodyWeightCard({
  weightUnit,
  entries,
}: {
  weightUnit: 'kg' | 'lbs'
  // Oldest to newest - callers (profile/page.tsx) already sort this
  // way for the chart, and the "today" lookup below just scans for a
  // match rather than assuming an index.
  entries: BodyWeightEntry[]
}) {
  const today = todayLocal()
  const todayEntry = entries.find((e) => e.loggedDate === today)
  const todayDisplay = todayEntry ? convertWeightForDisplay(todayEntry.weightKg, weightUnit) : null

  const [weight, setWeight] = useState(todayDisplay != null ? String(todayDisplay) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const latest = entries[entries.length - 1]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseFloat(weight)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid weight.')
      return
    }
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      const formData = new FormData()
      formData.set('weight', weight)
      formData.set('unit', weightUnit)
      formData.set('logged_date', today)
      await logBodyWeight(formData)
      setSaved(true)
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const chartPoints = entries
    .filter((e) => e.weightKg != null)
    .map((e) => ({ date: e.loggedDate, value: convertWeightForDisplay(e.weightKg, weightUnit)! }))

  return (
    <div className="glass rounded-2xl p-5 space-y-4 mt-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Body weight</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Log your weight whenever you check in - one entry per day, in {weightUnit}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Today&apos;s weight</label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value)
                setSaved(false)
              }}
              placeholder={weightUnit}
              className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-9 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              {weightUnit}
            </span>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving || !weight}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-40 transition"
        >
          {saving ? 'Saving...' : todayEntry ? 'Update' : 'Log'}
        </button>
      </form>
      {saved && <p className="text-xs text-green-400">Saved ✓</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {chartPoints.length >= 2 ? (
        <MiniTrendChart points={chartPoints} label="Weight over time" unit={weightUnit} />
      ) : latest ? (
        <p className="text-xs text-zinc-500">
          Log a few more days to see your trend over time.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">No weight logged yet.</p>
      )}
    </div>
  )
}
