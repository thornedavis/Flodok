// Version history viewer for Contracts.
//
// Same shape as SOPHistory but adds a structured-field strip: the employee,
// wages, and hours snapshotted at save time. Reads all of this from the
// contract_versions row rather than the live contract — that's the whole
// point of structured snapshots, so editing a wage later doesn't silently
// rewrite history.
//
// Backfilled rows have NULL structured fields; those render as "—" rather
// than fabricating numbers from the current contract.

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { diffLines } from 'diff'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { renderMergeFields, type MergeContext } from '../../lib/mergeFields'
import { formatIdr } from '../../lib/credits'
import { VersionRail, VersionPane } from './SOPHistory'
import type { Contract, ContractVersion, Employee, Organization } from '../../types/database'

type VersionLang = 'en' | 'id'
type ViewMode = 'rendered' | 'template'
type AuthorLite = { id: string; name: string }

export function ContractHistory() {
  const { t, lang } = useLang()
  const { id } = useParams<{ id: string }>()
  const [contract, setContract] = useState<Contract | null>(null)
  const [versions, setVersions] = useState<ContractVersion[]>([])
  const [selected, setSelected] = useState<ContractVersion | null>(null)
  const [authors, setAuthors] = useState<Record<string, AuthorLite>>({})
  const [employeesById, setEmployeesById] = useState<Record<string, Employee>>({})
  const [organization, setOrganization] = useState<Organization | null>(null)

  const [activeLang, setActiveLang] = useState<VersionLang>('en')
  const [viewMode, setViewMode] = useState<ViewMode>('rendered')
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    async function load() {
      const [contractRes, versionsRes] = await Promise.all([
        supabase.from('contracts').select('*').eq('id', id!).single(),
        supabase.from('contract_versions').select('*').eq('contract_id', id!).order('version_number', { ascending: false }),
      ])
      setContract(contractRes.data)
      setVersions(versionsRes.data || [])
      if (versionsRes.data && versionsRes.data.length > 0) {
        setSelected(versionsRes.data[0])
      }

      const authorIds = Array.from(new Set((versionsRes.data || []).map(v => v.changed_by).filter(Boolean)))
      if (authorIds.length > 0) {
        const { data: userRows } = await supabase.from('users').select('id, name').in('id', authorIds)
        setAuthors(Object.fromEntries((userRows || []).map(u => [u.id, u])))
      }

      // Load every employee snapshotted by any version — the "employee at
      // the time" might be someone no longer linked to the live contract.
      const empIds = Array.from(new Set(
        (versionsRes.data || [])
          .map(v => v.employee_id)
          .filter((x): x is string => !!x)
      ))
      if (contractRes.data?.employee_id) empIds.push(contractRes.data.employee_id)
      const uniqueEmpIds = Array.from(new Set(empIds))
      if (uniqueEmpIds.length > 0) {
        const { data: emps } = await supabase.from('employees').select('*').in('id', uniqueEmpIds)
        setEmployeesById(Object.fromEntries((emps || []).map(e => [e.id, e])))
      }

      if (contractRes.data?.org_id) {
        const { data: org } = await supabase.from('organizations').select('*').eq('id', contractRes.data.org_id).single()
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
    if (!contract) return ''
    const raw = activeLang === 'en' ? contract.content_markdown : contract.content_markdown_id
    if (!raw) return ''
    if (viewMode === 'template') return raw
    const liveEmp = contract.employee_id ? employeesById[contract.employee_id] ?? null : null
    const ctx: MergeContext = {
      employee: liveEmp,
      organization,
      contract,
      today: new Date(),
      lang: activeLang,
    }
    return renderMergeFields(raw, ctx)
  }, [contract, activeLang, viewMode, employeesById, organization])

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

  if (!contract) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const extraHeader = selected ? (
    <StructuralSnapshotStrip
      version={selected}
      employee={selected.employee_id ? employeesById[selected.employee_id] : undefined}
      lang={lang}
      t={t}
    />
  ) : null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.contractHistoryTitle(contract.title)}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.currentVersionLabel(contract.current_version)}</p>
        </div>
        <Link
          to={`/dashboard/contracts/${contract.id}/edit`}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.editContractButton}
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.noContractVersionHistory}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <VersionRail
            versions={versions}
            selectedId={selected?.id ?? null}
            authors={authors}
            lang={lang}
            onSelect={v => { setSelected(v as ContractVersion); setShowDiff(false) }}
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
              extraHeader={extraHeader}
              lang={lang}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StructuralSnapshotStrip({ version, employee, lang, t }: {
  version: ContractVersion
  employee: Employee | undefined
  lang: 'en' | 'id'
  t: ReturnType<typeof useLang>['t']
}) {
  const dash = t.noSnapshotField
  return (
    <div
      className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 text-xs sm:grid-cols-5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <SnapshotField label={t.snapshotEmployeeAtTime}>
        {employee?.name ?? dash}
      </SnapshotField>
      <SnapshotField label={t.baseWageLabel}>
        {version.base_wage_idr != null ? formatIdr(version.base_wage_idr, lang) : dash}
      </SnapshotField>
      <SnapshotField label={t.allowanceLabel}>
        {version.allowance_idr != null ? formatIdr(version.allowance_idr, lang) : dash}
      </SnapshotField>
      <SnapshotField label={t.hoursPerDayLabel}>
        {version.hours_per_day != null ? version.hours_per_day : dash}
      </SnapshotField>
      <SnapshotField label={t.daysPerWeekLabel}>
        {version.days_per_week != null ? version.days_per_week : dash}
      </SnapshotField>
    </div>
  )
}

function SnapshotField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="mt-0.5 font-medium" style={{ color: 'var(--color-text)' }}>{children}</div>
    </div>
  )
}
