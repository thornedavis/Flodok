// Version history viewer for SOPs.
//
// Reads honest snapshot rows written by Phase 2 — both languages, resolved
// markdown (what the user actually saw at save time), and translation status
// so we can distinguish "translation not captured" (backfilled) from
// "translation failed" (auto-translate errored) from "complete".
//
// Defaults to the rendered view because that's the historical record; the
// raw template view exists for debugging merge-field authoring.

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { diffLines } from 'diff'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { renderMergeFields, type MergeContext } from '../../lib/mergeFields'
import type { Sop, SopVersion, Employee, Organization } from '../../types/aliases'

type VersionLang = 'en' | 'id'
type ViewMode = 'rendered' | 'template'

type AuthorLite = { id: string; name: string }

export function SOPHistory() {
  const { t, lang } = useLang()
  const { id } = useParams<{ id: string }>()
  const [sop, setSOP] = useState<Sop | null>(null)
  const [versions, setVersions] = useState<SopVersion[]>([])
  const [selected, setSelected] = useState<SopVersion | null>(null)
  const [authors, setAuthors] = useState<Record<string, AuthorLite>>({})
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)

  const [activeLang, setActiveLang] = useState<VersionLang>('en')
  const [viewMode, setViewMode] = useState<ViewMode>('rendered')
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    async function load() {
      const [sopRes, versionsRes] = await Promise.all([
        supabase.from('sops').select('*').eq('id', id!).single(),
        supabase.from('sop_versions').select('*').eq('sop_id', id!).order('version_number', { ascending: false }),
      ])
      setSOP(sopRes.data)
      setVersions(versionsRes.data || [])
      if (versionsRes.data && versionsRes.data.length > 0) {
        setSelected(versionsRes.data[0])
      }

      // Resolve author names for the "who saved this" label. Pulled in one
      // batched query; missing ids render as "Unknown author".
      const authorIds = Array.from(new Set((versionsRes.data || []).map(v => v.changed_by).filter(Boolean)))
      if (authorIds.length > 0) {
        const { data: userRows } = await supabase.from('users').select('id, name').in('id', authorIds)
        setAuthors(Object.fromEntries((userRows || []).map(u => [u.id, u])))
      }

      // Load live employee + organization so "Template" view can resolve
      // merge fields against the current world, not just what the snapshot
      // captured.
      if (sopRes.data?.employee_id) {
        const { data: emp } = await supabase.from('employees').select('*').eq('id', sopRes.data.employee_id).single()
        setEmployee(emp)
      }
      if (sopRes.data?.org_id) {
        const { data: org } = await supabase.from('organizations').select('*').eq('id', sopRes.data.org_id).single()
        setOrganization(org)
      }
    }
    load()
  }, [id])

  // The body we render: snapshot's resolved markdown (default) vs raw
  // template resolved against the live context (for authoring debug). The
  // raw column is also the honest "what was saved" record when the user
  // wants to see the underlying template they wrote.
  const displayBody = useMemo(() => {
    if (!selected) return ''
    if (viewMode === 'rendered') {
      const resolved = activeLang === 'en' ? selected.resolved_markdown_en : selected.resolved_markdown_id
      // Backfilled rows (pre-Phase 2) have no resolved_markdown_id at all.
      // Falling back to the raw source is still honest — there were no
      // merge fields at that point, so raw = resolved.
      if (resolved) return resolved
      const raw = activeLang === 'en' ? selected.content_markdown : selected.content_markdown_id
      return raw ?? ''
    }
    // Template mode: show the raw markdown with {{tokens}}.
    const raw = activeLang === 'en' ? selected.content_markdown : selected.content_markdown_id
    return raw ?? ''
  }, [selected, viewMode, activeLang])

  const currentBody = useMemo(() => {
    if (!sop) return ''
    const raw = activeLang === 'en' ? sop.content_markdown : sop.content_markdown_id
    if (!raw) return ''
    if (viewMode === 'template') return raw
    // Render merge fields using the *current* world — diffing a live
    // snapshot against the live template is the comparison the user asked
    // for; comparing against raw tokens would hide merge-field changes.
    const ctx: MergeContext = {
      employee,
      organization,
      today: new Date(),
      lang: activeLang,
    }
    return renderMergeFields(raw, ctx)
  }, [sop, activeLang, viewMode, employee, organization])

  const idUnavailableReason = useMemo((): 'not-captured' | 'failed' | null => {
    if (!selected) return null
    if (activeLang !== 'id') return null
    const idContent = selected.content_markdown_id
    const idResolved = selected.resolved_markdown_id
    if (viewMode === 'rendered' && (idResolved || idContent)) return null
    if (viewMode === 'template' && idContent) return null
    if (selected.translation_status === 'failed') return 'failed'
    return 'not-captured'
  }, [selected, activeLang, viewMode])

  const diffResult = useMemo(() => {
    if (!selected || !showDiff) return null
    if (idUnavailableReason) return null
    return diffLines(displayBody, currentBody)
  }, [selected, showDiff, displayBody, currentBody, idUnavailableReason])

  if (!sop) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.sopHistoryTitle(sop.title)}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.currentVersionLabel(sop.current_version)}</p>
        </div>
        <Link
          to={`/dashboard/sops/${sop.id}/edit`}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.editSopButton}
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.noVersionHistory}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <VersionRail
            versions={versions}
            selectedId={selected?.id ?? null}
            authors={authors}
            lang={lang}
            onSelect={v => { setSelected(v); setShowDiff(false) }}
          />

          {selected && (
            <VersionPane
              version={selected}
              author={authors[selected.changed_by]}
              activeLang={activeLang}
              viewMode={viewMode}
              showDiff={showDiff}
              displayBody={displayBody}
              diffResult={diffResult}
              idUnavailableReason={idUnavailableReason}
              onLangChange={setActiveLang}
              onViewModeChange={setViewMode}
              onToggleDiff={() => setShowDiff(d => !d)}
              lang={lang}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Shared building blocks ─────────────────────────────────────────────────
// Reused by ContractHistory so the two viewers stay visually consistent.

export function VersionRail({ versions, selectedId, authors, lang, onSelect }: {
  versions: Array<{
    id: string
    version_number: number
    created_at: string
    changed_by: string
    change_summary: string | null
    translation_status: string
  }>
  selectedId: string | null
  authors: Record<string, AuthorLite>
  lang: 'en' | 'id'
  onSelect: (v: any) => void
}) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
      {versions.map(v => {
        const author = authors[v.changed_by]
        const failed = v.translation_status === 'failed'
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className="w-full px-4 py-3 text-left transition-colors"
            style={{
              backgroundColor: selectedId === v.id ? 'var(--color-bg-secondary)' : 'transparent',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>v{v.version_number}</span>
              {failed && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}
                >
                  !
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {new Date(v.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {author && ` · ${author.name}`}
            </div>
            {v.change_summary && (
              <div className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {v.change_summary}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

type T = ReturnType<typeof useLang>['t']

export function VersionPane({
  version, author, activeLang, viewMode, showDiff,
  displayBody, diffResult, idUnavailableReason,
  onLangChange, onViewModeChange, onToggleDiff,
  extraHeader, lang, t,
}: {
  version: SopVersion | { translation_status: string; translation_error: string | null; version_number: number; created_at: string; change_summary: string | null }
  author: AuthorLite | undefined
  activeLang: VersionLang
  viewMode: ViewMode
  showDiff: boolean
  displayBody: string
  diffResult: ReturnType<typeof diffLines> | null
  idUnavailableReason: 'not-captured' | 'failed' | null
  onLangChange: (l: VersionLang) => void
  onViewModeChange: (m: ViewMode) => void
  onToggleDiff: () => void
  extraHeader?: React.ReactNode
  lang: 'en' | 'id'
  t: T
}) {
  const failed = version.translation_status === 'failed'
  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {t.versionNumber(version.version_number)}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {new Date(version.created_at).toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', {
              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            {' · '}
            {author?.name ?? t.snapshotAuthorUnknown}
          </span>
          {failed && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}
              title={version.translation_error ?? undefined}
            >
              {t.translationFailedBadge}
            </span>
          )}
        </div>
        {version.change_summary && (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {version.change_summary}
          </p>
        )}
        {extraHeader}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Segmented
            value={activeLang}
            options={[{ value: 'en', label: 'EN' }, { value: 'id', label: 'ID' }]}
            onChange={v => onLangChange(v as VersionLang)}
          />
          <Segmented
            value={viewMode}
            options={[
              { value: 'rendered', label: t.viewModeRendered, title: t.viewModeTooltipRendered },
              { value: 'template', label: t.viewModeTemplate, title: t.viewModeTooltipTemplate },
            ]}
            onChange={v => onViewModeChange(v as ViewMode)}
          />
        </div>
        <button
          onClick={onToggleDiff}
          disabled={!!idUnavailableReason}
          className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {showDiff ? t.showContent : t.showDiffVsCurrent}
        </button>
      </div>

      {idUnavailableReason ? (
        <div
          className="rounded-xl border px-5 py-12 text-center text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {idUnavailableReason === 'failed' ? t.translationFailedSnapshot : t.translationNotCaptured}
        </div>
      ) : showDiff && diffResult ? (
        <pre
          className="overflow-x-auto whitespace-pre-wrap rounded-xl border p-5 text-sm leading-relaxed"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          {diffResult.map((part, i) => (
            <span
              key={i}
              style={{
                backgroundColor: part.added ? 'var(--color-diff-add)' : part.removed ? 'var(--color-diff-remove)' : 'transparent',
                color: 'var(--color-text)',
              }}
            >
              {part.value}
            </span>
          ))}
        </pre>
      ) : (
        <pre
          className="overflow-x-auto whitespace-pre-wrap rounded-xl border p-5 text-sm leading-relaxed"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
        >
          {displayBody}
        </pre>
      )}
    </div>
  )
}

function Segmented<V extends string>({ value, options, onChange }: {
  value: V
  options: Array<{ value: V; label: string; title?: string }>
  onChange: (v: V) => void
}) {
  return (
    <div
      className="flex rounded-lg border p-0.5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: active ? 'var(--color-bg)' : 'transparent',
              color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
