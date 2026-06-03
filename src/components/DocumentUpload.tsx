import { useEffect, useState } from 'react'
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

  // employee_docs is a private bucket: photoUrl is the stored object path
  // (legacy full public URLs are tolerated). Sign it on render — authenticated
  // org members can sign; an anon (portal) caller can't, so it falls back to
  // the just-uploaded local preview or the placeholder.
  const [signedSrc, setSignedSrc] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!photoUrl) { setSignedSrc(null); return }
    const path = photoUrl.includes('://')
      ? (photoUrl.match(/\/employee_docs\/([^?]+)/)?.[1] ?? null)
      : photoUrl
    if (!path) { setSignedSrc(null); return }
    supabase.storage.from('employee_docs').createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancelled) setSignedSrc(data?.signedUrl ?? null)
    })
    return () => { cancelled = true }
  }, [photoUrl])

  const displaySrc = localPreview ?? signedSrc

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

    // Store the object path; the bucket is private and signed on render.
    setLocalPreview(URL.createObjectURL(file))
    onChange(path)
    setUploading(false)
  }

  async function handleRemove() {
    if (!photoUrl) return
    setUploading(true)
    setError('')
    const path = photoUrl.includes('://') ? (photoUrl.match(/\/employee_docs\/([^?]+)/)?.[1] ?? null) : photoUrl
    if (path) await supabase.storage.from('employee_docs').remove([path])
    setLocalPreview(null)
    setSignedSrc(null)
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
        {displaySrc ? (
          <img src={displaySrc} alt={label || ''} className="h-full w-full object-cover" />
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
