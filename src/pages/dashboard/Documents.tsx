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
  tableForType,
  type DocumentType,
} from '../../lib/documentTypes'
import { SOPs } from './SOPs'
import { Contracts } from './Contracts'
import { JobDescriptionsList } from './JobDescriptions'
import { useFullWidthLayout } from '../../components/Layout'
import { FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { buildPkwtStarterDoc } from '../../lib/pkwtStarterDoc'
import { docAsJson, docPreviewLines, emptyDocumentDoc } from '../../lib/documentDoc'
import { type EmpDeptShape } from '../../lib/employee'
import type { Employee, User } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

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

  // The All view renders full-bleed (see AllDocumentsView's
  // useFullWidthLayout) so its "Start a new document" band can span the
  // whole content area. That drops the layout's own padding/centering, so
  // here we re-apply the standard page shell to the header and hand the
  // same class down for the constrained sections inside the All view.
  const isAll = activeTab === 'all'
  const shell = 'mx-auto max-w-6xl px-6 md:px-10'

  return (
    <div className={isAll ? 'py-8' : undefined}>
      <div className={`mb-6 flex flex-wrap items-center justify-between gap-3${isAll ? ` ${shell}` : ''}`}>
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

      {isAll && <AllDocumentsView user={user} shell={shell} />}
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
  // The assigned employee, for the employee filter. Contracts and SOPs
  // carry employee_id; job descriptions describe a role, not a person, so
  // theirs is always null (they never match an employee filter).
  employee_id: string | null
  // First few lines of the document body, derived from content_doc at
  // load time and used to paint the page-thumbnail preview in grid view.
  preview: string[]
}

type ViewMode = 'grid' | 'list'

const VIEW_MODE_KEY = 'flodok-documents-view-mode'

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  const stored = window.localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'list' ? 'list' : 'grid'
}

