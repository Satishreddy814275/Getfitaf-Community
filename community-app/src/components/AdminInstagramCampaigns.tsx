'use client'

import { useState } from 'react'
import {
  createCampaign,
  updateCampaign,
  setCampaignActive,
  type CampaignFormInput,
} from '@/app/admin/instagram/actions'
import type { InstagramCampaign, InstagramInteraction } from '@/types'

const EMPTY_FORM: CampaignFormInput = {
  name: '',
  keyword: '',
  media_id: '',
  public_reply_text: 'Thanks for the comment! Check your DMs 💌',
  dm_prompt_text: '',
  confirm_trigger: 'yes',
  file_message_text: '',
  file_url: '',
}

function funnelCounts(campaignId: string, interactions: Pick<InstagramInteraction, 'campaign_id' | 'state'>[]) {
  const rows = interactions.filter((i) => i.campaign_id === campaignId)
  return {
    commented: rows.length,
    dmSent: rows.filter((r) => r.state === 'dm_sent' || r.state === 'file_sent').length,
    fileSent: rows.filter((r) => r.state === 'file_sent').length,
  }
}

export default function AdminInstagramCampaigns({
  campaigns,
  interactions,
}: {
  campaigns: InstagramCampaign[]
  interactions: Pick<InstagramInteraction, 'campaign_id' | 'state'>[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CampaignFormInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startCreate() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  function startEdit(campaign: InstagramCampaign) {
    setForm({
      name: campaign.name,
      keyword: campaign.keyword,
      media_id: campaign.media_id ?? '',
      public_reply_text: campaign.public_reply_text,
      dm_prompt_text: campaign.dm_prompt_text,
      confirm_trigger: campaign.confirm_trigger,
      file_message_text: campaign.file_message_text,
      file_url: campaign.file_url,
    })
    setEditingId(campaign.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSave() {
    if (!form.name || !form.keyword || !form.media_id || !form.dm_prompt_text || !form.file_url) {
      setError('Name, keyword, post/media ID, DM prompt, and file URL are all required.')
      return
    }
    setSaving(true)
    setError(null)
    const result = editingId ? await updateCampaign(editingId, form) : await createCampaign(form)
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setShowForm(false)
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          type="button"
          onClick={startCreate}
          className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-2 px-4 rounded-lg transition"
        >
          + New campaign
        </button>
      )}

      {showForm && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <p className="text-white text-sm font-semibold">
            {editingId ? 'Edit campaign' : 'New campaign'}
          </p>

          <Field label="Name" hint="Internal label only, not shown to anyone commenting.">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="e.g. Free meal plan - Aug reel"
            />
          </Field>

          <Field label="Keyword" hint="Case-insensitive - matches if the comment contains this word.">
            <input
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              className={inputClass}
              placeholder="e.g. PLAN"
            />
          </Field>

          <Field
            label="Post / Reel media ID"
            hint="The specific Instagram post this campaign watches - not the whole account."
          >
            <input
              value={form.media_id}
              onChange={(e) => setForm({ ...form, media_id: e.target.value })}
              className={inputClass}
              placeholder="Instagram media ID"
            />
          </Field>

          <Field label="Public reply" hint="Posted visibly under their comment.">
            <input
              value={form.public_reply_text}
              onChange={(e) => setForm({ ...form, public_reply_text: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="DM prompt" hint="Sent privately right after the comment - asks them to follow and confirm.">
            <textarea
              value={form.dm_prompt_text}
              onChange={(e) => setForm({ ...form, dm_prompt_text: e.target.value })}
              rows={3}
              className={inputClass}
              placeholder="Follow me and reply YES here and I'll send it right over!"
            />
          </Field>

          <Field label="Confirm word" hint="What their reply must contain to unlock the file.">
            <input
              value={form.confirm_trigger}
              onChange={(e) => setForm({ ...form, confirm_trigger: e.target.value })}
              className={inputClass}
            />
          </Field>

          <Field label="File message" hint="Sent alongside the link once they confirm.">
            <input
              value={form.file_message_text}
              onChange={(e) => setForm({ ...form, file_message_text: e.target.value })}
              className={inputClass}
              placeholder="Here you go!"
            />
          </Field>

          <Field label="File URL" hint="Link to the actual lead magnet.">
            <input
              value={form.file_url}
              onChange={(e) => setForm({ ...form, file_url: e.target.value })}
              className={inputClass}
              placeholder="https://..."
            />
          </Field>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold py-2 px-4 rounded-lg transition"
            >
              {saving ? 'Saving...' : 'Save campaign'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {campaigns.length === 0 && (
          <p className="text-sm text-zinc-500">No campaigns yet.</p>
        )}
        {campaigns.map((campaign) => {
          const counts = funnelCounts(campaign.id, interactions)
          return (
            <div key={campaign.id} className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white text-sm font-semibold">{campaign.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Keyword <span className="text-zinc-300">&quot;{campaign.keyword}&quot;</span> on media{' '}
                    <span className="text-zinc-300">{campaign.media_id}</span>
                  </p>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    campaign.active
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-zinc-700/50 text-zinc-400'
                  }`}
                >
                  {campaign.active ? 'Active' : 'Paused'}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400">
                <span>{counts.commented} commented</span>
                <span>{counts.dmSent} DM&apos;d</span>
                <span>{counts.fileSent} got the file</span>
              </div>

              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => startEdit(campaign)}
                  className="text-xs text-zinc-400 hover:text-white transition"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignActive(campaign.id, !campaign.active)}
                  className="text-xs text-zinc-400 hover:text-white transition"
                >
                  {campaign.active ? 'Pause' : 'Activate'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-300 mb-1">{label}</p>
      {hint && <p className="text-[11px] text-zinc-500 mb-1">{hint}</p>}
      {children}
    </div>
  )
}
