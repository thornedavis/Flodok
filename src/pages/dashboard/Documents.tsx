// Unified entry point for documents — SOPs and contracts today, with
// hiring forms / offer letters / policies slotting in as additional tabs
// in later phases.
//
// Shell responsibilities:
//   - Page H1 ("Documents") and the type-tab strip
//   - URL contract: `?type=all|sop|contract` (default `all`)
//   - The "All Documents" view (a merged chronological list across all
//     tables), since it isn't owned by any individual listing
//   - The global "New Document" menu in the header; when an item is
//     picked we route to the matching tab and set `?new=...` so the
//     embedded listing opens the right create modal on mount
//
// Per-type listings stay where they live (`SOPs`, `Contracts`) and are
// rendered in `embedded` mode here, which suppresses their own page
// title and their own create button so the global menu is the single
// entry point. Their internal sub-tabs (status pills for SOPs,
// contracts/templates for contracts) stay put.

import { useEffect, useRef, useState } from 'react'
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
import type { User } from '../../types/aliases'

type DocumentsTab = 'all' | DocumentType

const TABS: DocumentsTab[] = ['all', ...DOCUMENT_TYPES]

const DEFAULT_TAB: DocumentsTab = 'all'

function isDocumentsTab(value: unknown): value is DocumentsTab {
  return value === 'all' || isDocumentType(value)
}

export function Documents({ user }: { user: User }) {
  const { t } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawType = searchParams.get('type')
  const activeTab: DocumentsTab = isDocumentsTab(rawType) ? rawType : DEFAULT_TAB

  function setActiveTab(next: DocumentsTab) {
    const params = new URLSearchParams(searchParams)
    if (next === DEFAULT_TAB) {
      params.delete('type')
    } else {
      params.set('type', next)
    }
    // `replace: true` keeps the back button useful — tab switches don't
    // pollute history; users still navigate "back" to where they came from.
    setSearchParams(params, { replace: true })
  }

  const tabLabels: Record<DocumentsTab, string> = {
    all: t.documentsTabAll,
    sop: t.documentsTabSops,
    contract: t.documentsTabContracts,
    job_description: t.documentsTabJobDescriptions,
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.documentsTitle}
        </h1>
        <HeaderAction activeTab={activeTab} />
      </div>

      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {TABS.map(tab => (
          <TypeTab
            key={tab}
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabels[tab]}
          </TypeTab>
        ))}
      </div>

      {activeTab === 'all' && <AllDocumentsView user={user} />}
      {activeTab === 'sop' && <SOPs user={user} embedded />}
      {activeTab === 'contract' && <Contracts user={user} embedded />}
      {activeTab === 'job_description' && <JobDescriptionsList user={user} embedded />}
    </div>
  )
}

function TypeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative px-4 py-2 text-sm font-medium transition-colors"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      {children}
      {active && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />}
    </button>
  )
}

// ─── Tab-aware header action ─────────────────────────────────────────
//
// The header button morphs with the active tab so users never see a
// generic and a contextual create button at the same time:
//   - All tab      → "New Document ▾"  (full menu, all options)
//   - SOPs tab     → "New SOP"          (single action, no menu)
//   - Contracts    → "New Contract ▾"  (scratch / template menu)
//
// All paths funnel into the same URL signal `?type=…&new=1|template`,
// which the embedded listing on the destination tab reads on mount.

function HeaderAction({ activeTab }: { activeTab: DocumentsTab }) {
  const { t } = useLang()
  const { canWrite } = useBilling()
  const [, setSearchParams] = useSearchParams()

  function start(type: DocumentType, mode: 'scratch' | 'template') {
    setSearchParams({ type, new: mode === 'template' ? 'template' : '1' })
  }

  if (activeTab === 'sop') {
    return (
      <button
        type="button"
        onClick={() => start('sop', 'scratch')}
        disabled={!canWrite}
        title={!canWrite ? t.dunningWriteBlocked : undefined}
        className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        {t.documentsNewSop}
      </button>
    )
  }

  if (activeTab === 'contract') {
    return (
      <DropdownAction
        label={t.documentsNewContract}
        items={[
          { label: t.documentsNewContract, onClick: () => start('contract', 'scratch') },
          { label: t.documentsChooseTemplate, onClick: () => start('contract', 'template') },
        ]}
      />
    )
  }

  if (activeTab === 'job_description') {
    return (
      <DropdownAction
        label={t.documentsNewJobDescription}
        items={[
          { label: t.documentsNewJobDescription, onClick: () => start('job_description', 'scratch') },
          { label: t.documentsChooseTemplate, onClick: () => start('job_description', 'template') },
        ]}
      />
    )
  }

  return (
    <DropdownAction
      label={t.documentsNewDocument}
      items={[
        { label: t.documentsNewSop, onClick: () => start('sop', 'scratch') },
        { label: t.documentsNewContract, onClick: () => start('contract', 'scratch') },
        { label: t.documentsNewJobDescription, onClick: () => start('job_description', 'scratch') },
        { label: t.documentsChooseTemplate, onClick: () => start('contract', 'template') },
      ]}
    />
  )
}

function DropdownAction({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  const { t } = useLang()
  const { canWrite } = useBilling()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !canWrite ? undefined : setOpen(o => !o)}
        disabled={!canWrite}
        title={!canWrite ? t.dunningWriteBlocked : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[200px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {items.map(item => (
            <MenuItem key={item.label} onClick={() => { setOpen(false); item.onClick() }}>
              {item.label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors"
      style={{ color: 'var(--color-text)' }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {children}
    </button>
  )
}

// ─── All Documents view ──────────────────────────────────────────────
//
// A flat, type-agnostic list across every document table. Deliberately
// thinner than the per-type listings — no per-type filtering, no
// templates, no three-dot actions — because its purpose is "see
// everything in one place, then drill in." Cards click through to the
// right edit page for their type.

type AllDocItem = {
  id: string
  type: DocumentType
  title: string
  status: string
  current_version: number
  updated_at: string
  created_at: string
}

function AllDocumentsView({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { visibleItemLimit, state: dunning } = useBilling()
  const [items, setItems] = useState<AllDocItem[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const visibleItems = visibleItemLimit !== null ? items.slice(0, visibleItemLimit) : items
  const hiddenCount = items.length - visibleItems.length

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {t.documentsAllEmpty}
      </p>
    )
  }

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
    <div>
      {hiddenCount > 0 && dunning === 'free_frozen' && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
        >
          {t.dunningHiddenItemsNotice.replace('{count}', String(hiddenCount))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map(item => (
          <div
            key={`${item.type}:${item.id}`}
            className="group relative cursor-pointer rounded-xl border p-5 transition-all"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            onClick={() => navigate(documentEditPath(item.type, item.id))}
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
    </div>
  )
}