function AllDocumentsView({ user, shell }: { user: User; shell: string }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const { visibleItemLimit, state: dunning, canWrite } = useBilling()
  // Render edge-to-edge so the "Start a new document" band can span the
  // full content width; the header and recent section re-constrain
  // themselves with `shell`. Auto-restored on unmount (e.g. switching tabs).
  useFullWidthLayout()
  const [items, setItems] = useState<AllDocItem[]>([])
  const [employees, setEmployees] = useState<EmployeeWithDepartments[]>([])
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  // Empty array = no type filter (show all). Multi-select so users can
  // narrow to e.g. SOPs+JDs without losing one or the other.
  const [typeFilter, setTypeFilter] = useState<DocumentType[]>([])
  // A single selected employee id, or null for "all employees".
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null)
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
      const [sopResult, contractResult, jdResult, employeeResult] = await Promise.all([
        supabase
          .from('sops')
          .select('id, title, status, current_version, updated_at, created_at, content_doc, employee_id')
          .eq('org_id', user.org_id),
        supabase
          .from('contracts')
          .select('id, title, status, current_version, updated_at, created_at, content_doc, employee_id')
          .eq('org_id', user.org_id)
          .eq('is_template', false),
        supabase
          .from('job_descriptions')
          .select('id, title, status, current_version, updated_at, created_at, content_doc')
          .eq('org_id', user.org_id),
        supabase
          .from('employees')
          .select(EMPLOYEE_WITH_DEPTS_SELECT)
          .eq('org_id', user.org_id)
          .order('name'),
      ])

      setEmployees((employeeResult.data || []) as unknown as EmployeeWithDepartments[])

      // Derive a short text snapshot from the structured body. Prefer the
      // English projection; fall back to Indonesian if the doc is ID-only.
      const previewOf = (doc: unknown): string[] => {
        const en = docPreviewLines(doc, 'en', 6)
        return en.length ? en : docPreviewLines(doc, 'id', 6)
      }

      const sops: AllDocItem[] = (sopResult.data || []).map(s => ({
        id: s.id,
        type: 'sop' as const,
        title: s.title,
        status: s.status,
        current_version: s.current_version,
        updated_at: s.updated_at,
        created_at: s.created_at,
        employee_id: s.employee_id ?? null,
        preview: previewOf(s.content_doc),
      }))
      const contracts: AllDocItem[] = (contractResult.data || []).map(c => ({
        id: c.id,
        type: 'contract' as const,
        title: c.title,
        status: c.status,
        current_version: c.current_version,
        updated_at: c.updated_at,
        created_at: c.created_at,
        employee_id: c.employee_id ?? null,
        preview: previewOf(c.content_doc),
      }))
      const jds: AllDocItem[] = (jdResult.data || []).map(j => ({
        id: j.id,
        type: 'job_description' as const,
        title: j.title,
        status: j.status,
        current_version: j.current_version,
        updated_at: j.updated_at,
        created_at: j.created_at,
        employee_id: null,
        preview: previewOf(j.content_doc),
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
      // Documents with no assigned employee (including all JDs) never match
      // an active employee filter.
      if (employeeFilter && item.employee_id !== employeeFilter) return false
      const updated = item.updated_at || item.created_at
      if (dateFrom && updated && updated.slice(0, 10) < dateFrom) return false
      if (dateTo && updated && updated.slice(0, 10) > dateTo) return false
      if (q && !item.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, typeFilter, employeeFilter, dateFrom, dateTo, search])

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
  }, [typeFilter, employeeFilter, dateFrom, dateTo, search, pageSize])

  // Snap back to the last valid page if pagination state goes out of range
  // (e.g. after items load or after deletes shrink the list).
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const hasFilters = typeFilter.length > 0 || !!employeeFilter || !!dateFrom || !!dateTo || !!search

  function clearFilters() {
    setTypeFilter([])
    setEmployeeFilter(null)
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

  // ─── Recent-doc card actions (kebab menu) ──────────────────────────
  //
  // Mirrors the per-type listings' Duplicate/Delete, generalised across
  // the three tables. Duplicate fetches the source row so we copy its
  // body (and the type-specific fields the editor needs) into a fresh
  // draft, then routes to it. Delete removes the row and drops it from
  // the in-memory list.

  async function duplicateItem(item: AllDocItem) {
    if (!canWrite) return
    const table = tableForType(item.type)
    const { data: fetched, error: fetchError } = await supabase
      .from(table)
      .select('*')
      .eq('id', item.id)
      .single()
    if (fetchError || !fetched) {
      window.alert(fetchError?.message ?? 'Could not duplicate.')
      return
    }
    // `table` is a union ('sops' | 'contracts' | 'job_descriptions'), so the
    // fetched row is typed as the union of all three. We read type-specific
    // columns below guarded by item.type, so view it through a permissive
    // shape covering every column we touch.
    const src = fetched as Record<string, unknown>
    const copyTitle = t.copyOfName(item.title.trim() || t.documentsUntitled)

    let insertObj: Record<string, unknown>
    if (item.type === 'sop') {
      insertObj = {
        org_id: user.org_id,
        employee_id: src.employee_id ?? null,
        title: copyTitle,
        content_doc: src.content_doc,
        content_markdown: src.content_markdown,
        content_markdown_id: src.content_markdown_id,
        status: 'draft',
      }
    } else if (item.type === 'contract') {
      insertObj = {
        org_id: user.org_id,
        employee_id: src.employee_id ?? null,
        title: copyTitle,
        content_doc: src.content_doc ?? docAsJson(emptyDocumentDoc()),
        status: 'draft',
        contract_type: src.contract_type,
        annual_leave_days: src.annual_leave_days,
        probation_months: src.probation_months,
      }
    } else {
      // Job description — copy only descriptive fields; never the
      // hiring_request_id (1:1 with a request) so the copy stays free.
      insertObj = {
        org_id: user.org_id,
        title: copyTitle,
        content_doc: src.content_doc,
        status: 'draft',
        department_id: src.department_id ?? null,
        job_level: src.job_level ?? null,
        reporting_line: src.reporting_line ?? null,
        supervised_team: src.supervised_team ?? null,
        work_location: src.work_location ?? null,
        effective_date: src.effective_date ?? null,
      }
    }

    const { data, error } = await supabase
      .from(table)
      .insert(insertObj as never)
      .select()
      .single()
    if (error || !data) {
      window.alert(error?.message ?? 'Could not duplicate.')
      return
    }
    navigate(documentEditPath(item.type, data.id))
  }

  async function deleteItem(item: AllDocItem) {
    if (!canWrite) return
    if (!window.confirm(t.deleteDocumentConfirm(item.title.trim() || t.documentsUntitled))) return
    const { error } = await supabase.from(tableForType(item.type)).delete().eq('id', item.id)
    if (error) {
      window.alert(error.message)
      return
    }
    setItems(prev => prev.filter(i => !(i.type === item.type && i.id === item.id)))
  }

  return (
    <>
      <StartNewSection
        shell={shell}
        onStart={startCreate}
        onCreateBlankContract={createBlankContract}
        onOpenTemplates={() => navigate('/dashboard/templates')}
        canWrite={canWrite}
      />

      <section className={`${shell} pt-8`}>
        <h2 className="mb-4 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.documentsRecent}
        </h2>

        <RecentFilters
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          countByType={countByType}
          employeeFilter={employeeFilter}
          onEmployeeChange={setEmployeeFilter}
          employees={employees}
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
              ? <RecentGrid
                  items={paginatedItems}
                  canWrite={canWrite}
                  onOpen={item => navigate(documentEditPath(item.type, item.id))}
                  onDuplicate={duplicateItem}
                  onDelete={deleteItem}
                />
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
    </>
  )
}

// ─── Start a new document ───────────────────────────────────────────

