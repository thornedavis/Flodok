// Unified entry point for documents — SOPs, contracts, and job
// descriptions today, with offer letters / policies slotting in as
// additional tabs in later phases.
//
// Shell responsibilities:
//   - Page H1 ("Documents") and the type-tab strip
//   - URL contract: `?type=all|sop|contract|job_description` (default `all`)
//   - The Google Docs–style "All Documents" landing — a tiles row for
//     creating new documents + a "Template gallery" button leading to
//     `/dashboard/templates`, with a filtered/sorted recent-documents
//     section below (grid/list toggle, type pills, date-range filter)
//   - The global "New Document" menu in the header; when an item is
//     picked we route to the matching tab and set `?new=...` so the
//     embedded listing opens the right create modal on mount
//
// Per-type listings stay where they live (`SOPs`, `Contracts`,
// `JobDescriptionsList`) and are rendered in `embedded` mode here,
// which suppresses their own page title and their own create button so
// the global menu is the single entry point. Their internal sub-tabs
// (status pills for SOPs, contracts/templates for contracts) stay put.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import {
  DOCUMENT_TYPES,
  documentEditPath,
  isDocumentType,
  type DocumentType,
} from '../../lib/documentTypes'
import { SOPs } from './SOPs'
import { Contracts } from './Contracts'
import { JobDescriptionsList } from './JobDescriptions'
import { FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { buildPkwtStarterDoc } from '../../lib/pkwtStarterDoc'
import { docAsJson } from '../../lib/documentDoc'
import type { User } from '../../types/aliases'

type DocumentsTab = 'all' | DocumentType

const DEFAULT_TAB: DocumentsTab = 'all'

function isDocumentsTab(value: unknown): value is DocumentsTab {
  return value === 'all' || isDocumentType(value)
}

export function Documents({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // The `?type=` URL contract still drives which view renders so existing
  // tile-click create flows ("?type=sop&new=1") keep working — but the
  // type-tab strip is gone. Type-based filtering now lives in the Filter
  // dropdown on the All view, and per-type listings are only reached
  // transiently when a tile-click opens their create modal. A small
  // back-link gives users a way out if they cancel the modal.
  const rawType = searchParams.get('type')
  const activeTab: DocumentsTab = isDocumentsTab(rawType) ? rawType : DEFAULT_TAB

  const tabLabels: Record<DocumentsTab, string> = {
    all: t.documentsTabAll,
    sop: t.documentsTabSops,
    contract: t.documentsTabContracts,
    job_description: t.documentsTabJobDescriptions,
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {activeTab !== 'all' && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/documents')}
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseOver={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>{t.documentsTitle}</span>
            </button>
          )}
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
            {activeTab === 'all' ? t.documentsTitle : tabLabels[activeTab]}
          </h1>
        </div>
      </div>

      {activeTab === 'all' && <AllDocumentsView user={user} />}
      {activeTab === 'sop' && <SOPs user={user} embedded />}
      {activeTab === 'contract' && <Contracts user={user} embedded />}
      {activeTab === 'job_description' && <JobDescriptionsList user={user} embedded />}
    </div>
  )
}

// ─── All Documents view ──────────────────────────────────────────────
//
// Google Docs–style landing for the unified Documents page. Two sections:
//
//   1. "Start a new document" — tile picker for each doc type, plus a
//      "Template gallery" link routing to /dashboard/templates. Contracts
//      route through the template picker (they can't be created blank
//      today because creation collects KTP/address/wage fields that bake
//      into the contract body; pulling that into the edit page is a
//      separate refactor).
//
//   2. "Recent documents" — merged chronological list across all three
//      tables with type/date filters and a grid/list view toggle.
//      Persists the user's view-mode pick in localStorage. No three-dot
//      actions here — the per-type listings own those.

type AllDocItem = {
  id: string
  type: DocumentType
  title: string
  status: string
  current_version: number
  updated_at: string
  created_at: string
}

type ViewMode = 'grid' | 'list'

const VIEW_MODE_KEY = 'flodok-documents-view-mode'

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  const stored = window.localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'list' ? 'list' : 'grid'
}

function AllDocumentsView({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const { visibleItemLimit, state: dunning, canWrite } = useBilling()
  const [items, setItems] = useState<AllDocItem[]>([])
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  // Empty array = no type filter (show all). Multi-select so users can
  // narrow to e.g. SOPs+JDs without losing one or the other.
  const [typeFilter, setTypeFilter] = useState<DocumentType[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(12)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    async function load() {
      const [sopResult, contractResult, jdResult] = await Promise.all([
        supabase
          .from('sops')
          .select('id, title, status, current_version, updated_at, created_at')
          .eq('org_id', user.org_id),
        supabase
          .from('contracts')
          .select('id, title, status, current_version, updated_at, created_at')
          .eq('org_id', user.org_id)
          .eq('is_template', false),
        supabase
          .from('job_descriptions')
          .select('id, title, status, current_version, updated_at, created_at')
          .eq('org_id', user.org_id),
      ])

      const sops: AllDocItem[] = (sopResult.data || []).map(s => ({
        id: s.id,
        type: 'sop' as const,
        title: s.title,
        status: s.status,
        current_version: s.current_version,
        updated_at: s.updated_at,
        created_at: s.created_at,
      }))
      const contracts: AllDocItem[] = (contractResult.data || []).map(c => ({
        id: c.id,
        type: 'contract' as const,
        title: c.title,
        status: c.status,
        current_version: c.current_version,
        updated_at: c.updated_at,
        created_at: c.created_at,
      }))
      const jds: AllDocItem[] = (jdResult.data || []).map(j => ({
        id: j.id,
        type: 'job_description' as const,
        title: j.title,
        status: j.status,
        current_version: j.current_version,
        updated_at: j.updated_at,
        created_at: j.created_at,
      }))

      const merged = [...sops, ...contracts, ...jds].sort((a, b) =>
        (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at),
      )

      setItems(merged)
      setLoading(false)
    }
    load()
  }, [user.org_id])

  // Counts per type are computed from the unfiltered set so the dropdown
  // always shows total volume per type, not "volume given the other filters."
  const countByType: Record<DocumentType, number> = useMemo(() => {
    const out: Record<DocumentType, number> = { sop: 0, contract: 0, job_description: 0 }
    for (const item of items) out[item.type] += 1
    return out
  }, [items])

  // ─── filter pipeline ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const typeSet = new Set(typeFilter)
    return items.filter(item => {
      if (typeSet.size > 0 && !typeSet.has(item.type)) return false
      const updated = item.updated_at || item.created_at
      if (dateFrom && updated && updated.slice(0, 10) < dateFrom) return false
      if (dateTo && updated && updated.slice(0, 10) > dateTo) return false
      if (q && !item.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, typeFilter, dateFrom, dateTo, search])

  // Free-frozen orgs see a capped list; the limit applies AFTER filtering
  // so the cap reflects what the user actually wants to see, not raw row
  // count from the database. Pagination then slices the visible set.
  const visibleItems = visibleItemLimit !== null ? filtered.slice(0, visibleItemLimit) : filtered
  const hiddenCount = filtered.length - visibleItems.length
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize))
  const paginatedItems = visibleItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Reset to page 1 whenever filters change so we don't strand the user on
  // an empty page after narrowing the result set.
  useEffect(() => {
    setCurrentPage(1)
  }, [typeFilter, dateFrom, dateTo, search, pageSize])

  // Snap back to the last valid page if pagination state goes out of range
  // (e.g. after items load or after deletes shrink the list).
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const hasFilters = typeFilter.length > 0 || !!dateFrom || !!dateTo || !!search

  function clearFilters() {
    setTypeFilter([])
    setDateFrom('')
    setDateTo('')
    setSearch('')
  }

  function startCreate(type: DocumentType, mode: 'scratch' | 'template') {
    setSearchParams({ type, new: mode === 'template' ? 'template' : '1' })
  }

  // Contracts get their own create path: we INSERT the row directly here
  // with the PKWT starter doc + sensible defaults and route straight to
  // the edit page. This replaces the old "Create contract" modal — the
  // modal collected fields it didn't actually save (KTP / address /
  // work location), and the edit page now exposes everything that
  // matters (contract type, leave, probation, wages, dates).
  async function createBlankContract() {
    if (!canWrite) return
    const starter = buildPkwtStarterDoc('pkwt')
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        org_id: user.org_id,
        title: '',
        status: 'draft' as const,
        contract_type: 'pkwt',
        annual_leave_days: 12,
        probation_months: null,
        content_doc: docAsJson(starter),
      })
      .select()
      .single()
    if (error || !data) {
      window.alert(error?.message ?? 'Could not create contract.')
      return
    }
    navigate(documentEditPath('contract', data.id))
  }

  return (
    <div className="space-y-8">
      <StartNewSection
        onStart={startCreate}
        onCreateBlankContract={createBlankContract}
        onOpenTemplates={() => navigate('/dashboard/templates')}
        canWrite={canWrite}
      />

      <section>
        <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.documentsRecent}
        </h2>

        <RecentFilters
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          countByType={countByType}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          search={search}
          onSearchChange={setSearch}
          onReset={hasFilters ? clearFilters : undefined}
        />

        {hiddenCount > 0 && dunning === 'free_frozen' && (
          <div
            className="mb-4 rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
          >
            {t.dunningHiddenItemsNotice.replace('{count}', String(hiddenCount))}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.documentsAllEmpty}
          </p>
        ) : visibleItems.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.documentsNoMatches}
          </p>
        ) : (
          <>
            {viewMode === 'grid'
              ? <RecentGrid items={paginatedItems} onOpen={item => navigate(documentEditPath(item.type, item.id))} />
              : <RecentList items={paginatedItems} onOpen={item => navigate(documentEditPath(item.type, item.id))} />}
            <PaginationFooter
              total={visibleItems.length}
              pageSize={pageSize}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </section>
    </div>
  )
}

