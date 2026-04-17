import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface DocumentUploadProps {
  /** Employee id — used as the storage path prefix. */
  employeeId: string
  /** Which document this is; doubles as the filename stem in storage. */
  kind: 'ktp' | 'kk'
  /** Current public URL of the stored image, if any. */
  photoUrl: string | null
  /** Fired with the new URL (or null on remove). */
  onChange: (url: string | null) => void
  /** Alt text for accessibility. */
  label?: string
  disabled?: boolean
}

export function DocumentUpload({ employeeId, kind, photoUrl, onChange, label, disabled }: DocumentUploadProps) {
  const { t } = useLang()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t.avatarInvalidType)
      return
    }
    if (file.size > MAX_SIZE) {
      setError(t.documentTooLarge)
      return
    }

    setError('')
    setUploading(true)

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${employeeId}/${kind}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('employee_docs')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('employee_docs').getPublicUrl(path)
    onChange(`${publicUrl}?t=${Date.now()}`)
    setUploading(false)
  }

  async function handleRemove() {
    if (!photoUrl) return
    setUploading(true)
    setError('')
    const match = photoUrl.match(/\/employee_docs\/([^?]+)/)
    if (match) {
      await supabase.storage.from('employee_docs').remove([match[1]])
    }
    onChange(null)
    setUploading(false)
  }

  return (
    <div>
      {/* 16:9 preview tile */}
      <div
        className="relative w-full overflow-hidden rounded-lg border"
        style={{
          aspectRatio: '16 / 9',
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-tertiary)',
        }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt={label || ''} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="11" r="2" />
              <path d="m21 17-4.5-4.5-8 8" />
            </svg>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-2 flex items-center gap-2">
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
        <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}
    </div>
  )
}
