import { useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { FilterPill, FilterSearchInput } from '../../components/FilterControls'
import { Skeleton } from '../../components/Skeleton'
import { useInboxItems } from '../../hooks/useInboxItems'
import {
  ALL_CATEGORIES,
  countByBucket,
  countByCategory,
  filterByBucketAndCategories,
} from '../../lib/inbox'
import type { InboxBucketSelection, InboxCategory, InboxItem } from '../../lib/inbox'
import type { User } from '../../types/aliases'

export function Inbox({ user }: { user: User }) {
  const navigate = useNavigate()
  const { t } = useLang()

  const [bucket, setBucket] = useState<InboxBucketSelection>('all')
  const [activeCategories, setActiveCategories] = useState<Set<InboxCategory>>(new Set())
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const { items, loading } = useInboxItems(user.org_id, user.id, refreshKey)

  const bucketCounts = useMemo(() => countByBucket(items), [items])
  const categoryCounts = useMemo(() => countByCategory(items, bucket), [items, bucket])
  const visible = useMemo(
    () => filterByBucketAndCategories(items, bucket, activeCategories, search),
    [items, bucket, activeCategories, search],
  )

  function toggleCategory(cat: InboxCategory) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  // Both write paths upsert on (user_id, dedupe_key) so re-issuing the same
  // action is idempotent rather than a 409.
  async function writeDismissal(item: InboxItem, patch: { dismissed_at?: string; snoozed_until?: string }) {
    const { error } = await supabase
      .from('inbox_dismissals')
      .upsert({
        org_id: user.org_id,
        user_id: user.id,
        dedupe_key: item.dedupe_key,
        ...patch,
      }, { onConflict: 'user_id,dedupe_key' })
    if (error) { alert(error.message); return }
    setRefreshKey(k => k + 1)
  }

  if (loading) return <InboxSkeleton title={t.inboxTitle} />

  const bucketTabs: { key: InboxBucketSelection; count: number; label: string }[] = [
    { key: 'all', count: items.length, label: t.inboxTabAll },
    { key: 'action_required', count: bucketCounts.action_required, label: t.inboxTabActionRequired },
    { key: 'awaiting_others', count: bucketCounts.awaiting_others, label: t.inboxTabAwaitingOthers },
    { key: 'upcoming', count: bucketCounts.upcoming, label: t.inboxTabUpcoming },
  ]

  const categoryLabels: Record<InboxCategory, string> = {
    contract: t.inboxCategoryContract,
    sop: t.inboxCategorySop,
    probation: t.inboxCategoryProbation,
    document: t.inboxCategoryDocument,
    pending_update: t.inboxCategoryPendingUpdate,
    form: t.inboxCategoryForm,
    task: t.inboxCategoryTask,
    recruitment: t.inboxCategoryRecruitment,
  }

  const emptyMsg =
    activeCategories.size > 0 || search
      ? t.inboxEmptyMatchFilters
      : bucket === 'action_required' ? t.inboxEmptyActionRequired
      : bucket === 'awaiting_others' ? t.inboxEmptyAwaitingOthers
      : bucket === 'upcoming' ? t.inboxEmptyUpcoming
      : t.inboxEmptyAll

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.inboxTitle}</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.inboxSubtitle}</p>
      </div>

      {/* Bucket tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {bucketTabs.map(tab => {
          const isActive = bucket === tab.key
          const count = tab.count
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setBucket(tab.key); setActiveCategories(new Set()) }}
              className="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              style={{
                borderColor: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              }}
            >
              <span>{tab.label}</span>
              <span
                className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                style={{
                  backgroundColor: isActive
                    ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)'
                    : 'var(--color-bg-tertiary)',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Category filter pills — same primitives as the Contracts page */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterPill
          active={activeCategories.size === 0}
          onClick={() => setActiveCategories(new Set())}
          count={bucket === 'all' ? items.length : bucketCounts[bucket]}
        >
          {t.inboxCategoryAll}
        </FilterPill>
        {ALL_CATEGORIES.map(cat => {
          const count = categoryCounts[cat]
          if (count === 0) return null
          return (
            <FilterPill
              key={cat}
              active={activeCategories.has(cat)}
              onClick={() => toggleCategory(cat)}
              count={count}
            >
              {categoryLabels[cat]}
            </FilterPill>
          )
        })}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t.inboxSearchPlaceholder}
            />
          </div>
        </div>
      </div>

      {/* Item list */}
      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {emptyMsg}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map(item => (
            <InboxRow
              key={item.dedupe_key}
              item={item}
              onOpen={() => navigate(item.href)}
              onDismiss={() => writeDismissal(item, { dismissed_at: new Date().toISOString() })}
              onSnooze={() => writeDismissal(item, { snoozed_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// Branded loading state: keeps the title + tab/pill shape and swaps the item
// list for gently-pulsing row placeholders so the layout doesn't jump.
function InboxSkeleton({ title, rows = 6 }: { title: string; rows?: number }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h1>
      </div>
      <div className="mb-4 flex flex-wrap gap-3 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-24" />
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
        <Skeleton className="ml-auto h-9 w-full rounded-lg sm:w-64" />
      </div>
      <ul className="space-y-2" role="status" aria-busy="true">
        {Array.from({ length: rows }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-xl border p-4"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="mt-2 h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  )
}

function InboxRow({ item, onOpen, onDismiss, onSnooze, t }: {
  item: InboxItem
  onOpen: () => void
  onDismiss: () => void
  onSnooze: () => void
  t: ReturnType<typeof useLang>['t']
}) {
  const due = item.due_at ? formatDue(item.due_at, t) : null
  const overdue = item.due_at ? new Date(item.due_at) < new Date() && item.bucket === 'action_required' : false

  return (
    <li
      className="flex items-center gap-3 rounded-xl border p-4 transition-colors"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <CategoryGlyph category={item.category} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {item.title}
        </div>
        {item.subtitle && (
          <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {item.subtitle}
          </div>
        )}
      </button>
      {due && (
        <span
          className="hidden text-xs tabular-nums sm:inline"
          style={{ color: overdue ? 'var(--color-danger, #dc2626)' : 'var(--color-text-tertiary)' }}
        >
          {due}
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      >
        {t[item.action_label_key]}
      </button>
      <RowMenu onDismiss={onDismiss} onSnooze={onSnooze} t={t} />
    </li>
  )
}

function RowMenu({ onDismiss, onSnooze, t }: {
  onDismiss: () => void
  onSnooze: () => void
  t: ReturnType<typeof useLang>['t']
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="rounded-md p-1.5 transition-colors hover:opacity-70"
        style={{ color: 'var(--color-text-tertiary)' }}
        aria-label="More"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-lg border shadow-lg"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
          >
            <button
              type="button"
              onClick={() => { setOpen(false); onSnooze() }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
              style={{ color: 'var(--color-text)' }}
            >
              {t.inboxSnooze7d}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onDismiss() }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
              style={{ color: 'var(--color-text)' }}
            >
              {t.inboxDismiss}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function CategoryGlyph({ category }: { category: InboxCategory }) {
  // One glyph per category — the inbox is action-first, so per-kind icons
  // would add visual noise without helping the user scan.
  const path: Record<InboxCategory, ReactElement> = {
    contract: <><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></>,
    sop: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    probation: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    document: <><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    pending_update: <><path d="M21 12a9 9 0 1 1-9-9" /><polyline points="21 3 21 9 15 9" /></>,
    form: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>,
    task: <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    recruitment: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {path[category]}
      </svg>
    </span>
  )
}

function formatDue(iso: string, t: ReturnType<typeof useLang>['t']): string {
  const target = new Date(iso)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return t.inboxOverdueBy(-days)
  return t.inboxDueIn(days)
}
