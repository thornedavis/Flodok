import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import {
  daysRemaining,
  emptyTrash,
  listTrash,
  purgeItem,
  restoreItem,
  type TrashItem,
  type TrashItemType,
} from '../../lib/trash'
import type { Translations } from '../../lib/translations'
import type { User } from '../../types/aliases'

const RECRUITMENT_STAGES = new Set(['prospective', 'shortlisted', 'offered', 'signed', 'talent_pool', 'no_show'])

type DisplayType =
  | 'employee'
  | 'candidate'
  | 'sop'
  | 'contract'
  | 'letter'
  | 'job_description'
  | 'hiring_request'
  | 'spotlight_post'

interface DisplayItem extends TrashItem {
  displayType: DisplayType
}

const FILTERS: Array<{ key: 'all' | DisplayType; labelKey: keyof Translations }> = [
  { key: 'all', labelKey: 'trashFilterAll' },
  { key: 'employee', labelKey: 'trashFilterEmployees' },
  { key: 'candidate', labelKey: 'trashFilterCandidates' },
  { key: 'sop', labelKey: 'trashFilterSops' },
  { key: 'contract', labelKey: 'trashFilterContracts' },
  { key: 'letter', labelKey: 'trashFilterLetters' },
  { key: 'job_description', labelKey: 'trashFilterJobDescriptions' },
  { key: 'hiring_request', labelKey: 'trashFilterHiringRequests' },
  { key: 'spotlight_post', labelKey: 'trashFilterSpotlight' },
]

function classifyItem(item: TrashItem): DisplayType {
  if (item.item_type === 'employee') {
    const stage = item.subtitle ?? 'active'
    return RECRUITMENT_STAGES.has(stage) ? 'candidate' : 'employee'
  }
  return item.item_type
}

export function Trash({ user }: { user: User }) {
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const [items, setItems] = useState<DisplayItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | DisplayType>('all')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [emptying, setEmptying] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const rows = await listTrash()
      setItems(rows.map(r => ({ ...r, displayType: classifyItem(r) })))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it => {
      if (filter !== 'all' && it.displayType !== filter) return false
      if (q && !it.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, filter])

  const counts = useMemo(() => {
    const m: Record<'all' | DisplayType, number> = {
      all: items.length,
      employee: 0,
      candidate: 0,
      sop: 0,
      contract: 0,
      letter: 0,
      job_description: 0,
      hiring_request: 0,
      spotlight_post: 0,
    }
    for (const it of items) m[it.displayType] += 1
    return m
  }, [items])

  function setBusy(id: string, on: boolean) {
    setBusyIds(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleRestore(item: DisplayItem) {
    setBusy(item.item_id, true)
    try {
      await restoreItem(item.item_id, item.item_type as TrashItemType)
      setItems(prev => prev.filter(i => i.item_id !== item.item_id))
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(item.item_id, false)
    }
  }

  async function handlePurge(item: DisplayItem) {
    if (!confirm(t.trashDeleteForeverConfirm(item.title))) return
    setBusy(item.item_id, true)
    try {
      await purgeItem(item.item_id, item.item_type as TrashItemType)
      setItems(prev => prev.filter(i => i.item_id !== item.item_id))
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(item.item_id, false)
    }
  }

  async function handleEmpty() {
    if (items.length === 0) return
    if (!confirm(t.trashEmptyTrashConfirm)) return
    setEmptying(true)
    try {
      await emptyTrash()
      setItems([])
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setEmptying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.trashPageTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.trashPageSubtitle}</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleEmpty}
            disabled={items.length === 0 || emptying}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger, #b91c1c)' }}
          >
            {t.trashEmptyTrash}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => {
            const active = filter === f.key
            const count = counts[f.key]
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  backgroundColor: active ? 'var(--color-primary-subtle, transparent)' : 'transparent',
                }}
              >
                {t[f.labelKey] as string} <span className="ml-1 opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.trashSearchPlaceholder}
          className="w-full rounded-lg border px-3 py-1.5 text-sm sm:w-72"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        />
      </div>

      {error && (
        <div className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--color-danger, #b91c1c)', color: 'var(--color-danger, #b91c1c)' }}>
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <div
          className="grid grid-cols-[80px_1fr_180px_120px_140px] gap-4 border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
        >
          <div>{t.trashColType}</div>
          <div>{t.trashColName}</div>
          <div>{t.trashColDeletedBy}</div>
          <div>{t.trashColDaysLeft}</div>
          <div></div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.trashEmpty}</div>
        ) : (
          filtered.map(item => {
            const busy = busyIds.has(item.item_id)
            const days = daysRemaining(item.deleted_at)
            return (
              <div
                key={item.item_id}
                className="grid grid-cols-[80px_1fr_180px_120px_140px] items-center gap-4 border-b px-4 py-3 last:border-b-0 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <TypeBadge type={item.displayType} t={t} />
                <div className="truncate font-medium">{item.title || '—'}</div>
                <div className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.deleted_by_name ?? '—'}
                </div>
                <div className="text-xs" style={{ color: days <= 3 ? 'var(--color-danger, #b91c1c)' : 'var(--color-text-secondary)' }}>
                  {t.trashDaysLeft(days)}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(item)}
                    disabled={busy}
                    className="rounded-md border px-2 py-1 text-xs disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    {t.trashRestore}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurge(item)}
                    disabled={busy}
                    className="rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-danger, #b91c1c)' }}
                  >
                    {t.trashDeleteForever}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function TypeBadge({ type, t }: { type: DisplayType; t: Translations }) {
  const label =
    type === 'employee' ? t.trashTypeEmployee :
    type === 'candidate' ? t.trashTypeCandidate :
    type === 'sop' ? t.trashTypeSop :
    type === 'contract' ? t.trashTypeContract :
    type === 'letter' ? t.trashTypeLetter :
    type === 'job_description' ? t.trashTypeJobDescription :
    type === 'hiring_request' ? t.trashTypeHiringRequest :
    t.trashTypeSpotlightPost
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
    >
      {label}
    </span>
  )
}
