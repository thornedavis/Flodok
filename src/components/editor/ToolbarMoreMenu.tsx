import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'

// The "⋯ More" overflow menu for the document-editor top bars. Keeps the
// visible toolbar down to Publish / Save / More by nesting the low-frequency
// actions (Download PDF, Save as template, View history, Delete …) behind one
// labelled trigger — labelled, not a bare kebab, so it stays discoverable.
//
// Data-driven: callers pass an `items` array. A `danger` item (Delete) renders
// red and gets a separator above it. Items with `to` navigate; otherwise
// `onClick` fires. Renders nothing when there are no items (e.g. a brand-new
// unsaved doc), so callers can build the array unconditionally.

export type ToolbarMenuIcon = 'download' | 'template' | 'history' | 'duplicate' | 'trash'

export interface ToolbarMenuItem {
  key: string
  label: string
  icon?: ToolbarMenuIcon
  /** Click handler. Ignored when `to` is set. */
  onClick?: () => void
  /** Router destination — navigated to on click instead of calling onClick. */
  to?: string
  /** Renders in danger red and gets a separator above it. */
  danger?: boolean
  disabled?: boolean
  /** Tooltip — e.g. to explain why the item is disabled. */
  title?: string
}

function MenuIcon({ name, muted }: { name: ToolbarMenuIcon; muted: boolean }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ color: muted ? 'var(--color-text-tertiary)' : undefined, flexShrink: 0 }}
    >
      {name === 'download' && (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>)}
      {name === 'template' && (<><rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="9" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>)}
      {name === 'history' && (<><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3 3" /></>)}
      {name === 'duplicate' && (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>)}
      {name === 'trash' && (<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>)}
    </svg>
  )
}

export function ToolbarMoreMenu({ items, disabled }: { items: ToolbarMenuItem[]; disabled?: boolean }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  function activate(item: ToolbarMenuItem) {
    if (item.disabled) return
    setOpen(false)
    if (item.to) navigate(item.to)
    else item.onClick?.()
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
        {t.more}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}
        >
          {items.map((item, i) => {
            const prev = items[i - 1]
            const showSep = !!item.danger && !!prev && !prev.danger
            return (
              <Fragment key={item.key}>
                {showSep && <div className="my-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => activate(item)}
                  disabled={item.disabled}
                  title={item.title}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ color: item.danger ? 'var(--color-danger)' : 'var(--color-text)' }}
                  onMouseOver={e => { if (!item.disabled) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {item.icon && <MenuIcon name={item.icon} muted={!item.danger} />}
                  <span>{item.label}</span>
                </button>
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}
