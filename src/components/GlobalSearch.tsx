// Global header search: an icon button that opens a centered modal with
// a debounced query against the `global_search` RPC. Replaces the old
// HeaderSearch placeholder. RLS handles audience/role gating server-side
// — this component only renders what the RPC returns.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { documentEditPath, documentTemplateEditPath } from '../lib/documentTypes'

type GroupKey =
  | 'employee'
  | 'recruitment'
  | 'sop'
  | 'contract'
  | 'nda'
  | 'job_description'
  | 'letter'
  | 'template'
  | 'hiring_request'

interface SearchRow {
  group_key: GroupKey
  id: string
  title: string
  subtitle: string | null
  status: string | null
  updated_at: string
  rank: number
}

interface RecentEntry {
  group_key: GroupKey
  id: string
  title: string
  subtitle: string | null
  opened_at: number
}

// Display sections. Doc-type GroupKeys collapse into a single "Documents"
// section so a search for "offer" doesn't render Documents · Documents ·
// Documents back-to-back for sops / contracts / letters.
type SectionKey = 'employees' | 'recruitment' | 'documents' | 'templates' | 'hiring'

const SECTION_ORDER: SectionKey[] = [
  'employees',
  'recruitment',
  'documents',
  'templates',
  'hiring',
]

function sectionOf(group: GroupKey): SectionKey {
  switch (group) {
    case 'employee':
      return 'employees'
    case 'recruitment':
      return 'recruitment'
    case 'sop':
    case 'contract':
    case 'nda':
    case 'job_description':
    case 'letter':
      return 'documents'
    case 'template':
      return 'templates'
    case 'hiring_request':
      return 'hiring'
  }
}

const RECENTS_LIMIT = 8
const DEBOUNCE_MS = 150
const MAX_PER_GROUP = 5

function recentsKey(userId: string | null): string {
  return `flodok:recent-search:${userId ?? 'anon'}`
}

function loadRecents(userId: string | null): RecentEntry[] {
  try {
    const raw = localStorage.getItem(recentsKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is RecentEntry =>
        r && typeof r.id === 'string' && typeof r.title === 'string',
    )
  } catch {
    return []
  }
}

function saveRecents(userId: string | null, entries: RecentEntry[]): void {
  try {
    localStorage.setItem(recentsKey(userId), JSON.stringify(entries.slice(0, RECENTS_LIMIT)))
  } catch {
    // Ignore quota / private-mode errors.
  }
}

function pathFor(row: Pick<SearchRow, 'group_key' | 'id'>): string {
  switch (row.group_key) {
    case 'employee':
    case 'recruitment':
      return `/dashboard/employees/${row.id}/edit`
    case 'sop':
      return documentEditPath('sop', row.id)
    case 'contract':
      return documentEditPath('contract', row.id)
    case 'nda':
      return documentEditPath('nda', row.id)
    case 'job_description':
      return documentEditPath('job_description', row.id)
    case 'letter':
      return documentEditPath('letter', row.id)
    case 'template':
      return documentTemplateEditPath(row.id)
    case 'hiring_request':
      return `/dashboard/hiring/${row.id}`
  }
}

// Tiny icons matching the inline-SVG style used elsewhere in the header.
function GroupIcon({ group }: { group: GroupKey }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { color: 'var(--color-text-tertiary)' },
  }
  switch (group) {
    case 'employee':
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      )
    case 'recruitment':
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="4" />
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="16" y1="11" x2="22" y2="11" />
        </svg>
      )
    case 'sop':
    case 'contract':
    case 'nda':
    case 'job_description':
    case 'letter':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )
    case 'template':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      )
    case 'hiring_request':
      return (
        <svg {...props}>
          <path d="M9 2a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2H9z" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        </svg>
      )
  }
}

function SearchGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

// ─── Public icon button — what lives in the header ────────────────────

