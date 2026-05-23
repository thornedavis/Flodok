import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { generateUniqueSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { getEmployeeDepts, type EmpDeptShape } from '../../lib/employee'
import { findTemplateForPosition, buildContractFromTemplate } from '../../lib/contractTemplates'
import { documentEditPath } from '../../lib/documentTypes'
import { docAsJson, emptyDocumentDoc } from '../../lib/documentDoc'
import { advanceSignedToActiveForOrg } from '../../lib/lifecycleAdvance'
import {
  CANDIDATE_SOURCE_OPTIONS,
  candidateSourceLabel,
  profileCompletionPercentFromEmployee,
  type CandidateSourceOption,
} from '../../lib/candidateProfile'
import { FilterPanel, FilterSearchInput, MultiSelectDropdown } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { Skeleton } from '../../components/Skeleton'
import { DeleteEmployeeModal } from '../../components/DeleteEmployeeModal'
import type { Employee, Organization, User } from '../../types/aliases'
import type { Translations } from '../../lib/translations'

type RecruitmentStage = 'prospective' | 'shortlisted' | 'offered' | 'signed' | 'talent_pool' | 'no_show'
type Candidate = Employee & EmpDeptShape

type ColumnKey = 'position' | 'phone' | 'department' | 'source' | 'stage' | 'added'
type SortValue = 'created_at|desc' | 'created_at|asc' | 'name|asc' | 'name|desc'

const RECRUITMENT_STAGES: RecruitmentStage[] = ['prospective', 'shortlisted', 'offered', 'signed', 'talent_pool', 'no_show']
// Display order in the row + the order options appear in the Columns picker.
// Name (identity) and the actions cell are always present and live outside this list.
const COLUMN_ORDER: ColumnKey[] = ['position', 'phone', 'department', 'source', 'stage', 'added']
const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['position', 'phone', 'stage', 'added']
const COLUMNS_STORAGE_KEY = 'flodok.recruitment.columns'
const DEFAULT_SORT: SortValue = 'created_at|desc'

function columnLabel(key: ColumnKey, t: Translations): string {
  switch (key) {
    case 'position': return t.hiringColPosition
    case 'phone': return t.hiringFieldPhone
    case 'department': return t.hiringFieldDepartments
    case 'source': return t.candidateFieldSource
    case 'stage': return t.hiringColStage
    case 'added': return t.hiringColAdded
  }
}

const CANDIDATE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

export function Recruitment({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<RecruitmentStage[]>([])
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  const [deptFilter, setDeptFilter] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState<string[]>([])
  const [sort, setSort] = useState<SortValue>(DEFAULT_SORT)
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window === 'undefined') return new Set(DEFAULT_VISIBLE_COLUMNS)
    try {
      const saved = window.localStorage.getItem(COLUMNS_STORAGE_KEY)
      if (!saved) return new Set(DEFAULT_VISIBLE_COLUMNS)
      const parsed = JSON.parse(saved) as unknown
      if (!Array.isArray(parsed)) return new Set(DEFAULT_VISIBLE_COLUMNS)
      return new Set(parsed.filter((c): c is ColumnKey => COLUMN_ORDER.includes(c as ColumnKey)))
    } catch {
      return new Set(DEFAULT_VISIBLE_COLUMNS)
    }
  })
  const [makeOfferCandidate, setMakeOfferCandidate] = useState<Employee | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'single'; id: string; name: string }
    | { kind: 'bulk'; ids: string[] }
    | null
  >(null)

  useEffect(() => { loadData() }, [user.org_id])

  useEffect(() => {
    try { window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visibleColumns])) } catch { /* storage unavailable */ }
  }, [visibleColumns])

  async function loadData() {
    setLoading(true)
    // Graduate any 'signed' candidates whose start date has arrived before
    // we read — keeps the Recruitment page consistent with reality.
    await advanceSignedToActiveForOrg(user.org_id)
    const [empResult, orgResult] = await Promise.all([
      supabase.from('employees')
        .select(CANDIDATE_WITH_DEPTS_SELECT)
        .eq('org_id', user.org_id)
        .in('lifecycle_stage', RECRUITMENT_STAGES)
        .order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').eq('id', user.org_id).single(),
    ])
    setCandidates((empResult.data || []) as Candidate[])
    setOrg(orgResult.data || null)
    setLoading(false)
  }

  async function handleAddCandidate() {
    if (!canWrite || adding) return
    setAdding(true)
    const placeholderName = t.hiringNewPlaceholderName
    const slug = generateUniqueSlug(placeholderName)
    const token = generateAccessToken()
    const { data: created, error } = await supabase
      .from('employees')
      .insert({
        org_id: user.org_id,
        name: placeholderName,
        phone: '',
        slug,
        access_token: token,
        lifecycle_stage: 'prospective',
      })
      .select()
      .single()
    setAdding(false)
    if (error || !created) {
      alert(error?.message || t.hiringCreateError)
      return
    }
    navigate(`/dashboard/recruitment/${created.id}/edit?new=1`)
  }

  const counts = useMemo(() => {
    const out: Record<'all' | RecruitmentStage, number> = { all: candidates.length, prospective: 0, shortlisted: 0, offered: 0, signed: 0, talent_pool: 0, no_show: 0 }
    for (const c of candidates) {
      const stage = c.lifecycle_stage as RecruitmentStage
      if (stage in out) out[stage]++
    }
    return out
  }, [candidates])

  // Filter dimensions derived from the loaded candidates. Sections only appear
  // in the Filter panel when they have options (mirrors the Employees page).
  const positionOptions = useMemo(
    () => [...new Set(candidates.map(c => c.job_position).filter((v): v is string => !!v))].sort(),
    [candidates],
  )
  const departmentOptions = useMemo(
    () => [...new Set(candidates.flatMap(c => getEmployeeDepts(c)))].sort(),
    [candidates],
  )
  const sourceOptions = useMemo(
    () => CANDIDATE_SOURCE_OPTIONS.filter(s => candidates.some(c => c.source === s)),
    [candidates],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const stageSet = new Set(stageFilter)
    const positionSet = new Set(positionFilter)
    const deptSet = new Set(deptFilter)
    const sourceSet = new Set(sourceFilter)
    const [sortField, sortDir] = sort.split('|') as ['created_at' | 'name', 'asc' | 'desc']
    return candidates.filter(c => {
      if (stageSet.size > 0 && !stageSet.has(c.lifecycle_stage as RecruitmentStage)) return false
      if (positionSet.size > 0 && !(c.job_position && positionSet.has(c.job_position))) return false
      if (deptSet.size > 0 && !getEmployeeDepts(c).some(d => deptSet.has(d))) return false
      if (sourceSet.size > 0 && !(c.source && sourceSet.has(c.source))) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.job_position || '').toLowerCase().includes(q)
      )
    }).sort((a, b) => {
      const cmp = sortField === 'name'
        ? a.name.localeCompare(b.name)
        : a.created_at.localeCompare(b.created_at)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [candidates, stageFilter, positionFilter, deptFilter, sourceFilter, sort, search])

  const stageLabels = stageLabelMap(t)
  const visibleColumnKeys = COLUMN_ORDER.filter(k => visibleColumns.has(k))

  const goManageStructure = () => navigate('/dashboard/company?tab=structure')

  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect' as const,
      key: 'stage',
      label: t.hiringFilterStagesLabel,
      value: stageFilter,
      options: RECRUITMENT_STAGES.map(s => ({ id: s, label: stageLabels[s], count: counts[s] })),
      onChange: (next: string[]) => setStageFilter(next as RecruitmentStage[]),
    },
    ...(positionOptions.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'position',
      label: t.hiringColPosition,
      value: positionFilter,
      options: positionOptions.map(p => ({ id: p, label: p, count: candidates.filter(c => c.job_position === p).length })),
      onChange: setPositionFilter,
      headerAction: { label: t.hiringFieldManage, onClick: goManageStructure },
    }] : []),
    ...(departmentOptions.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'department',
      label: t.hiringFieldDepartments,
      value: deptFilter,
      options: departmentOptions.map(d => ({ id: d, label: d, count: candidates.filter(c => getEmployeeDepts(c).includes(d)).length })),
      onChange: setDeptFilter,
      headerAction: { label: t.hiringFieldManage, onClick: goManageStructure },
    }] : []),
    ...(sourceOptions.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'source',
      label: t.candidateFieldSource,
      value: sourceFilter,
      options: sourceOptions.map(s => ({ id: s, label: candidateSourceLabel(s, t), count: candidates.filter(c => c.source === s).length })),
      onChange: setSourceFilter,
    }] : []),
    {
      type: 'select' as const,
      key: 'sort',
      label: t.sortLabel,
      value: sort,
      defaultValue: DEFAULT_SORT,
      options: [
        { id: 'created_at|desc', label: t.sortRecentlyAdded },
        { id: 'created_at|asc', label: t.sortOldest },
        { id: 'name|asc', label: t.sortNameAsc },
        { id: 'name|desc', label: t.sortNameDesc },
      ],
      onChange: (next: string) => setSort(next as SortValue),
    },
  ]

  async function changeStage(candidate: Employee, nextStage: RecruitmentStage) {
    // Transitions into 'offered' open the Make offer modal — that's where
    // the draft contract gets created from the template (if any). Direct
    // stage flips for everything else.
    if (nextStage === 'offered' && candidate.lifecycle_stage !== 'offered') {
      setMakeOfferCandidate(candidate)
      return
    }
    const { error } = await supabase
      .from('employees')
      .update({ lifecycle_stage: nextStage })
      .eq('id', candidate.id)
    if (error) {
      alert(error.message)
      return
    }
    await loadData()
  }

  function deleteCandidate(candidate: Employee) {
    setDeleteTarget({ kind: 'single', id: candidate.id, name: candidate.name })
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.recruitmentTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.recruitmentSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleAddCandidate}
          disabled={!canWrite || adding}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.hiringAddCandidate}
        </button>
      </div>

      <div className="mb-4 flex w-full flex-wrap items-center gap-2">
        <FilterPanel
          triggerLabel={t.filterButtonLabel}
          sections={filterSections}
          onReset={() => {
            setStageFilter([])
            setPositionFilter([])
            setDeptFilter([])
            setSourceFilter([])
            setSort(DEFAULT_SORT)
          }}
        />
        <MultiSelectDropdown
          label={t.columnsButtonLabel}
          value={[...visibleColumns]}
          onChange={next => setVisibleColumns(new Set(next as ColumnKey[]))}
          options={COLUMN_ORDER.map(key => ({ id: key, label: columnLabel(key, t) }))}
        />
        <div className="ml-auto w-full sm:w-64">
          <FilterSearchInput value={search} onChange={setSearch} placeholder={t.hiringSearchPlaceholder} />
        </div>
      </div>

      {loading ? (
        <CandidateTableSkeleton colCount={visibleColumnKeys.length} />
      ) : visible.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {t.hiringEmpty}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                <th className="px-4 py-2.5">{t.hiringFieldName}</th>
                {visibleColumnKeys.map(key => (
                  <th key={key} className="px-4 py-2.5">{columnLabel(key, t)}</th>
                ))}
                <th className="px-4 py-2.5 text-right">{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  visibleColumns={visibleColumnKeys}
                  stageLabel={stageLabels[c.lifecycle_stage as RecruitmentStage] ?? c.lifecycle_stage}
                  lang={lang}
                  canWrite={canWrite}
                  orgDisplayName={org?.display_name || org?.name || ''}
                  onOpen={() => navigate(`/dashboard/recruitment/${c.id}/edit`)}
                  onChangeStage={next => changeStage(c, next)}
                  onDelete={() => deleteCandidate(c)}
                  onViewFullProfile={() => navigate(`/dashboard/employees/${c.id}/edit`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {makeOfferCandidate && (
        <MakeOfferModal
          candidate={makeOfferCandidate}
          orgId={user.org_id}
          onClose={() => setMakeOfferCandidate(null)}
          onCompleted={async () => { setMakeOfferCandidate(null); await loadData() }}
          onEditContract={(contractId) => navigate(documentEditPath('contract', contractId))}
          onManageTemplates={() => { setMakeOfferCandidate(null); navigate('/dashboard/templates') }}
        />
      )}

      <DeleteEmployeeModal
        open={deleteTarget !== null}
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={loadData}
      />

    </div>
  )
}

// Pulsing placeholder mirroring the candidate table (name + dynamic columns +
// actions) while the list loads, so the layout doesn't jump when data arrives.
function CandidateTableSkeleton({ colCount, rows = 6 }: { colCount: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }} role="status" aria-busy="true">
      <div
        className="flex items-center gap-4 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        <Skeleton className="h-2.5 w-24" />
        {Array.from({ length: colCount }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-t px-4 py-3.5 first:border-t-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
          {Array.from({ length: colCount }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-16" />
          ))}
          <Skeleton className="ml-auto h-3 w-6" />
        </div>
      ))}
    </div>
  )
}

