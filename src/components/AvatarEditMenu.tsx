import { useEffect, useRef, useState } from 'react'
import { useLang } from '../contexts/LanguageContext'

interface AvatarEditMenuProps {
  /** Current photo URL — drives the Change/Upload label and whether Remove shows. */
  photoUrl: string | null
  /** True while an upload/removal is in flight; shows a spinner and locks the badge. */
  uploading: boolean
  /** Fired when a file is chosen from the picker. */
  onSelectFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Fired when Remove is chosen. */
  onRemove: () => void
  /** Optional hard-disable (e.g. read-only users). */
  disabled?: boolean
  /** The avatar element the edit badge is overlaid onto (top-right corner). */
  children: React.ReactNode
}

/**
 * Social-media-style avatar photo editor: a pencil badge pinned to the top-right
 * of the avatar that opens a small menu (Change/Upload · Remove). Shared by the
 * candidate and employee detail pages so the control stays identical on both.
 *
 * Wrap the avatar element as children; this owns the `relative` positioning
 * context, the badge, the hidden file input, and the popover.
 */
export function AvatarEditMenu({ photoUrl, uploading, onSelectFile, onRemove, disabled, children }: AvatarEditMenuProps) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close on outside-click or Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={uploading || disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.edit}
        title={uploading ? t.uploading : t.edit}
        className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-opacity disabled:opacity-60"
        style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-bg)', borderColor: 'var(--color-bg)' }}
      >
        {uploading ? <SpinnerIcon /> : <EditIcon />}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onSelectFile}
        disabled={uploading || disabled}
        className="hidden"
      />
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-50 mt-2 min-w-[176px] -translate-x-1/2 overflow-hidden rounded-xl border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}
        >
          <PhotoMenuItem
            icon={<ImageIcon />}
            label={photoUrl ? t.change : t.upload}
            onClick={() => { setOpen(false); fileInputRef.current?.click() }}
          />
          {photoUrl && (
            <>
              <div className="my-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
              <PhotoMenuItem
                icon={<TrashIcon />}
                label={t.remove}
                danger
                onClick={() => { setOpen(false); onRemove() }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PhotoMenuItem({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </button>
  )
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