// ─── Start a new document ───────────────────────────────────────────

function StartNewSection({
  onStart,
  onCreateBlankContract,
  onOpenTemplates,
  canWrite,
}: {
  onStart: (type: DocumentType, mode: 'scratch' | 'template') => void
  onCreateBlankContract: () => void
  onOpenTemplates: () => void
  canWrite: boolean
}) {
  const { t } = useLang()

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.documentsStartNew}
        </h2>
        <button
          type="button"
          onClick={onOpenTemplates}
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.color = 'var(--color-text)' }}
          onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
        >
          <span>{t.documentsTemplateGallery}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <CreateTile
          label={t.documentsTileBlankSop}
          accent="sop"
          disabled={!canWrite}
          onClick={() => onStart('sop', 'scratch')}
        />
        <CreateTile
          label={t.documentsTileBlankContract}
          accent="contract"
          disabled={!canWrite}
          onClick={onCreateBlankContract}
        />
        <CreateTile
          label={t.documentsTileBlankJobDescription}
          accent="job_description"
          disabled={!canWrite}
          onClick={() => onStart('job_description', 'scratch')}
        />
      </div>
    </section>
  )
}

function CreateTile({
  label,
  accent,
  onClick,
  disabled,
}: {
  label: string
  accent: DocumentType
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useLang()

  const accentColor: Record<DocumentType, string> = {
    sop: 'var(--color-primary)',
    contract: 'var(--color-success)',
    job_description: 'var(--color-warning)',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? t.dunningWriteBlocked : undefined}
      className="group flex flex-col overflow-hidden rounded-xl border text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      onMouseOver={e => {
        if (disabled) return
        e.currentTarget.style.borderColor = accentColor[accent]
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseOut={e => {
        if (disabled) return
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div
        className="flex h-32 items-center justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${accentColor[accent]} 8%, transparent)` }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full transition-transform group-hover:scale-110"
          style={{ backgroundColor: `color-mix(in srgb, ${accentColor[accent]} 18%, transparent)`, color: accentColor[accent] }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
      </div>
    </button>
  )
}

// ─── Recent documents — filters, toggle, grid + list ────────────────

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (next: ViewMode) => void }) {
  const { t } = useLang()
  const items: Array<{ key: ViewMode; label: string; icon: React.ReactNode }> = [
    {
      key: 'list',
      label: t.documentsViewList,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      key: 'grid',
      label: t.documentsViewGrid,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
  ]
  return (
    <div
      role="group"
      className="inline-flex items-center rounded-full border p-0.5"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {items.map(item => {
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            title={item.label}
            className="flex items-center justify-center rounded-full p-1.5 transition-colors"
            style={{
              backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}

function RecentFilters({
  viewMode,
  onViewModeChange,
  typeFilter,
  onTypeChange,
  countByType,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  search,
  onSearchChange,
  onReset,
}: {
  viewMode: ViewMode
  onViewModeChange: (next: ViewMode) => void
  typeFilter: DocumentType[]
  onTypeChange: (next: DocumentType[]) => void
  countByType: Record<DocumentType, number>
  dateFrom: string
  dateTo: string
  onDateFromChange: (next: string) => void
  onDateToChange: (next: string) => void
  search: string
  onSearchChange: (next: string) => void
  onReset?: () => void
}) {
  const { t } = useLang()

  const sections: FilterPanelSection[] = [
    {
      type: 'multiselect',
      key: 'type',
      label: t.documentsFilterType,
      value: typeFilter,
      onChange: (next: string[]) => onTypeChange(next as DocumentType[]),
      options: DOCUMENT_TYPES.map(type => ({
        id: type,
        label: typeLabel(t, type),
        count: countByType[type],
      })),
    },
    {
      type: 'daterange',
      key: 'date',
      label: t.documentsFilterDate,
      from: dateFrom,
      to: dateTo,
      onFromChange: onDateFromChange,
      onToChange: onDateToChange,
      fromLabel: t.documentsFilterDateFrom,
      toLabel: t.documentsFilterDateTo,
    },
  ]

  return (
    <div className="mb-4 flex w-full flex-wrap items-center gap-2">
      <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
      <FilterPanel
        triggerLabel={t.filterButtonLabel}
        sections={sections}
        onReset={onReset}
      />
      <div className="ml-auto w-full sm:w-64">
        <FilterSearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t.documentsSearchPlaceholder}
        />
      </div>
    </div>
  )
}

function typeLabel(t: ReturnType<typeof useLang>['t'], type: DocumentType): string {
  if (type === 'sop') return t.documentsAllTypeBadgeSop
  if (type === 'contract') return t.documentsAllTypeBadgeContract
  return t.documentsAllTypeBadgeJobDescription
}

// ─── Grid + list renderers ──────────────────────────────────────────

function RecentGrid({ items, onOpen }: { items: AllDocItem[]; onOpen: (item: AllDocItem) => void }) {
  const { t } = useLang()

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }
  const statusLabels: Record<string, string> = {
    active: t.statusActive,
    draft: t.statusDraft,
    archived: t.statusArchived,
  }
  const typeBadgeLabels: Record<DocumentType, string> = {
    sop: t.documentsAllTypeBadgeSop,
    contract: t.documentsAllTypeBadgeContract,
    job_description: t.documentsAllTypeBadgeJobDescription,
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(item => (
        <div
          key={`${item.type}:${item.id}`}
          className="group relative cursor-pointer rounded-xl border p-5 transition-all"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          onClick={() => onOpen(item)}
          onMouseOver={e => {
            e.currentTarget.style.borderColor = 'var(--color-border-strong)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseOut={e => {
            e.currentTarget.style.borderColor = 'var(--color-border)'
            e.currentTarget.style.transform = 'none'
          }}
        >
          <div className="mb-3 flex flex-wrap gap-1">
            <span
              className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
                color: 'var(--color-primary)',
              }}
            >
              {typeBadgeLabels[item.type]}
            </span>
          </div>

          <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
            {item.title}
          </h3>

          <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span
              className="inline-flex items-center gap-1"
              style={{ color: statusColors[item.status] }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[item.status] }} />
              {statusLabels[item.status] || item.status}
            </span>
            <span>·</span>
            <span>v{item.current_version}</span>
            <span>·</span>
            <span>{new Date(item.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentList({ items, onOpen }: { items: AllDocItem[]; onOpen: (item: AllDocItem) => void }) {
  const { t } = useLang()

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }
  const statusLabels: Record<string, string> = {
    active: t.statusActive,
    draft: t.statusDraft,
    archived: t.statusArchived,
  }
  const typeBadgeLabels: Record<DocumentType, string> = {
    sop: t.documentsAllTypeBadgeSop,
    contract: t.documentsAllTypeBadgeContract,
    job_description: t.documentsAllTypeBadgeJobDescription,
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {items.map(item => (
          <li
            key={`${item.type}:${item.id}`}
            className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => onOpen(item)}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
                color: 'var(--color-primary)',
              }}
            >
              {typeBadgeLabels[item.type]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {item.title}
            </span>
            <span
              className="hidden shrink-0 items-center gap-1 text-xs sm:inline-flex"
              style={{ color: statusColors[item.status] }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[item.status] }} />
              {statusLabels[item.status] || item.status}
            </span>
            <span className="hidden shrink-0 text-xs tabular-nums sm:inline" style={{ color: 'var(--color-text-tertiary)' }}>
              v{item.current_version}
            </span>
            <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
              {new Date(item.updated_at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Pagination ─────────────────────────────────────────────────────
//
// Mirrors the Employees PaginationFooter shape so the two pages feel
// consistent — same page-size options, same control layout, same i18n
// keys.

function PaginationFooter({
  total,
  pageSize,
  currentPage,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  total: number
  pageSize: number
  currentPage: number
  totalPages: number
  onPageChange: (next: number) => void
  onPageSizeChange: (next: number) => void
}) {
  const { t } = useLang()
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(total, currentPage * pageSize)
  const atFirst = currentPage <= 1
  const atLast = currentPage >= totalPages

  const navBtnStyle = (disabled: boolean) => ({
    borderColor: 'var(--color-border)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text)',
    backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  } as const)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <option value={12}>{t.perPage(12)}</option>
          <option value={24}>{t.perPage(24)}</option>
          <option value={48}>{t.perPage(48)}</option>
        </select>
        <span>{t.paginationShowing(start, end, total)}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={atFirst}
          aria-label={t.previous}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atFirst)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={atFirst}
          aria-label={t.previous}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atFirst)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="px-2 text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          {t.pageOfPages(currentPage, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={atLast}
          aria-label={t.next}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atLast)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={atLast}
          aria-label={t.next}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atLast)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