function CandidateRow({ candidate, visibleColumns, stageLabel, lang, canWrite, orgDisplayName, onOpen, onChangeStage, onDelete, onViewFullProfile }: {
  candidate: Candidate
  visibleColumns: ColumnKey[]
  stageLabel: string
  lang: 'en' | 'id'
  canWrite: boolean
  orgDisplayName: string
  onOpen: () => void
  onChangeStage: (next: RecruitmentStage) => void
  onDelete: () => void
  onViewFullProfile: () => void
}) {
  const { t } = useLang()
  const gradient = getAvatarGradient(candidate.id)
  const initials = candidate.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')
  const stage = candidate.lifecycle_stage as RecruitmentStage
  // Build the candidate's portal URL once; reused for the copy-link button and
  // the WhatsApp message body. Same shape as elsewhere in the app
  // (e.g. Employees.tsx line 152, EmployeeEdit.tsx line 259).
  const portalUrl = `${window.location.origin}/portal/${candidate.slug}-${candidate.access_token}`
  const phoneDigits = candidate.phone?.replace(/[^0-9]/g, '') ?? ''
  // Pre-filled message embeds the portal URL so the candidate can tap-through
  // straight to their onboarding. Only meaningful pre-offer; for offered/signed
  // candidates the share button is still useful as a re-send.
  const whatsappShareUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(t.hiringWhatsAppShareMessage(candidate.name, orgDisplayName || '—', portalUrl))}`
    : null
  // Only count completion for pre-offer candidates — once they're offered,
  // HR has typically set the rest of the structural fields and the chip
  // stops being informative. Hide for signed / talent_pool too.
  const showCompletionChip = stage === 'prospective' || stage === 'shortlisted'
  const completionPct = showCompletionChip ? profileCompletionPercentFromEmployee(candidate) : null

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b last:border-0 hover:bg-[var(--color-bg-tertiary)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {candidate.photo_url ? (
            <img src={candidate.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: gradient }}>{initials || '?'}</div>
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{candidate.name}</span>
            {completionPct !== null && (
              <CompletionChip pct={completionPct} t={t} />
            )}
          </div>
        </div>
      </td>
      {visibleColumns.map(key => {
        switch (key) {
          case 'position':
            return <td key={key} className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{candidate.job_position || em()}</td>
          case 'phone':
            return <td key={key} className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{candidate.phone || em()}</td>
          case 'department': {
            const depts = getEmployeeDepts(candidate)
            return (
              <td key={key} className="px-4 py-3">
                {depts.length === 0 ? em() : (
                  <div className="flex flex-wrap gap-1">
                    {depts.map(d => (
                      <span key={d} className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{d}</span>
                    ))}
                  </div>
                )}
              </td>
            )
          }
          case 'source':
            return <td key={key} className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{candidate.source ? candidateSourceLabel(candidate.source as CandidateSourceOption, t) : em()}</td>
          case 'stage':
            return (
              <td key={key} className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <StagePicker stage={stage} label={stageLabel} disabled={!canWrite} onChange={onChangeStage} />
              </td>
            )
          case 'added':
            return <td key={key} className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(candidate.created_at, lang)}</td>
        }
      })}
      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <CopyPortalLinkButton url={portalUrl} t={t} />
          {whatsappShareUrl && (
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t.hiringActionShareViaWhatsApp}
              aria-label={t.hiringActionShareViaWhatsApp}
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1s-1.2-.5-2.3-1.4c-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2 0 1.3.9 2.6 1.1 2.7.1.2 1.8 2.7 4.3 3.8 1.6.7 2.2.7 3 .6.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.6-.3z M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5-1.3c1.5.8 3.2 1.3 5 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>
            </a>
          )}
          <RowActionsMenu
            stage={stage}
            disabled={!canWrite}
            onEdit={onOpen}
            onChangeStage={onChangeStage}
            onDelete={onDelete}
            onViewFullProfile={onViewFullProfile}
          />
        </div>
      </td>
    </tr>
  )
}

function CompletionChip({ pct, t }: { pct: number; t: Translations }) {
  // Colour shifts as completion rises so a 20%-complete profile reads as
  // urgent ("needs filling") and 80% reads as nearly-done.
  const tone = pct >= 80 ? 'success' : pct >= 40 ? 'progress' : 'warning'
  const palette: Record<string, { bg: string; fg: string }> = {
    warning:  { bg: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',  fg: 'var(--color-danger)' },
    progress: { bg: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', fg: 'var(--color-primary)' },
    success:  { bg: 'color-mix(in srgb, var(--color-success) 12%, transparent)', fg: 'var(--color-success)' },
  }
  const { bg, fg } = palette[tone]
  return (
    <span className="mt-0.5 inline-flex w-fit rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: bg, color: fg }}>
      {t.hiringCompletionChip(pct)}
    </span>
  )
}

function CopyPortalLinkButton({ url, t }: { url: string; t: Translations }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? t.hiringPortalLinkCopied : t.hiringActionCopyPortalLink}
      aria-label={t.hiringActionCopyPortalLink}
      className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

function RowActionsMenu({ stage, disabled, onEdit, onChangeStage, onDelete, onViewFullProfile }: {
  stage: RecruitmentStage
  disabled: boolean
  onEdit: () => void
  onChangeStage: (next: RecruitmentStage) => void
  onDelete: () => void
  onViewFullProfile: () => void
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleClose() { setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)', backgroundColor: 'var(--color-bg)' }}
        disabled={disabled}
      >
        <span>{t.hiringActionsLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ top: `${pos.top}px`, right: `${pos.right}px`, borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <MenuItem onClick={() => { setOpen(false); onEdit() }}>{t.edit}</MenuItem>

          {stage === 'prospective' && (
            <>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('shortlisted') }} primary>{t.hiringActionShortlist}</MenuItem>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('offered') }}>{t.hiringActionMakeOffer}</MenuItem>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('talent_pool') }}>{t.hiringActionMoveToTalentPool}</MenuItem>
            </>
          )}
          {stage === 'shortlisted' && (
            <>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('offered') }} primary>{t.hiringActionMakeOffer}</MenuItem>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('prospective') }}>{t.hiringActionUnshortlist}</MenuItem>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('talent_pool') }}>{t.hiringActionMoveToTalentPool}</MenuItem>
            </>
          )}
          {stage === 'offered' && (
            <>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('shortlisted') }}>{t.hiringActionWithdrawOffer}</MenuItem>
              <MenuItem onClick={() => { setOpen(false); onChangeStage('talent_pool') }}>{t.hiringActionMoveToTalentPool}</MenuItem>
            </>
          )}
          {stage === 'signed' && (
            <MenuItem onClick={() => { setOpen(false); onViewFullProfile() }}>{t.hiringActionViewFullProfile}</MenuItem>
          )}
          {stage === 'talent_pool' && (
            <MenuItem onClick={() => { setOpen(false); onChangeStage('prospective') }} primary>{t.hiringActionReconsider}</MenuItem>
          )}

          <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <MenuItem onClick={() => { setOpen(false); onDelete() }} danger>{t.delete}</MenuItem>
        </div>,
        document.body,
      )}
    </>
  )
}

function MenuItem({ onClick, children, primary, danger }: { onClick: () => void; children: React.ReactNode; primary?: boolean; danger?: boolean }) {
  const color = danger ? 'var(--color-danger)' : primary ? 'var(--color-primary)' : 'var(--color-text)'
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ color, fontWeight: primary ? 600 : 400 }}
    >
      {children}
    </button>
  )
}

function em() {
  return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
}

function StagePicker({ stage, label, disabled, onChange }: {
  stage: RecruitmentStage
  label: string
  disabled: boolean
  onChange: (next: RecruitmentStage) => void
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const tone = STAGE_TONES[stage]
  const labels = stageLabelMap(t)

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 4, left: rect.left })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleClose() { setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        disabled={disabled}
        aria-label={t.hiringChangeStageAria}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: tone.bg, color: tone.text }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
        {label}
        {!disabled && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ top: `${pos.top}px`, left: `${pos.left}px`, borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {RECRUITMENT_STAGES.map(s => {
            const stageTone = STAGE_TONES[s]
            const isCurrent = s === stage
            return (
              <button
                key={s}
                role="menuitemradio"
                aria-checked={isCurrent}
                onClick={() => { setOpen(false); if (!isCurrent) onChange(s) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: 'var(--color-text)' }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: stageTone.dot }} />
                <span className="flex-1">{labels[s]}</span>
                {isCurrent && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

const STAGE_TONES: Record<RecruitmentStage, { bg: string; text: string; dot: string }> = {
  prospective: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 14%, transparent)', text: 'var(--color-text-secondary)', dot: 'var(--color-text-tertiary)' },
  shortlisted: { bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)', text: 'var(--color-warning)', dot: 'var(--color-warning)' },
  offered: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', text: 'var(--color-primary)', dot: 'var(--color-primary)' },
  signed: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', text: 'var(--color-success)', dot: 'var(--color-success)' },
  talent_pool: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 10%, transparent)', text: 'var(--color-text-tertiary)', dot: 'var(--color-text-tertiary)' },
  no_show: { bg: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', text: 'var(--color-danger)', dot: 'var(--color-danger)' },
}

function stageLabelMap(t: Translations): Record<RecruitmentStage, string> {
  return {
    prospective: t.hiringStageProspective,
    shortlisted: t.hiringStageShortlisted,
    offered: t.hiringStageOffered,
    signed: t.hiringStageSigned,
    talent_pool: t.hiringStageTalentPool,
    no_show: t.hiringStageNoShow,
  }
}

function formatDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

// ───── Make offer modal ───────────────────────────────────────────────────

function MakeOfferModal({ candidate, orgId, onClose, onCompleted, onEditContract, onManageTemplates }: {
  candidate: Employee
  orgId: string
  onClose: () => void
  onCompleted: () => void
  onEditContract: (contractId: string) => void
  onManageTemplates: () => void
}) {
  const { t } = useLang()
  const [loadingTemplate, setLoadingTemplate] = useState(true)
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof findTemplateForPosition>>>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdContractId, setCreatedContractId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    findTemplateForPosition(orgId, candidate.job_position).then(found => {
      if (!cancelled) { setTemplate(found); setLoadingTemplate(false) }
    })
    return () => { cancelled = true }
  }, [orgId, candidate.job_position, candidate.id])

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError('')

    const baseTitle = t.makeOfferContractTitle(candidate.name, candidate.job_position)
    const contractPayload = template
      ? buildContractFromTemplate(template, candidate.id, { title: `${template.title} — ${candidate.name}` })
      : {
          org_id: orgId,
          employee_id: candidate.id,
          title: baseTitle,
          content_doc: docAsJson(emptyDocumentDoc()),
          base_wage_idr: null,
          allowance_idr: null,
          hours_per_day: null,
          days_per_week: null,
          start_date: null,
          end_date: null,
          status: 'draft' as const,
          is_template: false,
        }

    const { data: newContract, error: insertError } = await supabase
      .from('contracts')
      .insert(contractPayload)
      .select()
      .single()

    if (insertError || !newContract) {
      setSubmitting(false)
      setError(insertError?.message || t.makeOfferError)
      return
    }

    const { error: stageError } = await supabase
      .from('employees')
      .update({ lifecycle_stage: 'offered' })
      .eq('id', candidate.id)

    if (stageError) {
      // Roll back the orphaned contract so the user can retry cleanly.
      await supabase.from('contracts').delete().eq('id', newContract.id)
      setSubmitting(false)
      setError(stageError.message)
      return
    }

    setSubmitting(false)
    setCreatedContractId(newContract.id)
  }

  // Success view
  if (createdContractId) {
    return (
      <ModalShell onClose={onClose}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.makeOfferSuccessTitle}</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.makeOfferSuccessBody}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCompleted}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.makeOfferDone}
          </button>
          <button
            type="button"
            onClick={() => onEditContract(createdContractId)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.makeOfferEditContract}
          </button>
        </div>
      </ModalShell>
    )
  }

  // Confirm view
  const hasPosition = !!candidate.job_position
  const confirmLabel = template ? t.makeOfferConfirm : t.makeOfferConfirmBlank

  return (
    <ModalShell onClose={onClose}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.makeOfferTitle}</h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.makeOfferSubtitle(candidate.name)}</p>

      <div className="mt-5 space-y-4">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.makeOfferCandidatePosition}</div>
          <div className="mt-1 text-sm" style={{ color: hasPosition ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
            {candidate.job_position || t.makeOfferCandidateNoPosition}
          </div>
        </div>

        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.makeOfferTemplateLabel}</div>
            <button
              type="button"
              onClick={onManageTemplates}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.makeOfferManageTemplates} →
            </button>
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {loadingTemplate ? t.loading
              : template ? t.makeOfferTemplateUsing(template.title)
              : !hasPosition ? t.makeOfferTemplateNoPosition
              : t.makeOfferTemplateMissing}
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.cancel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || loadingTemplate}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {submitting ? t.saving : confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border p-5 shadow-xl"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

