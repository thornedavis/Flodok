// Topbar bell. Shows the action-required count as a badge and reveals a
// compact preview of the top items on click. Full inbox is one click away.
//
// Data is sourced from the same useInboxItems hook the /dashboard/inbox
// page uses, so the badge and the page never disagree.

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext'
import { useInboxItems } from '../hooks/useInboxItems'
import type { User } from '../types/aliases'

const PREVIEW_LIMIT = 5

export function NotificationBell({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { items } = useInboxItems(user.org_id, user.id)
  const actionRequired = items.filter(i => i.bucket === 'action_required')
  const preview = actionRequired.slice(0, PREVIEW_LIMIT)
  const badge = actionRequired.length

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative rounded-md p-1.5 transition-colors hover:opacity-70"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label={t.inboxBellAria}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white tabular-nums"
            style={{ backgroundColor: 'var(--color-danger, #dc2626)' }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t.inboxTabActionRequired}
            </span>
            {badge > 0 && (
              <span
                className="rounded-full px-2 text-[10px] font-semibold tabular-nums"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }}
              >
                {badge}
              </span>
            )}
          </div>

          {preview.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.inboxBellEmpty}
            </p>
          ) : (
            <ul>
              {preview.map(item => (
                <li key={item.dedupe_key}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); navigate(item.href) }}
                    className="flex w-full items-start gap-2 border-b px-4 py-3 text-left transition-colors hover:opacity-90"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm" style={{ color: 'var(--color-text)' }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/dashboard/inbox"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-center text-xs font-medium transition-colors"
            style={{ color: 'var(--color-primary)' }}
          >
            {t.inboxBellViewAll}
          </Link>
        </div>
      )}
    </div>
  )
}