function StartNewSection({
  shell,
  onStart,
  onCreateBlankContract,
  onOpenTemplates,
  canWrite,
}: {
  shell: string
  onStart: (type: DocumentType, mode: 'scratch' | 'template') => void
  onCreateBlankContract: () => void
  onOpenTemplates: () => void
  canWrite: boolean
}) {
  const { t } = useLang()

  return (
    <section
      className="border-y py-6"
      style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
    >
      <div className={shell}>
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

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <CreateTile
          label={t.documentsNewSop}
          accent="var(--color-primary)"
          disabled={!canWrite}
          onClick={() => onStart('sop', 'scratch')}
        />
        <CreateTile
          label={t.documentsNewContract}
          accent="var(--color-success)"
          disabled={!canWrite}
          onClick={onCreateBlankContract}
        />
        <CreateTile
          label={t.documentsNewJobDescription}
          accent="var(--color-warning)"
          disabled={!canWrite}
          onClick={() => onStart('job_description', 'scratch')}
        />
      </div>
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
  accent: string
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useLang()

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? t.dunningWriteBlocked : undefined}
      className="group flex flex-col text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
    >
      {/* Blank page — a theme-aware "paper" surface (light page on light
          theme, dark page on dark theme), mirroring the Google Docs
          "Blank document" tile. The plus is tinted with the document
          type's accent colour. */}
      <div
        className="flex aspect-[3/4] items-center justify-center rounded-lg border transition-all"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        onMouseOver={e => {
          if (disabled) return
          e.currentTarget.style.borderColor = accent
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.18)'
        }}
        onMouseOut={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full transition-transform group-hover:scale-110"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>
      <div className="mt-2 px-0.5">
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
  employeeFilter,
  onEmployeeChange,
  employees,
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
  employeeFilter: string | null
  onEmployeeChange: (next: string | null) => void
  employees: EmployeeWithDepartments[]
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
      {employees.length > 0 && (
        <div className="w-full sm:w-56">
          <EmployeeSelect
            value={employeeFilter}
            onChange={onEmployeeChange}
            employees={employees}
            emptyLabel={t.documentsFilterAllEmployees}
          />
        </div>
      )}
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

function DocTypeIcon({ type }: { type: DocumentType }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (type === 'sop') {
    return (
      <svg {...common}>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </svg>
    )
  }
  if (type === 'job_description') {
    return (
      <svg {...common}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

function RecentGrid({
  items,
  canWrite,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  items: AllDocItem[]
  canWrite: boolean
  onOpen: (item: AllDocItem) => void
  onDuplicate: (item: AllDocItem) => void
  onDelete: (item: AllDocItem) => void
}) {
  const { t } = useLang()
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

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
  // Per-type accent for the footer type icon, matching the create-tile
  // colour language.
  const typeColors: Record<DocumentType, string> = {
    sop: 'var(--color-primary)',
    contract: 'var(--color-success)',
    job_description: 'var(--color-warning)',
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {items.map(item => {
        const title = item.title.trim() || t.documentsUntitled
        const accent = typeColors[item.type]
        const statusColor = statusColors[item.status] || 'var(--color-text-tertiary)'
        const key = `${item.type}:${item.id}`
        const menuOpen = menuOpenId === key
        return (
          // One bordered container wrapping the page preview and footer,
          // so hovering outlines the whole card (Google Docs style).
          <div
            key={key}
            className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border transition-all"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            onClick={() => onOpen(item)}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = 'var(--color-border-strong)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.18)'
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {/* Page preview — title heading plus the first lines of body,
                with a status pill floated top-right. */}
            <div className="relative aspect-[3/4] overflow-hidden px-4 py-4" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <span
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: statusColor,
                }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                {statusLabels[item.status] || item.status}
              </span>
              <div className="pr-14 text-[13px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
                {title}
              </div>
              <div className="mt-2 space-y-1.5">
                {item.preview.map((line, i) => (
                  <div
                    key={i}
                    className="overflow-hidden text-[10px] leading-relaxed"
                    style={{
                      color: 'var(--color-text-secondary)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer — filename flush-left on its own line, then a meta
                row with the type icon bottom-left and the kebab menu. */}
            <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {title}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                <span className="shrink-0" style={{ color: accent }} title={typeLabel(t, item.type)}>
                  <DocTypeIcon type={item.type} />
                </span>
                <span>v{item.current_version}</span>
                <span>·</span>
                <span>{new Date(item.updated_at).toLocaleDateString()}</span>

                <div className="relative ml-auto shrink-0">
                <button
                  type="button"
                  aria-label={t.actionsLabel}
                  className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpen ? null : key) }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpenId(null) }} />
                    <div
                      className="absolute bottom-full right-0 z-20 mb-1 w-40 overflow-hidden rounded-lg border py-1 shadow-lg"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <MenuItem onClick={() => { setMenuOpenId(null); onOpen(item) }}>{t.edit}</MenuItem>
                      <MenuItem
                        disabled={!canWrite}
                        onClick={() => { setMenuOpenId(null); onDuplicate(item) }}
                      >
                        {t.duplicate}
                      </MenuItem>
                      <MenuItem
                        disabled={!canWrite}
                        danger
                        onClick={() => { setMenuOpenId(null); onDelete(item) }}
                      >
                        {t.delete}
                      </MenuItem>
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick() }}
      className="flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
      onMouseOver={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {children}
    </button>
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
