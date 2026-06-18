// Org-wide template gallery. A flat listing of every row in
// `document_templates` for the current org, filterable by document
// type, with a search input and a click-through to the slim template
// editor (`/dashboard/document-templates/:id/edit`).
//
// Styled to match the unified Documents landing (Documents.tsx): the
// same grid/list view toggle, FilterPanel, search input, Google
// Docs–style preview cards, and skeleton loaders.
//
// This page exists so users can browse and manage templates without
// having to enter the per-type listing first. Creation of new templates
// still happens from inside the per-type listings (each type has its
// own "new template" flow because contracts seed structured starters
// that SOPs/JDs don't); this page is read+edit only.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import {
  DOCUMENT_TYPES,
  documentsIndexPath,
  documentTemplateEditPath,
  type DocumentType,
} from '../../lib/documentTypes'
import { FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { Skeleton } from '../../components/Skeleton'
import { Modal } from '../../components/Modal'
import { useBilling } from '../../contexts/BillingContext'
import { docPreviewLines } from '../../lib/documentDoc'
import { createDocFromTemplate } from '../../lib/createFromTemplate'
import type { User } from '../../types/aliases'

// Templates carry the same shape we render in the grid/list as documents
// do, minus status/version (templates have neither). `preview` is derived
// from content_doc at load time to paint the page-thumbnail body.
type TemplateItem = {
  id: string
  type: DocumentType
  title: string
  position: string | null
  updated_at: string
  preview: string[]
}

type ViewMode = 'grid' | 'list'

const VIEW_MODE_KEY = 'flodok-templates-view-mode'

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  const stored = window.localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'list' ? 'list' : 'grid'
}

// Plain-text preview lines from a legacy markdown body — used only as a
// fallback when a template has no structured content_doc to thumbnail
// from. Strips block/inline markdown syntax so the snippet reads like the
// rendered page, and stops once `maxLines` non-empty lines are collected.
function markdownPreviewLines(markdown: string | null, maxLines: number): string[] {
  if (!markdown) return []
  const lines: string[] = []
  for (const raw of markdown.split('\n')) {
    if (lines.length >= maxLines) break
    const cleaned = raw
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned) lines.push(cleaned)
  }
  return lines
}

