import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]
const ACCEPT_ATTR = '.pdf,.doc,.docx,image/jpeg,image/png,image/webp'

export type AttachmentKind = 'cv' | 'cover_letter' | 'portfolio' | 'certificate' | 'other'

export interface EmployeeAttachment {
  id: string
  employee_id: string
  file_url: string
  file_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  kind: AttachmentKind | null
  created_at: string
}

interface Props {
  employeeId: string
  disabled?: boolean
}

export function EmployeeAttachments({ employeeId, disabled }: Props) {
  const { t } = useLang()
  const [items, setItems] = useState<EmployeeAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('employee_attachments')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) setError(error.message)
      else setItems((data as EmployeeAttachment[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [employeeId])

  async function uploadOne(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t.attachmentInvalidType)
      return
    }
    if (file.size > MAX_SIZE) {
      setError(t.attachmentTooLarge)
      return
    }
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const path = `${employeeId}/${stamp}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('employee_attachments')
      .upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) { setError(uploadError.message); return }

    const { data: { publicUrl } } = supabase.storage.from('employee_attachments').getPublicUrl(path)

    const insert = {
      employee_id: employeeId,
      file_url: publicUrl,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      kind: null as AttachmentKind | null,
    }
    const { data, error: insertError } = await supabase
      .from('employee_attachments')
      .insert(insert)
      .select()
      .single()
    if (insertError) {
      await supabase.storage.from('employee_attachments').remove([path])
      setError(insertError.message)
      return
    }
    setItems(prev => [data as EmployeeAttachment, ...prev])
  }

  async function handleFiles(files: FileList | File[]) {
    if (disabled) return
    const arr = Array.from(files)
    if (!arr.length) return
    setError('')
    setUploading(true)
    for (const f of arr) await uploadOne(f)
    setUploading(false)
  }

  async function handleKindChange(id: string, kind: AttachmentKind | null) {
    const prev = items
    setItems(items.map(i => i.id === id ? { ...i, kind } : i))
    const { error } = await supabase
      .from('employee_attachments')
      .update({ kind })
      .eq('id', id)
    if (error) {
      setError(error.message)
      setItems(prev)
    }
  }

  async function handleDelete(item: EmployeeAttachment) {
    if (!confirm(t.attachmentDeleteConfirm(item.file_name))) return
    const prev = items
    setItems(items.filter(i => i.id !== item.id))
    const { error } = await supabase
      .from('employee_attachments')
      .delete()
      .eq('id', item.id)
    if (error) {
      setError(error.message)
      setItems(prev)
      return
    }
    await supabase.storage.from('employee_attachments').remove([item.file_path])
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files)
    e.target.value = ''
  }

  const dropBorder = dragOver ? 'var(--color-primary)' : 'var(--color-border)'
  const dropBg = dragOver ? 'color-mix(in srgb, var(--color-primary) 6%, transparent)' : 'transparent'

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !uploading) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${disabled || uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--color-bg-tertiary)]'}`}
        style={{ borderColor: dropBorder, backgroundColor: dropBg, color: 'var(--color-text-secondary)' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {uploading ? t.uploading : t.attachmentDropzoneTitle}
        </div>
        <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.attachmentDropzoneHelp}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          disabled={disabled || uploading}
          onChange={onPick}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
        ) : items.length === 0 ? (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.attachmentsEmpty}</div>
        ) : (
          <ul className="space-y-2">
            {items.map(item => (
              <AttachmentRow
                key={item.id}
                item={item}
                disabled={disabled}
                onKindChange={kind => handleKindChange(item.id, kind)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AttachmentRow({
  item,
  disabled,
  onKindChange,
  onDelete,
}: {
  item: EmployeeAttachment
  disabled?: boolean
  onKindChange: (kind: AttachmentKind | null) => void
  onDelete: () => void
}) {
  const { t } = useLang()
  return (
    <li
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <FileIcon mime={item.mime_type} />
      <div className="min-w-0 flex-1">
        <a
          href={item.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium hover:underline"
          style={{ color: 'var(--color-text)' }}
          title={item.file_name}
        >
          {item.file_name}
        </a>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {formatSize(item.file_size)}
        </div>
      </div>
      <select
        value={item.kind ?? ''}
        onChange={e => onKindChange((e.target.value || null) as AttachmentKind | null)}
        disabled={disabled}
        className="rounded-md border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
      >
        <option value="">{t.attachmentKindUntagged}</option>
        <option value="cv">{t.attachmentKindCv}</option>
        <option value="cover_letter">{t.attachmentKindCoverLetter}</option>
        <option value="portfolio">{t.attachmentKindPortfolio}</option>
        <option value="certificate">{t.attachmentKindCertificate}</option>
        <option value="other">{t.attachmentKindOther}</option>
      </select>
      {!disabled && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t.delete}
          title={t.delete}
          className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      )}
    </li>
  )
}

function FileIcon({ mime }: { mime: string | null }) {
  const isImage = mime?.startsWith('image/')
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
    >
      {isImage ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="2" />
          <path d="m21 17-4.5-4.5-8 8" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
    </div>
  )
}

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
