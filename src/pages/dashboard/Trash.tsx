import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { FilterPanel, FilterSearchInput, type FilterPanelSection } from '../../components/FilterControls'
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
  | 'nda'
  | 'letter'
  | 'job_description'
  | 'hiring_request'
  | 'spotlight_post'
  | 'task'

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
  { key: 'task', labelKey: 'trashFilterTasks' },
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
  // Selected type filters (empty = all types), driven by the shared FilterPanel.
  const [typeFilter, setTypeFilter] = useState<DisplayType[]>([])
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
      if (typeFilter.length && !typeFilter.includes(it.displayType)) return false
      if (q && !it.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, typeFilter])

  const counts = useMemo(() => {
    const m: Record<'all' | DisplayType, number> = {
      all: items.length,
      employee: 0,
      candidate: 0,
      sop: 0,
      contract: 0,
      nda: 0,
      letter: 0,
      job_description: 0,
      hiring_request: 0,
      spotlight_post: 0,
      task: 0,
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

  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect',
      key: 'type',
      label: t.trashFilterType,
      value: typeFilter,
      onChange: next => setTypeFilter(next as DisplayType[]),
      options: FILTERS.filter(f => f.key !== 'all').map(f => ({
        id: f.key,
        label: t[f.labelKey] as string,
        count: counts[f.key as DisplayType],
      })),
    },
  ]
  const resetFilters = () => { setTypeFilter([]); setSearch('') }

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

      <div className="flex flex-wrap items-center gap-2">
        <FilterPanel triggerLabel={t.filterButtonLabel} sections={filterSections} onReset={resetFilters} />
        <div className="ml-auto w-full sm:w-72">
          <FilterSearchInput value={search} onChange={setSearch} placeholder={t.trashSearchPlaceholder} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--color-danger, #b91c1c)', color: 'var(--color-danger, #b91c1c)' }}>
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <div
          className="grid grid-cols-[80px_1fr_180px_120px_200px] gap-4 border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
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
                className="grid grid-cols-[80px_1fr_180px_120px_200px] items-center gap-4 border-b px-4 py-3 last:border-b-0 text-sm"
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
                    className="whitespace-nowrap rounded-md border px-2.5 py-1 text-xs disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  >
                    {t.trashRestore}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurge(item)}
                    disabled={busy}
                    className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
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
    type === 'nda' ? t.trashTypeNda :
    type === 'letter' ? t.trashTypeLetter :
    type === 'job_description' ? t.trashTypeJobDescription :
    type === 'hiring_request' ? t.trashTypeHiringRequest :
    type === 'task' ? t.trashTypeTask :
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