export function Templates({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const [items, setItems] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [usingId, setUsingId] = useState<string | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const [typeFilter, setTypeFilter] = useState<DocumentType[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [query, setQuery] = useState('')

  // Create a blank template of the chosen type, then route to the slim
  // template editor. Mirrors the per-type blank-create flow in
  // JobDescriptions.tsx (which inserts JD templates the same way) so all
  // three types reach the same `document_templates` row shape.
  async function handleCreateBlank(type: DocumentType) {
    if (creating || !canWrite) return
    setCreating(true)
    const untitledByType: Record<DocumentType, string> = {
      sop: t.templateNewSopUntitled,
      contract: t.templateNewContractUntitled,
      job_description: t.jdTemplateUntitled,
      letter: t.templateNewLetterUntitled,
      nda: t.templateNewNdaUntitled,
    }
    const { data, error } = await supabase
      .from('document_templates')
      .insert({
        org_id: user.org_id,
        type,
        title: untitledByType[type],
      })
      .select('id')
      .single()
    setCreating(false)
    if (error || !data) {
      window.alert(error?.message ?? 'Could not create template')
      return
    }
    navigate(documentTemplateEditPath(data.id))
  }

  // "Use template": create a new document seeded from this template and open
  // it. JD reuses its deferred /new?template= flow; the eager types insert a
  // draft here (see createDocFromTemplate).
  async function handleUseTemplate(item: TemplateItem) {
    if (usingId || !canWrite) return
    setUsingId(item.id)
    try {
      const path = await createDocFromTemplate(item.id, item.type, user)
      navigate(path)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not create document')
      setUsingId(null)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('document_templates')
        .select('id, type, title, template_for_position, updated_at, content_doc, content_markdown')
        .eq('org_id', user.org_id)
        .order('updated_at', { ascending: false })

      // Prefer the structured doc (English projection, then Indonesian) —
      // same source the main Documents cards thumbnail from. Templates
      // skip the snapshot pipeline, so older rows may carry their body only
      // in content_markdown; fall back to that so the card still shows a
      // snapshot rather than an empty page.
      const previewOf = (doc: unknown, markdown: string | null): string[] => {
        const en = docPreviewLines(doc, 'en', 6)
        if (en.length) return en
        const id = docPreviewLines(doc, 'id', 6)
        if (id.length) return id
        return markdownPreviewLines(markdown, 6)
      }

      setItems(
        (data || []).map(tpl => ({
          id: tpl.id,
          type: tpl.type as DocumentType,
          title: tpl.title,
          position: tpl.template_for_position ?? null,
          updated_at: tpl.updated_at,
          preview: previewOf(tpl.content_doc, tpl.content_markdown),
        })),
      )
      setLoading(false)
    }
    load()
  }, [user.org_id])

  // Counts per type from the unfiltered set so the filter always shows
  // total volume per type, not "volume given the other filters."
  const countByType: Record<DocumentType, number> = useMemo(() => {
    const out: Record<DocumentType, number> = { sop: 0, contract: 0, job_description: 0, letter: 0, nda: 0 }
    for (const item of items) {
      if (DOCUMENT_TYPES.includes(item.type)) out[item.type] += 1
    }
    return out
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const typeSet = new Set(typeFilter)
    return items.filter(item => {
      if (typeSet.size > 0 && !typeSet.has(item.type)) return false
      const updated = item.updated_at
      if (dateFrom && updated && updated.slice(0, 10) < dateFrom) return false
      if (dateTo && updated && updated.slice(0, 10) > dateTo) return false
      if (q) {
        const hay = `${item.title} ${item.position ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, typeFilter, dateFrom, dateTo, query])

  const hasFilters = typeFilter.length > 0 || !!dateFrom || !!dateTo || !!query

  function clearFilters() {
    setTypeFilter([])
    setDateFrom('')
    setDateTo('')
    setQuery('')
  }

  return (
    <div>
      <div className="mb-2">
        <button
          type="button"
          onClick={() => navigate(documentsIndexPath())}
          className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseOver={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>{t.templatesBack}</span>
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.templatesTitle}
        </h1>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={!canWrite}
          title={!canWrite ? t.dunningWriteBlocked : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t.templatesNewTemplate}
        </button>
      </div>

      <TemplateFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        countByType={countByType}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        search={query}
        onSearchChange={setQuery}
        onReset={hasFilters ? clearFilters : undefined}
      />

      {loading ? (
        viewMode === 'grid' ? <TemplateGridSkeleton count={8} /> : <TemplateListSkeleton count={6} />
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.templatesEmpty}
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={!canWrite}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t.templatesNewTemplate}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.templatesNoMatches}
        </p>
      ) : viewMode === 'grid' ? (
        <TemplateGrid items={filtered} onOpen={item => navigate(documentTemplateEditPath(item.id))} onUse={handleUseTemplate} usingId={usingId} canWrite={canWrite} />
      ) : (
        <TemplateList items={filtered} onOpen={item => navigate(documentTemplateEditPath(item.id))} onUse={handleUseTemplate} usingId={usingId} canWrite={canWrite} />
      )}

      <Modal
        open={pickerOpen}
        onClose={() => { if (!creating) setPickerOpen(false) }}
        title={t.templatesNewTemplate}
      >
        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.templatesNewTemplateDesc}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {DOCUMENT_TYPES.map(type => (
            <TypePickerTile
              key={type}
              type={type}
              disabled={creating}
              onSelect={() => handleCreateBlank(type)}
            />
          ))}
        </div>
      </Modal>
    </div>
  )
}

// One tile per document type in the "New template" picker. The visual
// language matches the "Start a new document" tiles on the Documents
// landing — same blank-page surface, same per-type accent colour and
// glyph in a tinted circle — so the gesture for creating a template
// feels like the gesture for creating a document.
function TypePickerTile({
  type,
  onSelect,
  disabled,
}: {
  type: DocumentType
  onSelect: () => void
  disabled?: boolean
}) {
  const { t } = useLang()
  const accent = TYPE_COLORS[type]
  const labels: Record<DocumentType, string> = {
    sop: t.documentsAllTypeBadgeSop,
    contract: t.documentsAllTypeBadgeContract,
    job_description: t.documentsAllTypeBadgeJobDescription,
    letter: t.documentsAllTypeBadgeLetter,
    nda: t.documentsAllTypeBadgeNda,
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="group flex flex-col text-left transition-all disabled:cursor-not-allowed disabled:opacity-40"
    >
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
          className="flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-110"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
        >
          <DocTypeIcon type={type} />
        </div>
      </div>
      <div className="mt-2 px-0.5 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        {labels[type]}
      </div>
    </button>
  )
}

// ─── Filters + view toggle ──────────────────────────────────────────

function typeLabel(t: ReturnType<typeof useLang>['t'], type: DocumentType): string {
  if (type === 'sop') return t.documentsAllTypeBadgeSop
  if (type === 'contract') return t.documentsAllTypeBadgeContract
  if (type === 'letter') return t.documentsAllTypeBadgeLetter
  return t.documentsAllTypeBadgeJobDescription
}

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

function TemplateFilters({
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
      <FilterPanel triggerLabel={t.filterButtonLabel} sections={sections} onReset={onReset} />
      <div className="ml-auto w-full sm:w-64">
        <FilterSearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t.pickTemplateSearchPlaceholder}
        />
      </div>
    </div>
  )
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

// Neutral grey accent for the (non-clickable) type label — see Documents.tsx typeColors.
const TYPE_COLORS: Record<DocumentType, string> = {
  sop: 'var(--color-text-secondary)',
  contract: 'var(--color-text-secondary)',
  job_description: 'var(--color-text-secondary)',
  letter: 'var(--color-text-secondary)',
  nda: 'var(--color-text-secondary)',
}

function TemplateGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4" role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          <div className="aspect-[3/4] px-4 py-4" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <Skeleton className="h-3 w-2/3" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-11/12" />
              <Skeleton className="h-2 w-4/6" />
            </div>
          </div>
          <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
            <Skeleton className="h-3 w-3/4" />
            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-2 w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TemplateListSkeleton({ count }: { count: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      role="status"
      aria-busy="true"
    >
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {Array.from({ length: count }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="ml-auto h-2 w-16" />
          </li>
        ))}
      </ul>
    </div>
  )
}

function TemplateGrid({ items, onOpen, onUse, usingId, canWrite }: { items: TemplateItem[]; onOpen: (item: TemplateItem) => void; onUse: (item: TemplateItem) => void; usingId: string | null; canWrite: boolean }) {
  const { t } = useLang()

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(item => {
        const title = item.title.trim() || t.documentsUntitled
        const accent = TYPE_COLORS[item.type] ?? 'var(--color-primary)'
        return (
          <div
            key={item.id}
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
            {/* Page preview — title heading plus the first lines of body. */}
            <div className="relative aspect-[3/4] overflow-hidden px-4 py-4" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <div className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
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
              {/* Use-template action — revealed on hover; card click still edits. */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  disabled={!canWrite || usingId !== null}
                  onClick={e => { e.stopPropagation(); onUse(item) }}
                  title={!canWrite ? t.dunningWriteBlocked : undefined}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {usingId === item.id ? t.saving : t.jdDraftActionFromTemplate}
                </button>
              </div>
            </div>

            {/* Footer — title, then a meta row with the type icon and date. */}
            <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
              <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {title}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                <span className="shrink-0" style={{ color: accent }} title={typeLabel(t, item.type)}>
                  <DocTypeIcon type={item.type} />
                </span>
                {item.position && (
                  <span className="truncate">{t.templatesUsedFor} {item.position}</span>
                )}
                <span className="ml-auto shrink-0 tabular-nums">
                  {new Date(item.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TemplateList({ items, onOpen, onUse, usingId, canWrite }: { items: TemplateItem[]; onOpen: (item: TemplateItem) => void; onUse: (item: TemplateItem) => void; usingId: string | null; canWrite: boolean }) {
  const { t } = useLang()
  const typeBadgeLabels: Record<DocumentType, string> = {
    sop: t.documentsAllTypeBadgeSop,
    contract: t.documentsAllTypeBadgeContract,
    job_description: t.documentsAllTypeBadgeJobDescription,
    letter: t.documentsAllTypeBadgeLetter,
    nda: t.documentsAllTypeBadgeNda,
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {items.map(item => (
          <li
            key={item.id}
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
              {typeBadgeLabels[item.type] ?? item.type}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              {item.title.trim() || t.documentsUntitled}
            </span>
            {item.position && (
              <span className="hidden shrink-0 truncate text-xs sm:inline" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.templatesUsedFor} {item.position}
              </span>
            )}
            <button
              type="button"
              disabled={!canWrite || usingId !== null}
              onClick={e => { e.stopPropagation(); onUse(item) }}
              title={!canWrite ? t.dunningWriteBlocked : undefined}
              className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {usingId === item.id ? t.saving : t.jdDraftActionFromTemplate}
            </button>
            <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
              {new Date(item.updated_at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
