import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { getAvatarGradient } from '../lib/avatar'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface AvatarUploadProps {
  /** Unique id used for the gradient fallback and as part of the storage key. */
  id: string
  /** Storage prefix under the `avatars` bucket, e.g. 'user' or 'org'. */
  storagePrefix: 'user' | 'org'
  /** Current public URL of the uploaded image, if any. */
  photoUrl: string | null
  /** Alt text / gradient seed label. */
  label?: string
  /** Disable uploading (e.g. for non-admins editing org). */
  disabled?: boolean
  /** Fired after a successful upload or removal; receives the new URL (or null). */
  onChange: (url: string | null) => void
}

export function AvatarUpload({ id, storagePrefix, photoUrl, label, disabled, onChange }: AvatarUploadProps) {
  const { t } = useLang()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after a remove
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t.avatarInvalidType)
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError(t.avatarTooLarge)
      return
    }

    setError('')
    setUploading(true)

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${storagePrefix}/${id}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}` // cache-bust
    onChange(url)
    setUploading(false)
  }

  async function handleRemove() {
    if (!photoUrl) return
    setUploading(true)
    setError('')

    // Extract the stored filename from the URL to delete the exact object.
    // URL format: https://.../storage/v1/object/public/avatars/<prefix>/<id>.<ext>?t=...
    const match = photoUrl.match(/\/avatars\/([^?]+)/)
    if (match) {
      await supabase.storage.from('avatars').remove([match[1]])
    }

    onChange(null)
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ background: photoUrl ? 'var(--color-bg-tertiary)' : getAvatarGradient(id) }}
      >
        {photoUrl && (
          <img src={photoUrl} alt={label || ''} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <label
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${disabled || uploading ? 'pointer-events-none opacity-50' : ''}`}
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {uploading ? t.uploading : photoUrl ? t.change : t.upload}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleSelect}
              disabled={disabled || uploading}
              className="hidden"
            />
          </label>
          {photoUrl && !disabled && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs"
              style={{ color: 'var(--color-danger)' }}
            >
              {t.remove}
            </button>
          )}
        </div>
        {error && (
          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</span>
        )}
      </div>
    </div>
  )
}
