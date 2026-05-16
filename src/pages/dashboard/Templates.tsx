// Org-wide template gallery. A flat listing of every row in
// `document_templates` for the current org, filterable by document
// type, with a search input and a click-through to the slim template
// editor (`/dashboard/document-templates/:id/edit`).
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
import type { User, DocumentTemplate } from '../../types/aliases'

export function Templates({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | DocumentType>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('document_templates')
        .select('*')
        .eq('org_id', user.org_id)
        .order('updated_at', { ascending: false })
      setTemplates(data || [])
      setLoading(false)
    }
    load()
  }, [user.org_id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter(tpl => {
      if (typeFilter !== 'all' && tpl.type !== typeFilter) return false
      if (q) {
        const hay = `${tpl.title} ${tpl.template_for_position ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [templates, typeFilter, query])

  const typeBadgeLabels: Record<DocumentType, string> = {
    sop: t.documentsAllTypeBadgeSop,
    contract: t.documentsAllTypeBadgeContract,
    job_description: t.documentsAllTypeBadgeJobDescription,
  }

  // Counts per type for the filter pills — same idea as the rest of the
  // dashboard: surface volume so a user can tell which type has anything.
  const countByType: Record<DocumentType, number> = useMemo(() => {
    const out: Record<DocumentType, number> = { sop: 0, contract: 0, job_description: 0 }
    for (const tpl of templates) {
      if (DOCUMENT_TYPES.includes(tpl.type as DocumentType)) {
        out[tpl.type as DocumentType] += 1
      }
    }
    return out
  }, [templates])

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
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TypePill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} count={templates.length}>
          {t.documentsFilterAllTypes}
        </TypePill>
        {DOCUMENT_TYPES.map(type => (
          <TypePill
            key={type}
            active={typeFilter === type}
            onClick={() => setTypeFilter(type)}
            count={countByType[type]}
          >
            {typeBadgeLabels[type]}
          </TypePill>
        ))}
        <span className="mx-1 h-4 w-px" style={{ backgroundColor: 'var(--color-border)' }} />
        <div className="relative">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t.pickTemplateSearchPlaceholder}
            className="w-56 rounded-full border py-1 pl-7 pr-3 text-xs"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
      ) : templates.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.templatesEmpty}
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.templatesNoMatches}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              typeLabel={typeBadgeLabels[tpl.type as DocumentType] ?? tpl.type}
              onClick={() => navigate(documentTemplateEditPath(tpl.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TypePill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
      }}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          style={{
            backgroundColor: active
              ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)'
              : 'var(--color-bg-tertiary)',
            color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function TemplateCard({
  template,
  typeLabel,
  onClick,
}: {
  template: DocumentTemplate
  typeLabel: string
  onClick: () => void
}) {
  const { t } = useLang()

  return (
    <div
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-all"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      onClick={onClick}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div
        className="flex h-28 items-center justify-center"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' }}
      >
        <svg
          width="32" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--color-primary)', opacity: 0.6 }}
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="14" y2="17" />
        </svg>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">
        <span
          className="inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
            color: 'var(--color-primary)',
          }}
        >
          {typeLabel}
        </span>
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {template.title}
        </div>
        {template.template_for_position && (
          <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.templatesUsedFor} · {template.template_for_position}
          </div>
        )}
      </div>
    </div>
  )
}