export function GlobalSearchButton() {
  const { t } = useLang()
  const [open, setOpen] = useState(false)

  // ⌘K / Ctrl+K — global shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md p-1.5 transition-colors hover:opacity-70"
        style={{ color: 'var(--color-text-secondary)' }}
        title={t.globalSearchOpen}
        aria-label={t.globalSearchOpen}
      >
        <SearchGlyph size={18} />
      </button>
      {open && <GlobalSearchModal onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── The modal ─────────────────────────────────────────────────────────

function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<SearchRow[]>([])
  const [loading, setLoading] = useState(false)
  // Active row tracked relative to the current flat list. When the list
  // shrinks we clamp on read (see `safeActiveIdx` below) rather than
  // resetting in an effect, which avoids a cascading render.
  const [activeIdx, setActiveIdx] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [recents, setRecents] = useState<RecentEntry[]>([])

  // Load current user id once so localStorage scopes per-user.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const id = data.user?.id ?? null
      setUserId(id)
      setRecents(loadRecents(id))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounced search. Each new query supersedes any in-flight one via a
  // cancellation flag set in the cleanup. When the input is empty we just
  // skip the fetch — render paths gate on `q.trim()` to show recents/empty
  // state, so stale `rows` from a prior query are never visible.
  useEffect(() => {
    const needle = q.trim()
    if (!needle) return
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('global_search', {
        q: needle,
        max_per_group: MAX_PER_GROUP,
      })
      if (cancelled) return
      setRows(error ? [] : ((data ?? []) as SearchRow[]))
      setLoading(false)
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [q])

  // Group rows by section for display. Rows arrive ranked already
  // (prefix matches first, then recency); we just bucket them.
  const grouped = useMemo(() => {
    const map = new Map<SectionKey, SearchRow[]>()
    for (const row of rows) {
      const section = sectionOf(row.group_key)
      const list = map.get(section) ?? []
      list.push(row)
      map.set(section, list)
    }
    return SECTION_ORDER.flatMap(section => {
      const list = map.get(section)
      if (!list || list.length === 0) return []
      return [{ section, items: list }]
    })
  }, [rows])

  // Flat list of selectable items in render order. Used for keyboard nav.
  const flat: SearchRow[] = useMemo(() => {
    if (q.trim()) return grouped.flatMap(g => g.items)
    // No query → recents act as the selectable list.
    return recents.map(r => ({
      group_key: r.group_key,
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      status: null,
      updated_at: new Date(r.opened_at).toISOString(),
      rank: 0,
    }))
  }, [grouped, recents, q])

  // Clamp on read — flat list shrinks/grows freely as the user types.
  const safeActiveIdx = flat.length === 0 ? 0 : Math.min(activeIdx, flat.length - 1)

  const open = useCallback(
    (row: SearchRow, newTab: boolean) => {
      const href = pathFor(row)
      // Push to recents (move-to-front, de-dupe by id+group).
      const entry: RecentEntry = {
        group_key: row.group_key,
        id: row.id,
        title: row.title,
        subtitle: row.subtitle,
        opened_at: Date.now(),
      }
      const next = [entry, ...recents.filter(r => !(r.id === row.id && r.group_key === row.group_key))].slice(
        0,
        RECENTS_LIMIT,
      )
      setRecents(next)
      saveRecents(userId, next)
      if (newTab) {
        window.open(href, '_blank', 'noopener')
      } else {
        onClose()
        navigate(href)
      }
    },
    [navigate, onClose, recents, userId],
  )

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(flat.length === 0 ? 0 : (safeActiveIdx + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(flat.length === 0 ? 0 : (safeActiveIdx - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      const row = flat[safeActiveIdx]
      if (row) {
        e.preventDefault()
        open(row, e.metaKey || e.ctrlKey)
      }
    }
  }

  const showingRecents = !q.trim() && recents.length > 0
  const showingEmptyHint = !q.trim() && recents.length === 0
  const showingNoResults = q.trim().length > 0 && !loading && rows.length === 0

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.globalSearchOpen}
      onMouseDown={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh] sm:pt-[15vh]"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
          maxHeight: 'min(70vh, 640px)',
        }}
      >
        {/* Input row */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            <SearchGlyph size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            data-no-focus-ring
            value={q}
            onChange={e => {
              const next = e.target.value
              setQ(next)
              setLoading(next.trim().length > 0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t.globalSearchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-60"
            style={{ color: 'var(--color-text)' }}
          />
          {loading && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              …
            </span>
          )}
        </div>

        {/* Results / recents / empty */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {showingRecents && (
            <Section label={t.globalSearchRecent}>
              {flat.map((row, i) => (
                <ResultRow
                  key={`recent-${row.group_key}-${row.id}`}
                  row={row}
                  active={i === safeActiveIdx}
                  onHover={() => setActiveIdx(i)}
                  onSelect={meta => open(row, meta)}
                />
              ))}
            </Section>
          )}

          {showingEmptyHint && (
            <div
              className="px-4 py-8 text-center text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t.globalSearchEmptyHint}
            </div>
          )}

          {showingNoResults && (
            <div
              className="px-4 py-8 text-center text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t.globalSearchNoResults}
            </div>
          )}

          {q.trim() && grouped.length > 0 && (
            <>
              {(() => {
                let offset = 0
                return grouped.map(g => {
                  const start = offset
                  offset += g.items.length
                  return (
                    <Section key={g.section} label={sectionLabel(g.section, t)}>
                      {g.items.map((row, i) => {
                        const flatIdx = start + i
                        return (
                          <ResultRow
                            key={`${row.group_key}-${row.id}`}
                            row={row}
                            active={flatIdx === safeActiveIdx}
                            onHover={() => setActiveIdx(flatIdx)}
                            onSelect={meta => open(row, meta)}
                          />
                        )
                      })}
                    </Section>
                  )
                })
              })()}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center gap-4 border-t px-4 py-2 text-[11px]"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <Hint k="↵" label={t.globalSearchHintOpen} />
          <Hint k="⌘↵" label={t.globalSearchHintNewTab} />
          <Hint k="esc" label={t.globalSearchHintClose} />
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div
        className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

function ResultRow({
  row,
  active,
  onHover,
  onSelect,
}: {
  row: SearchRow
  active: boolean
  onHover: () => void
  onSelect: (newTab: boolean) => void
}) {
  return (
    <button
      type="button"
      onMouseMove={onHover}
      onClick={e => onSelect(e.metaKey || e.ctrlKey)}
      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
      style={{
        backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
        color: 'var(--color-text)',
      }}
    >
      <GroupIcon group={row.group_key} />
      <span className="min-w-0 flex-1 truncate">{row.title}</span>
      {row.subtitle && (
        <span
          className="shrink-0 truncate text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {row.subtitle}
        </span>
      )}
    </button>
  )
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd
        className="rounded border px-1 py-px text-[10px]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  )
}

function sectionLabel(section: SectionKey, t: ReturnType<typeof useLang>['t']): string {
  switch (section) {
    case 'employees':
      return t.globalSearchGroupEmployees
    case 'recruitment':
      return t.globalSearchGroupRecruitment
    case 'documents':
      return t.globalSearchGroupDocuments
    case 'templates':
      return t.globalSearchGroupTemplates
    case 'hiring':
      return t.globalSearchGroupHiring
  }
}
