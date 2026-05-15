// Job descriptions list — the structured role document HR maintains.
//
// The component lives on its own (rather than inlined in Hiring.tsx) so
// both the Hiring section and the Documents page can mount the same
// view. Filter chips + search + table; no own page header.
//
// When mounted with `embedded` prop, the Documents shell can signal
// "open the create flow" via `?new=1` (scratch) or `?new=template`
// (template picker), matching the pattern SOPs and Contracts use under
// /dashboard/documents.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { FilterPill, FilterSearchInput } from '../../components/FilterControls'
import { jdStatusTone, type JobDescriptionStatus } from '../../lib/jobDescriptions'
import { documentEditPath } from '../../lib/documentTypes'
import type { Translations } from '../../lib/translations'
import type { User, JobDescription, CompanyDepartment, DocumentTemplate } from '../../types/aliases'

type JdFilter = 'all' | JobDescriptionStatus

const JD_LIST_COLUMNS = '*, department:company_departments!job_descriptions_department_id_fkey(id, name)'

type JdRow = JobDescription & {
  department: Pick<CompanyDepartment, 'id' | 'name'> | null
}

export function JobDescriptionsList({ user, embedded = false }: { user: User; embedded?: boolean }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const role = useRole(user)
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState<JdRow[]>([])
  const [filter, setFilter] = useState<JdFilter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  // Template picker — opened either by the local "From template" button or
  // by the embedded URL signal `?new=template` (from the Documents shell).
  const [showPickTemplate, setShowPickTemplate] = useState(false)

  // URL signal handling — only active when embedded under the Documents
  // shell. Non-embedded mounts (under Hiring) drive the create flow via
  // direct navigation to /dashboard/hiring/jds/new instead.
  const urlNewParam = embedded ? searchParams.get('new') : null

  useEffect(() => {
    if (urlNewParam === '1') {
      // ?new=1 from the Documents shell → straight to the JD editor.
      navigate('/dashboard/hiring/jds/new')
    } else if (urlNewParam === 'template') {
      setShowPickTemplate(true)
      // Strip the param so navigating back doesn't reopen.
      const params = new URLSearchParams(searchParams)
      params.delete('new')
      setSearchParams(params, { replace: true })
    }
    // intentional: only react to urlNewParam, not searchParams identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlNewParam])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('job_descriptions')
        .select(JD_LIST_COLUMNS)
        .eq('org_id', user.org_id)
        .order('updated_at', { ascending: false })
      if (cancelled) return
      setRows((data ?? []) as JdRow[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user.org_id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        (r.department?.name?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [rows, filter, search])

  // Non-HR users only see published+archived JDs (RLS already filters
  // drafts out for them server-side, but the filter chip set should reflect
  // what's actually viewable to avoid confusing empty filters).
  const visibleFilters: JdFilter[] = role.canManagePeople
    ? ['all', 'draft', 'published', 'archived']
    : ['all', 'published', 'archived']

  const searchActive = search.trim().length > 0

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {visibleFilters.map(f => (
          <FilterPill
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            count={f === 'all' ? rows.length : rows.filter(r => r.status === f).length}
          >
            {jdFilterLabel(f, t)}
          </FilterPill>
        ))}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t.jdSearchPlaceholder}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
      ) : filtered.length === 0 ? (
        <EmptyState message={searchActive ? t.hiringRequestsNoMatches : t.jdListEmpty} />
      ) : (
        <JdTable
          rows={filtered}
          t={t}
          lang={lang}
          onRowClick={r => navigate(documentEditPath('job_description', r.id))}
        />
      )}

      {showPickTemplate && (
        <PickJdTemplateModal
          orgId={user.org_id}
          t={t}
          onClose={() => setShowPickTemplate(false)}
          onPick={tplId => {
            setShowPickTemplate(false)
            navigate(`/dashboard/hiring/jds/new?template=${tplId}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Filter labels ─────────────────────────────────────────────────────

function jdFilterLabel(f: JdFilter, t: Translations): string {
  switch (f) {
    case 'all': return t.jdFilterAll
    case 'draft': return t.jdFilterDrafts
    case 'published': return t.jdFilterPublished
    case 'archived': return t.jdFilterArchived
  }
}

function jdStatusLabel(s: JobDescriptionStatus, t: Translations): string {
  switch (s) {
    case 'draft': return t.jdStatusDraft
    case 'published': return t.jdStatusPublished
    case 'archived': return t.jdStatusArchived
  }
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border py-12 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
      {message}
    </div>
  )
}

function JdTable({ rows, t, lang, onRowClick }: {
  rows: JdRow[]
  t: Translations
  lang: 'en' | 'id'
  onRowClick: (r: JdRow) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-sm">
        <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColTitle}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColDepartment}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColVersion}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColUpdated}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r)}
              className="cursor-pointer border-t hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{r.title}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{r.department?.name ?? '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{r.doc_version || `v${r.current_version}`}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(r.updated_at, lang)}</td>
              <td className="px-4 py-3"><JdStatusBadge status={r.status as JobDescriptionStatus} t={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JdStatusBadge({ status, t }: { status: JobDescriptionStatus; t: Translations }) {
  const tone = jdStatusTone(status)
  const palette: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
    success: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    muted:   { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-tertiary)' },
  }
  const { bg, fg } = palette[tone]
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {jdStatusLabel(status, t)}
    </span>
  )
}

// ─── Template picker ────────────────────────────────────────────────────

export function PickJdTemplateModal({ orgId, t, onClose, onPick }: {
  orgId: string
  t: Translations
  onClose: () => void
  onPick: (templateId: string) => void
}) {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // No JD templates exist yet — create a blank one and route to the
  // template editor. The picker is the right entry point for this
  // because it's the moment the user is asking "is there a template
  // I can start from?" — if not, give them a way to make one.
  async function handleCreateBlank() {
    if (creating) return
    setCreating(true)
    const { data, error } = await supabase
      .from('document_templates')
      .insert({
        org_id: orgId,
        type: 'job_description',
        title: t.jdTemplateUntitled,
      })
      .select('id')
      .single()
    setCreating(false)
    if (error || !data) {
      alert(error?.message ?? 'Could not create template')
      return
    }
    navigate(`/dashboard/document-templates/${data.id}/edit`)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('document_templates')
        .select('*')
        .eq('org_id', orgId)
        .eq('type', 'job_description')
        .order('updated_at', { ascending: false })
      if (cancelled) return
      setTemplates((data ?? []) as DocumentTemplate[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [orgId])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-1 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.jdPickTemplateTitle}</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.jdPickTemplateDesc}</p>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
        ) : templates.length === 0 ? (
          <div className="space-y-3">
            <div className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {t.jdPickTemplateEmpty}
            </div>
            <button
              type="button"
              onClick={handleCreateBlank}
              disabled={creating}
              className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {creating ? t.jdSaving : t.jdCreateBlankTemplate}
            </button>
          </div>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {templates.map(tpl => (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => onPick(tpl.id)}
                  className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  <div className="font-medium">{tpl.title}</div>
                  {tpl.template_for_position && (
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {tpl.template_for_position}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Formatting ────────────────────────────────────────────────────────

function formatDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}
