'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateProfile } from '@/app/profile/actions'
import Avatar from './Avatar'
import AvatarCropper from './AvatarCropper'

export default function ProfileForm({
  userId,
  initialName,
  initialAvatarUrl,
}: {
  userId: string
  initialName: string
  initialAvatarUrl: string | null
}) {
  const [name, setName] = useState(initialName)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<Blob | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // These only gate the *source* photo you pick, before cropping — the
  // actual uploaded result is always a small re-compressed JPEG (see
  // AvatarCropper), so the source can be a normal, uncompressed phone
  // photo (often 3-8MB) without hitting the server's 2MB-per-avatar
  // limit, which applies to the final cropped output, not the original.
  const MAX_SOURCE_BYTES = 10 * 1024 * 1024
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    setSaved(false)
    setFileError(null)

    if (!f) return

    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError('Please choose a JPG, PNG, WEBP, or GIF image.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (f.size > MAX_SOURCE_BYTES) {
      setFileError('That image is too large — please choose one under 10MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    // Open the crop step rather than uploading this raw file directly —
    // `file`/`previewUrl` only get set once cropping is confirmed.
    setCropFile(f)
  }

  function handleCropConfirm(blob: Blob) {
    setFile(blob)
    setPreviewUrl(URL.createObjectURL(blob))
    setCropFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setSubmitError(null)

    // Everything below is wrapped in try/catch/finally — previously an
    // upload failure (bad bucket policy, network hiccup, anything
    // unexpected) would leave the button stuck on "Saving..." forever,
    // since nothing ever reset `saving` back to false if a step threw.
    // The finally block guarantees that always happens now, and the
    // catch surfaces what actually went wrong instead of failing silently.
    try {
      let newAvatarUrl: string | null = null

      if (file) {
        const supabase = createClient()
        // Fixed path per user (not timestamped, unlike post media) with
        // upsert:true — replacing a photo overwrites the old file in
        // place instead of leaving old versions to pile up in storage.
        const path = `${userId}/avatar`
        const { error } = await supabase.storage
          .from('avatars')
          .upload(path, file, { upsert: true, contentType: 'image/jpeg' })

        if (error) {
          throw new Error(`Photo upload failed: ${error.message}`)
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        // Cache-bust the URL (same trick used for the site favicon) since
        // the path itself doesn't change when a photo is replaced, so
        // browsers would otherwise keep showing a cached old version.
        newAvatarUrl = `${data.publicUrl}?v=${Date.now()}`
      }

      const formData = new FormData()
      formData.set('full_name', name)
      if (newAvatarUrl) formData.set('avatar_url', newAvatarUrl)

      await updateProfile(formData)

      if (newAvatarUrl) setAvatarUrl(newAvatarUrl)
      setFile(null)
      setPreviewUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSaved(true)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Something went wrong — please try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => {
            setCropFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
          onConfirm={handleCropConfirm}
        />
      )}

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-4">
        <Avatar avatarUrl={previewUrl || avatarUrl} name={name} size={64} />
        <div>
          <label className="inline-block text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition rounded-lg px-3 py-2 cursor-pointer">
            Choose photo
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          {file && <p className="text-xs text-zinc-500 mt-1.5">New photo selected</p>}
          {fileError && <p className="text-xs text-red-400 mt-1.5">{fileError}</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Name</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition"
          placeholder="Your name"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || (!file && name.trim() === initialName.trim())}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-40 transition"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && <span className="text-xs text-green-400">Saved ✓</span>}
      </div>
      {submitError && <p className="text-xs text-red-400">{submitError}</p>}
      </form>
    </>
  )
}
