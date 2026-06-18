// Version history viewer for NDAs.
//
// Mirrors ContractHistory but without the wage/hours snapshot strip — NDA
// versions snapshot only the content + the employee-at-time; the structured
// fields (effective date / survival / penalty) are frozen into
// resolved_markdown rather than carried as separate version columns.

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { diffLines } from 'diff'
import { supabase } from '../../lib/supabase'
import { documentEditPath } from '../../lib/documentTypes'
import { useLang } from '../../contexts/LanguageContext'
import { renderMergeFields, type MergeContext } from '../../lib/mergeFields'
import { VersionRail, VersionPane } from './SOPHistory'
import type { Nda, NdaVersion, Employee, Organization } from '../../types/aliases'

type VersionLang = 'en' | 'id'
type ViewMode = 'rendered' | 'template'
type AuthorLite = { id: string; name: string }

export function NDAHistory() {
  const { t, lang } = useLang()
  const { id } = useParams<{ id: string }>()
  const [nda, setNda] = useState<Nda | null>(null)
  const [versions, setVersions] = useState<NdaVersion[]>([])
  const [selected, setSelected] = useState<NdaVersion | null>(null)
  const [authors, setAuthors] = useState<Record<string, AuthorLite>>({})
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>({})
  const [organization, setOrganization] = useState<Organization | null>(null)

  const [activeLang, setActiveLang] = useState<VersionLang>('en')
  const [viewMode, setViewMode] = useState<ViewMode>('rendered')
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    async function load() {
      const [ndaRes, versionsRes] = await Promise.all([
        supabase.from('ndas').select('*').eq('id', id!).single(),
        supabase.from('nda_versions').select('*').eq('nda_id', id!).order('version_number', { ascending: false }),
      ])
      setNda(ndaRes.data)
      setVersions(versionsRes.data || [])
      if (versionsRes.data && versionsRes.data.length > 0) setSelected(versionsRes.data[0])

      const authorIds = Array.from(new Set((versionsRes.data || []).map(v => v.changed_by).filter(Boolean)))
      if (authorIds.length > 0) {
        const { data: userRows } = await supabase.from('users').select('id, name').in('id', authorIds)
        setAuthors(Object.fromEntries((userRows || []).map(u => [u.id, u])))
      }

      const empIds = Array.from(new Set(
        (versionsRes.data || []).map(v => v.employee_id).filter((x): x is string => !!x),
      ))
      if (ndaRes.data?.employee_id) empIds.push(ndaRes.data.employee_id)
      const uniqueEmpIds = Array.from(new Set(empIds))
      if (uniqueEmpIds.length > 0) {
        const { data: emps } = await supabase.from('employees').select('*').in('id', uniqueEmpIds)
        setEmployeesById(Object.fromEntries((emps || []).map(e => [e.id, e])))
      }

      if (ndaRes.data?.org_id) {
        const { data: org } = await supabase.from('organizations').select('*').eq('id', ndaRes.data.org_id).single()
        setOrganization(org)
      }
    }
    load()
  }, [id])

  const displayBody = useMemo(() => {
    if (!selected) return ''
    if (viewMode === 'rendered') {
      const resolved = activeLang === 'en' ? selected.resolved_markdown_en : selected.resolved_markdown_id
      if (resolved) return resolved
      const raw = activeLang === 'en' ? selected.content_markdown : selected.content_markdown_id
      return raw ?? ''
    }
    const raw = activeLang === 'en' ? selected.content_markdown : selected.content_markdown_id
    return raw ?? ''
  }, [selected, viewMode, activeLang])

  const currentBody = useMemo(() => {
    if (!nda) return ''
    const raw = activeLang === 'en' ? nda.content_markdown : nda.content_markdown_id
    if (!raw) return ''
    if (viewMode === 'template') return raw
    const liveEmp = nda.employee_id ? employeesById[nda.employee_id] ?? null : null
    const ctx: MergeContext = {
      employee: liveEmp,
      organization,
      nda: { effective_date: nda.effective_date, survival_years: nda.survival_years, penalty_idr: nda.penalty_idr },
      today: new Date(),
      lang: activeLang,
    }
    return renderMergeFields(raw, ctx)
  }, [nda, activeLang, viewMode, employeesById, organization])

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

  if (!nda) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.ndaHistoryTitle(nda.title)}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.currentVersionLabel(nda.current_version)}</p>
        </div>
        <Link
          to={documentEditPath('nda', nda.id)}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.editNdaButton}
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.noNdaVersionHistory}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <VersionRail
            versions={versions}
            selectedId={selected?.id ?? null}
            authors={authors}
            lang={lang}
            onSelect={v => { setSelected(v as NdaVersion); setShowDiff(false) }}
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
              extraHeader={null}
              lang={lang}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  )
}
