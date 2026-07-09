import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { generateUniqueSlug } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { getEmployeeDepts, type EmpDeptShape } from '../../lib/employee'
import { findTemplateForPosition, buildContractFromTemplate, seedContractComponentsFromTemplate } from '../../lib/contractTemplates'
import { documentEditPath } from '../../lib/documentTypes'
import { docAsJson, emptyDocumentDoc } from '../../lib/documentDoc'
import { advanceSignedToActiveForOrg } from '../../lib/lifecycleAdvance'
import { RECRUITMENT_STAGES, type RecruitmentStage, type LifecycleStage } from '../../lib/lifecycle'
import {
  CANDIDATE_SOURCE_OPTIONS,
  candidateSourceLabel,
  computeProfileSections,
  type CandidateSourceOption,
} from '../../lib/candidateProfile'
import { PathTracker } from '../../components/recruitment/PathTracker'
import { HorizontalScrollFade } from '../../components/HorizontalScrollFade'
import { stageColor } from '../../lib/recruitmentColors'
import {
  deriveBoardColumn,
  deriveStatus,
  type BoardColumn,
  type CandidateSignals,
  type CandidateStatus,
  type StatusActor,
} from '../../lib/recruitmentStatus'
import { FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { Skeleton } from '../../components/Skeleton'
import { DeleteEmployeeModal } from '../../components/DeleteEmployeeModal'
import { WhatsAppIcon } from '../../components/BetaFeedback'
import type { Employee, Organization, User } from '../../types/aliases'
import type { Translations } from '../../lib/translations'

type Candidate = Employee & EmpDeptShape

type SortValue = 'created_at|desc' | 'created_at|asc' | 'name|asc' | 'name|desc'
const DEFAULT_SORT: SortValue = 'created_at|desc'

type ViewMode = 'board' | 'list'
const VIEW_STORAGE_KEY = 'flodok.recruitment.view'

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
  const [makeOfferCandidate, setMakeOfferCandidate] = useState<Employee | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'single'; id: string; name: string }
    | { kind: 'bulk'; ids: string[] }
    | null
  >(null)
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'board'
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'board'
  })
  const [signalsById, setSignalsById] = useState<Map<string, CandidateSignals>>(new Map())
  const [drawerId, setDrawerId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [user.org_id])

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, view) } catch { /* storage unavailable */ }
  }, [view])

  async function loadData() {
    setLoading(true)
    // Graduate any 'signed' candidates whose start date has arrived before
    // we read — keeps the Recruitment page consistent with reality.
    await advanceSignedToActiveForOrg(user.org_id)
    const [empResult, orgResult] = await Promise.all([
      supabase.from('employees')
        .select(CANDIDATE_WITH_DEPTS_SELECT)
        .eq('org_id', user.org_id)
        .in('lifecycle_stage', [...RECRUITMENT_STAGES])
        .order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').eq('id', user.org_id).single(),
    ])
    const cands = (empResult.data || []) as Candidate[]
    setCandidates(cands)
    setOrg(orgResult.data || null)
    setSignalsById(await loadCandidateSignals(cands))
    setLoading(false)
  }

  async function handleAddCandidate() {
    if (!canWrite || adding) return
    setAdding(true)
    const placeholderName = t.hiringNewPlaceholderName
    const slug = generateUniqueSlug(placeholderName)
    // access_token is minted server-side by the DB default (migration 165).
    const { data: created, error } = await supabase
      .from('employees')
      .insert({
        org_id: user.org_id,
        name: placeholderName,
        phone: '',
        slug,
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

  const statusById = useMemo(() => {
    const m = new Map<string, CandidateStatus>()
    for (const c of candidates) {
      const s = signalsById.get(c.id)
      if (s) m.set(c.id, deriveStatus(c.lifecycle_stage as LifecycleStage, s))
    }
    return m
  }, [candidates, signalsById])

  const board = useMemo(() => {
    const groups: Record<BoardColumn, Candidate[]> = {
      prospective: [], shortlisted: [], offered: [], signed_onboarding: [], starting_soon: [], inactive: [],
    }
    for (const c of visible) {
      const s = signalsById.get(c.id)
      const col = s ? deriveBoardColumn(c.lifecycle_stage as LifecycleStage, s) : 'inactive'
      groups[col].push(c)
    }
    return groups
  }, [visible, signalsById])

  const drawerCandidate = drawerId ? candidates.find(c => c.id === drawerId) ?? null : null

  const stageLabels = stageLabelMap(t)

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
      setDrawerId(null)
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

  // Drawer actions. "Activate now" is a manual override of the lazy join-date
  // auto-advance — only offered from the drawer once a start date exists.
  async function activateNow(candidate: Candidate) {
    const { error } = await supabase.from('employees').update({ lifecycle_stage: 'active' }).eq('id', candidate.id)
    if (error) { alert(error.message); return }
    setDrawerId(null)
    await loadData()
  }

  async function updateStartDate(candidate: Candidate, date: string | null) {
    const { error } = await supabase.from('employees').update({ join_date: date }).eq('id', candidate.id)
    if (error) { alert(error.message); return }
    await loadData()
  }

  async function markNoShow(candidate: Candidate) {
    await changeStage(candidate, 'no_show')
    setDrawerId(null)
  }

  function deleteCandidate(candidate: Employee) {
    setDeleteTarget({ kind: 'single', id: candidate.id, name: candidate.name })
  }

  async function handleAfterDelete() {
    await loadData()
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.recruitmentTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.recruitmentSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} t={t} />
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
        <div className="ml-auto w-full sm:w-64">
          <FilterSearchInput value={search} onChange={setSearch} placeholder={t.hiringSearchPlaceholder} />
        </div>
      </div>

      {loading ? (
        <CandidateTableSkeleton colCount={3} />
      ) : view === 'board' ? (
        <RecruitmentBoard board={board} statusById={statusById} onOpen={setDrawerId} t={t} />
      ) : visible.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {t.hiringEmpty}
        </div>
      ) : (
        <RecruitmentList candidates={visible} statusById={statusById} onOpen={setDrawerId} t={t} />
      )}

      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          status={statusById.get(drawerCandidate.id) ?? null}
          signals={signalsById.get(drawerCandidate.id) ?? null}
          canWrite={canWrite}
          orgDisplayName={org?.display_name || org?.name || ''}
          lang={lang}
          onClose={() => setDrawerId(null)}
          onChangeStage={next => changeStage(drawerCandidate, next)}
          onActivateNow={() => activateNow(drawerCandidate)}
          onSetStartDate={date => updateStartDate(drawerCandidate, date)}
          onMarkNoShow={() => markNoShow(drawerCandidate)}
          onDelete={() => { setDrawerId(null); deleteCandidate(drawerCandidate) }}
          onViewFullProfile={() => navigate(`/dashboard/recruitment/${drawerCandidate.id}/edit`)}
          onLinkJd={() => navigate(`/dashboard/recruitment/${drawerCandidate.id}/edit?focus=jd`)}
        />
      )}

      {makeOfferCandidate && (
        <MakeOfferModal
          candidate={makeOfferCandidate}
          orgId={user.org_id}
          onClose={() => setMakeOfferCandidate(null)}
          onCompleted={async () => { setMakeOfferCandidate(null); await loadData() }}
          onEditContract={(contractId) => navigate(documentEditPath('contract', contractId))}
          onManageTemplates={() => { setMakeOfferCandidate(null); navigate('/dashboard/templates') }}
          onCreateJd={() => { setMakeOfferCandidate(null); navigate('/dashboard/hiring') }}
        />
      )}

      <DeleteEmployeeModal
        open={deleteTarget !== null}
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleAfterDelete}
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
        <Skeleton className="h-3.5 w-4" />
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
          <Skeleton className="h-4 w-4 shrink-0" />
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

function MakeOfferModal({ candidate, orgId, onClose, onCompleted, onEditContract, onManageTemplates, onCreateJd }: {
  candidate: Employee
  orgId: string
  onClose: () => void
  onCompleted: () => void
  onEditContract: (contractId: string) => void
  onManageTemplates: () => void
  onCreateJd: () => void
}) {
  const { t } = useLang()
  const [loadingTemplate, setLoadingTemplate] = useState(true)
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof findTemplateForPosition>>>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdContractId, setCreatedContractId] = useState<string | null>(null)
  // A linked JD is required to send an offer. Pre-fill with whatever's already
  // on the candidate; the picker lets you attach one right here if not.
  const [jds, setJds] = useState<{ id: string; title: string; department_name: string | null }[]>([])
  const [loadingJds, setLoadingJds] = useState(true)
  const [selectedJdId, setSelectedJdId] = useState(candidate.applied_for_jd_id || '')

  useEffect(() => {
    let cancelled = false
    findTemplateForPosition(orgId, candidate.job_position).then(found => {
      if (!cancelled) { setTemplate(found); setLoadingTemplate(false) }
    })
    return () => { cancelled = true }
  }, [orgId, candidate.job_position, candidate.id])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('job_descriptions')
      .select('id, title, department:company_departments!job_descriptions_department_id_fkey(name)')
      .eq('org_id', orgId)
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setJds((data ?? []).map(d => ({
          id: d.id,
          title: d.title,
          department_name: Array.isArray(d.department)
            ? (d.department[0] as { name: string } | undefined)?.name ?? null
            : ((d.department as { name: string } | null)?.name ?? null),
        })))
        setLoadingJds(false)
      })
    return () => { cancelled = true }
  }, [orgId])

  async function handleConfirm() {
    if (submitting) return
    if (!selectedJdId) { setError(t.makeOfferJdRequired); return }
    setSubmitting(true)
    setError('')

    // A JD is required to offer — link the chosen one to the candidate first.
    if (selectedJdId !== (candidate.applied_for_jd_id || '')) {
      const { error: jdErr } = await supabase.from('employees').update({ applied_for_jd_id: selectedJdId }).eq('id', candidate.id)
      if (jdErr) { setSubmitting(false); setError(jdErr.message); return }
    }

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

    // Seed the allowance breakdown from the template (trigger derives allowance_idr).
    if (template) {
      await seedContractComponentsFromTemplate(newContract.id, orgId, template)
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

        <div className="rounded-lg border p-3" style={{ borderColor: selectedJdId ? 'var(--color-border)' : 'color-mix(in srgb, var(--color-warning) 45%, transparent)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.recruitStepJd}</div>
            {!loadingJds && jds.length === 0 && (
              <button type="button" onClick={onCreateJd} className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>{t.makeOfferCreateJd} →</button>
            )}
          </div>
          {loadingJds ? (
            <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
          ) : jds.length === 0 ? (
            <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.candidateNoPublishedJds}</div>
          ) : (
            <>
              <select
                value={selectedJdId}
                onChange={e => setSelectedJdId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              >
                <option value="">{t.makeOfferJdPlaceholder}</option>
                {jds.map(j => (
                  <option key={j.id} value={j.id}>{j.department_name ? `${j.title} — ${j.department_name}` : j.title}</option>
                ))}
              </select>
              <div className="mt-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.makeOfferJdHelp}</div>
            </>
          )}
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
          disabled={submitting || loadingTemplate || loadingJds || !selectedJdId}
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

// ───── Board redesign: signals, views, drawer ─────────────────────────────

function recruitTodayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Batch-fetch the signals that decide each candidate's status: contract/JD
// signatures + onboarding-section counts for the offered/signed cohort. A
// `signed` candidate has already cleared signing (server-enforced), so those
// are assumed true; only the offered cohort needs the signature lookups.
async function loadCandidateSignals(cands: Candidate[]): Promise<Map<string, CandidateSignals>> {
  const today = recruitTodayYmd()
  const map = new Map<string, CandidateSignals>()
  const cohortIds = cands
    .filter(c => c.lifecycle_stage === 'offered' || c.lifecycle_stage === 'signed')
    .map(c => c.id)

  const contractSigned = new Set<string>()
  const jdSigned = new Set<string>()
  const counts = new Map<string, { edu: number; exp: number; fam: number; emg: number }>()

  if (cohortIds.length > 0) {
    const [cs, js, edu, exp, fam, emg] = await Promise.all([
      supabase.from('contract_signatures').select('employee_id').eq('signer_role', 'employee').in('employee_id', cohortIds),
      supabase.from('job_description_signatures').select('employee_id').in('employee_id', cohortIds),
      supabase.from('employee_formal_education').select('employee_id').in('employee_id', cohortIds),
      supabase.from('employee_working_experience').select('employee_id').in('employee_id', cohortIds),
      supabase.from('employee_family_members').select('employee_id').in('employee_id', cohortIds),
      supabase.from('employee_emergency_contacts').select('employee_id').in('employee_id', cohortIds),
    ])
    for (const r of cs.data ?? []) if (r.employee_id) contractSigned.add(r.employee_id)
    for (const r of js.data ?? []) if (r.employee_id) jdSigned.add(r.employee_id)
    const tally = (rows: { employee_id: string | null }[] | null, key: 'edu' | 'exp' | 'fam' | 'emg') => {
      for (const r of rows ?? []) {
        if (!r.employee_id) continue
        const c = counts.get(r.employee_id) ?? { edu: 0, exp: 0, fam: 0, emg: 0 }
        c[key] += 1
        counts.set(r.employee_id, c)
      }
    }
    tally(edu.data, 'edu')
    tally(exp.data, 'exp')
    tally(fam.data, 'fam')
    tally(emg.data, 'emg')
  }

  for (const c of cands) {
    const cnt = counts.get(c.id) ?? { edu: 0, exp: 0, fam: 0, emg: 0 }
    const sections = computeProfileSections(c, {
      formalEducation: cnt.edu, workingExperience: cnt.exp, familyMembers: cnt.fam, emergencyContacts: cnt.emg,
    })
    const stage = c.lifecycle_stage as string
    map.set(c.id, {
      hasContract: stage === 'offered' || stage === 'signed',
      contractSigned: contractSigned.has(c.id) || stage === 'signed',
      jdLinked: !!c.applied_for_jd_id,
      jdSigned: jdSigned.has(c.id) || stage === 'signed',
      onboardingDone: sections.filter(s => s.complete).length,
      onboardingTotal: sections.length,
      joinDate: c.join_date ?? null,
      today,
      sections: sections.map(s => ({ key: s.key, complete: s.complete })),
    })
  }
  return map
}

function ViewToggle({ view, onChange, t }: { view: ViewMode; onChange: (v: ViewMode) => void; t: Translations }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      {(['board', 'list'] as ViewMode[]).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={view === v
            ? { backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }
            : { backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
        >
          {v === 'board' ? t.tasksViewBoard : t.tasksViewList}
        </button>
      ))}
    </div>
  )
}

const ACTOR_TONE: Record<StatusActor, { bg: string; fg: string; dot: string }> = {
  needs_you: { bg: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', fg: 'var(--color-warning)', dot: 'var(--color-warning)' },
  with_them: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)', dot: 'var(--color-text-tertiary)' },
  scheduled: { bg: 'color-mix(in srgb, var(--color-primary) 13%, transparent)', fg: 'var(--color-primary)', dot: 'var(--color-primary)' },
  ready: { bg: 'color-mix(in srgb, var(--color-success) 15%, transparent)', fg: 'var(--color-success)', dot: 'var(--color-success)' },
  stuck: { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)', fg: 'var(--color-danger)', dot: 'var(--color-danger)' },
  neutral: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-tertiary)', dot: 'var(--color-text-tertiary)' },
}

function statusText(status: CandidateStatus, t: Translations, lang: 'en' | 'id'): string {
  switch (status.kind) {
    case 'awaiting_profile': return t.recruitStatusAwaitingProfile
    case 'filling_profile': return t.recruitStatusFillingProfile(status.data?.pct ?? 0)
    case 'ready_to_offer': return t.recruitStatusReadyToOffer
    case 'add_jd': return t.recruitStatusAddJd
    case 'awaiting_contract_sign': return t.recruitStatusAwaiting
    case 'awaiting_jd_sign': return t.recruitStatusAwaitingJd
    case 'onboarding': return t.recruitStatusOnboarding(status.data?.done ?? 0, status.data?.total ?? 7)
    case 'set_start_date': return t.recruitStatusSetStartDate
    case 'starts_on': return t.recruitStatusStartsOn(status.data?.date ? formatDate(status.data.date, lang) : '')
    case 'ready_today': return t.recruitStatusReadyToday
    case 'talent_pool': return t.hiringStageTalentPool
    case 'no_show': return t.hiringStageNoShow
  }
}

function StatusChip({ status, t, lang }: { status: CandidateStatus; t: Translations; lang: 'en' | 'id' }) {
  const tone = ACTOR_TONE[status.actor]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: tone.bg, color: tone.fg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
      {statusText(status, t, lang)}
    </span>
  )
}

function CandidateCard({ candidate, status, onOpen }: { candidate: Candidate; status: CandidateStatus | null; onOpen: () => void }) {
  const { t, lang } = useLang()
  const gradient = getAvatarGradient(candidate.id)
  const initials = candidate.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')
  const imminent = status?.kind === 'starts_on' || status?.kind === 'ready_today'
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border p-3 text-left transition-colors hover:border-[var(--color-border-strong)]"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        {candidate.photo_url
          ? <img src={candidate.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: gradient }}>{initials || '?'}</div>}
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold" style={{ color: 'var(--color-text)' }}>{candidate.name}</div>
          <div className="truncate text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>{candidate.job_position || '—'}</div>
        </div>
      </div>
      <div className="mb-2.5"><PathTracker stage={candidate.lifecycle_stage as LifecycleStage} size="mini" imminent={imminent} /></div>
      {status && <StatusChip status={status} t={t} lang={lang} />}
    </button>
  )
}

const BOARD_ORDER: BoardColumn[] = ['prospective', 'shortlisted', 'offered', 'signed_onboarding', 'starting_soon']

const BOARD_DOT: Record<BoardColumn, string> = {
  prospective: 'var(--color-text-tertiary)',
  shortlisted: 'var(--color-warning)',
  offered: 'var(--color-primary)',
  signed_onboarding: 'var(--color-success)',
  starting_soon: 'var(--color-primary)',
  inactive: 'var(--color-text-tertiary)',
}

function boardColumnLabel(col: BoardColumn, t: Translations): string {
  switch (col) {
    case 'prospective': return t.hiringStageProspective
    case 'shortlisted': return t.hiringStageShortlisted
    case 'offered': return t.hiringStageOffered
    case 'signed_onboarding': return t.recruitColOnboarding
    case 'starting_soon': return t.recruitColStartingSoon
    default: return ''
  }
}

function RecruitmentBoard({ board, statusById, onOpen, t }: {
  board: Record<BoardColumn, Candidate[]>
  statusById: Map<string, CandidateStatus>
  onOpen: (id: string) => void
  t: Translations
}) {
  return (
    <HorizontalScrollFade className="flex gap-3 pb-2">
      {BOARD_ORDER.map(col => {
        const items = board[col]
        return (
          <section key={col} className="flex w-[264px] shrink-0 flex-col rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BOARD_DOT[col] }} />
              <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text)' }}>{boardColumnLabel(col, t)}</span>
              <span className="ml-auto rounded-full px-2 text-[11px] font-semibold tabular-nums" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>{items.length}</span>
            </div>
            <div className="flex flex-col gap-2 px-2.5 pb-3">
              {items.length === 0
                ? <div className="rounded-lg border border-dashed px-3 py-6 text-center text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>{t.hiringEmpty}</div>
                : items.map(c => <CandidateCard key={c.id} candidate={c} status={statusById.get(c.id) ?? null} onOpen={() => onOpen(c.id)} />)}
            </div>
          </section>
        )
      })}
    </HorizontalScrollFade>
  )
}

const LIST_COLS = 'grid-cols-[minmax(170px,1.3fr)_minmax(230px,2fr)_minmax(140px,1fr)]'

function RecruitmentList({ candidates, statusById, onOpen, t }: {
  candidates: Candidate[]
  statusById: Map<string, CandidateStatus>
  onOpen: (id: string) => void
  t: Translations
}) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
      <div className="min-w-[660px]">
        <div className={`grid ${LIST_COLS} gap-4 border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide`} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-bg-tertiary)' }}>
          <span>{t.recruitListCandidate}</span>
          <span>{t.recruitListPath}</span>
          <span className="text-right">{t.recruitListWaitingOn}</span>
        </div>
        {candidates.map(c => (
          <ListRow key={c.id} candidate={c} status={statusById.get(c.id) ?? null} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
    </div>
  )
}

function ListRow({ candidate, status, onOpen }: { candidate: Candidate; status: CandidateStatus | null; onOpen: () => void }) {
  const { t, lang } = useLang()
  const gradient = getAvatarGradient(candidate.id)
  const initials = candidate.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')
  const imminent = status?.kind === 'starts_on' || status?.kind === 'ready_today'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`grid w-full ${LIST_COLS} items-center gap-4 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--color-bg-tertiary)]`}
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {candidate.photo_url
          ? <img src={candidate.photo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white" style={{ background: gradient }}>{initials || '?'}</div>}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{candidate.name}</div>
          <div className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>{candidate.job_position || '—'}</div>
        </div>
      </div>
      <div className="min-w-0"><PathTracker stage={candidate.lifecycle_stage as LifecycleStage} size="row" imminent={imminent} /></div>
      <div className="flex justify-end">{status && <StatusChip status={status} t={t} lang={lang} />}</div>
    </button>
  )
}

type StepState = 'done' | 'warn' | 'stop' | 'prog' | 'todo'

const STAGE_INDEX: Record<RecruitmentStage, number> = {
  prospective: 0, shortlisted: 1, offered: 2, signed: 3, talent_pool: -1, no_show: -1,
}

type StepKey = 'added' | 'shortlisted' | 'offer' | 'jd' | 'contract' | 'onboarding' | 'start'

function journeySteps(candidate: Candidate, s: CandidateSignals, stage: RecruitmentStage, t: Translations, lang: 'en' | 'id') {
  const reached = (target: RecruitmentStage) => STAGE_INDEX[stage] >= STAGE_INDEX[target]
  const steps: { key: StepKey; state: StepState; title: string; sub: string }[] = []
  steps.push({ key: 'added', state: 'done', title: t.recruitStepAdded, sub: candidate.source ? candidateSourceLabel(candidate.source as CandidateSourceOption, t) : '' })
  // The screening profile is the bridge INTO Shortlisted — completing it is what advances
  // prospective → shortlisted — so the onboarding node sits here, before the shortlist node,
  // not sixth (after Offer sent + Contract signed). Data capture starts pre-offer.
  const onbState: StepState = s.onboardingDone >= s.onboardingTotal ? 'done' : (s.onboardingDone > 0 ? 'prog' : 'todo')
  steps.push({ key: 'onboarding', state: onbState, title: t.recruitStepOnboarding, sub: t.recruitStatusOnboarding(s.onboardingDone, s.onboardingTotal) })
  steps.push({ key: 'shortlisted', state: reached('shortlisted') ? 'done' : 'todo', title: t.hiringStageShortlisted, sub: '' })
  // Linking a JD is the prerequisite to sending an offer, so it comes first.
  // Pre-offer it reads as your task (link it); post-offer it tracks the
  // candidate signing it in the portal.
  if (!s.jdLinked) {
    steps.push({ key: 'jd', state: reached('offered') ? 'stop' : 'warn', title: t.recruitStepJd, sub: t.recruitNotLinked })
  } else if (s.jdSigned) {
    steps.push({ key: 'jd', state: 'done', title: t.recruitStepJd, sub: t.recruitJdSigned })
  } else if (reached('offered')) {
    steps.push({ key: 'jd', state: 'prog', title: t.recruitStepJd, sub: t.recruitStatusAwaiting })
  } else {
    steps.push({ key: 'jd', state: 'done', title: t.recruitStepJd, sub: t.recruitJdLinked })
  }
  steps.push({ key: 'offer', state: reached('offered') ? 'done' : 'todo', title: t.recruitStepOfferSent, sub: '' })
  steps.push({ key: 'contract', state: s.contractSigned ? 'done' : (reached('offered') ? 'prog' : 'todo'), title: t.recruitStepContract, sub: s.contractSigned ? t.recruitJdSigned : (reached('offered') ? t.recruitStatusAwaiting : '') })
  if (s.joinDate) {
    steps.push({ key: 'start', state: s.joinDate <= s.today ? 'done' : 'prog', title: t.recruitStepStartDate, sub: formatDate(s.joinDate, lang) })
  } else {
    steps.push({ key: 'start', state: (stage === 'signed' && s.onboardingDone >= s.onboardingTotal) ? 'warn' : 'todo', title: t.recruitStepStartDate, sub: t.recruitNotSet })
  }
  return steps
}

const SECTION_LABEL_KEYS: Record<string, keyof Translations> = {
  personal: 'recruitSectionPersonal',
  identity: 'recruitSectionIdentity',
  bank: 'recruitSectionBank',
  emergency: 'recruitSectionEmergency',
  education: 'recruitSectionEducation',
  experience: 'recruitSectionExperience',
  family: 'recruitSectionFamily',
}

function SectionGrid({ sections, t }: { sections: { key: string; complete: boolean }[]; t: Translations }) {
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
      {sections.map(s => {
        const labelKey = SECTION_LABEL_KEYS[s.key]
        const label = labelKey ? (t[labelKey] as string) : s.key
        return (
          <div key={s.key} className="flex items-center gap-2 text-[11.5px]" style={{ color: s.complete ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)' }}>
            <span
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[9px] font-bold"
              style={s.complete
                ? { backgroundColor: 'var(--color-success)', color: '#04210f' }
                : { border: '1px solid var(--color-border-strong)' }}
            >{s.complete ? '✓' : ''}</span>
            {label}
          </div>
        )
      })}
    </div>
  )
}

// The actor banner at the top of the drawer: a single plain-language line about
// whose court the ball is in, echoing the mockup.
function DrawerBanner({ status, candidate, t, lang }: { status: CandidateStatus; candidate: Candidate; t: Translations; lang: 'en' | 'id' }) {
  const first = candidate.name.split(/\s+/)[0]
  const map: Record<StatusActor, { title: string; tone: 'you' | 'them' | 'sched' | 'ready' } | null> = {
    needs_you: { title: t.recruitBannerNeedsYou, tone: 'you' },
    stuck: { title: t.recruitBannerBlocked, tone: 'you' },
    with_them: { title: t.recruitBannerWaiting(first), tone: 'them' },
    scheduled: { title: t.recruitBannerOnTrack, tone: 'sched' },
    ready: { title: t.recruitBannerReady, tone: 'ready' },
    neutral: null,
  }
  const cfg = map[status.actor]
  if (!cfg) return null
  const toneStyle: Record<'you' | 'them' | 'sched' | 'ready', { bg: string; border: string }> = {
    you: { bg: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', border: 'color-mix(in srgb, var(--color-warning) 40%, transparent)' },
    them: { bg: 'var(--color-bg-tertiary)', border: 'var(--color-border)' },
    sched: { bg: 'color-mix(in srgb, var(--color-primary) 11%, transparent)', border: 'color-mix(in srgb, var(--color-primary) 38%, transparent)' },
    ready: { bg: 'color-mix(in srgb, var(--color-success) 12%, transparent)', border: 'color-mix(in srgb, var(--color-success) 40%, transparent)' },
  }
  const s = toneStyle[cfg.tone]
  return (
    <div className="mb-5 rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed" style={{ backgroundColor: s.bg, borderColor: s.border, color: 'var(--color-text-secondary)' }}>
      <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{cfg.title}.</span>{' '}
      {statusText(status, t, lang)}.
    </div>
  )
}

function DrawerCopyButton({ url, t }: { url: string; t: Translations }) {
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
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ borderColor: 'var(--color-border-strong)', color: copied ? 'var(--color-success)' : 'var(--color-text)' }}
    >
      {copied ? t.hiringPortalLinkCopied : t.hiringActionCopyPortalLink}
    </button>
  )
}

function JourneyStep({ state, title, sub, onClick, isLast, extra, doneColor }: { state: StepState; title: string; sub: string; onClick?: () => void; isLast?: boolean; extra?: React.ReactNode; doneColor?: string }) {
  const cfg: Record<StepState, { bg: string; fg: string; glyph: string }> = {
    done: { bg: 'var(--color-success)', fg: '#04210f', glyph: '✓' },
    warn: { bg: 'var(--color-warning)', fg: '#3a2606', glyph: '!' },
    stop: { bg: 'var(--color-danger)', fg: '#3a0a0a', glyph: '✕' },
    prog: { bg: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', fg: 'var(--color-primary)', glyph: '•' },
    todo: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-tertiary)', glyph: '' },
  }
  const c = cfg[state]
  // A connecting line under the icon — a vertical echo of the path reader up top.
  // Completed spine takes the current stage's colour (matching the top tracker);
  // ahead-of-progress stays a muted line.
  const lineColor = state === 'done' ? (doneColor ?? 'var(--color-success)') : 'var(--color-border-strong)'
  const body = (
    <>
      <div className="flex shrink-0 flex-col items-center self-stretch">
        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.fg }}>{c.glyph}</span>
        {!isLast && <span className="mt-1.5 w-px flex-1" style={{ backgroundColor: lineColor }} />}
      </div>
      <div className="min-w-0 flex-1 pb-7">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>{title}</div>
            {sub && <div className="mt-0.5 text-[11.5px]" style={{ color: state === 'warn' || state === 'stop' ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}>{sub}</div>}
          </div>
          {onClick && (
            <svg className="mt-1 shrink-0 opacity-70" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          )}
        </div>
        {extra}
      </div>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="-mx-2 flex w-full gap-3 rounded-lg px-2 text-left transition-colors hover:bg-[var(--color-bg-tertiary)]">
        {body}
      </button>
    )
  }
  return <div className="flex gap-3">{body}</div>
}

function DrawerMoreMenu({ canNoShow, onMarkNoShow, onDelete }: { canNoShow: boolean; onMarkNoShow: () => void; onDelete: () => void }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
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
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label={t.more}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[60] min-w-[170px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ top: `${pos.top}px`, right: `${pos.right}px`, borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {canNoShow && (
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onMarkNoShow() }} className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text)' }}>
              {t.recruitActionMarkNoShow}
            </button>
          )}
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onDelete() }} className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-danger)' }}>
            {t.delete}
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}

function CandidateDrawer({ candidate, status, signals, canWrite, orgDisplayName, lang, onClose, onChangeStage, onActivateNow, onSetStartDate, onMarkNoShow, onDelete, onViewFullProfile, onLinkJd }: {
  candidate: Candidate
  status: CandidateStatus | null
  signals: CandidateSignals | null
  canWrite: boolean
  orgDisplayName: string
  lang: 'en' | 'id'
  onClose: () => void
  onChangeStage: (next: RecruitmentStage) => void
  onActivateNow: () => void
  onSetStartDate: (date: string | null) => void
  onMarkNoShow: () => void
  onDelete: () => void
  onViewFullProfile: () => void
  onLinkJd: () => void
}) {
  const { t } = useLang()
  const stage = candidate.lifecycle_stage as RecruitmentStage
  const gradient = getAvatarGradient(candidate.id)
  const initials = candidate.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')
  const portalUrl = `${window.location.origin}/portal/${candidate.slug}-${candidate.access_token}`
  const phoneDigits = candidate.phone?.replace(/[^0-9]/g, '') ?? ''
  const whatsappShareUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(t.hiringWhatsAppShareMessage(candidate.name, orgDisplayName || '—', portalUrl))}`
    : null
  const isSigned = stage === 'signed'
  const hasDate = !!candidate.join_date
  const canNoShow = stage === 'prospective' || stage === 'shortlisted' || stage === 'offered'
  // One contextual primary action — the single most useful next move for this stage.
  const primary: { label: string; onClick: () => void } | null = !canWrite ? null
    : stage === 'prospective' ? { label: t.hiringActionShortlist, onClick: () => onChangeStage('shortlisted') }
    : stage === 'shortlisted' ? { label: t.hiringActionMakeOffer, onClick: () => onChangeStage('offered') }
    : (isSigned && hasDate) ? { label: t.recruitActionActivateNow, onClick: onActivateNow }
    : null
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [focusDateNonce, setFocusDateNonce] = useState(0)

  // Which journey steps are click-to-resolve, and what tapping one does. The
  // start-date case bumps a nonce rather than touching the ref here, so the ref
  // is only read in the effect below (never on the render path).
  function stepAction(key: StepKey, state: StepState): (() => void) | null {
    if (!canWrite) return null
    switch (key) {
      case 'shortlisted': return stage === 'prospective' ? () => onChangeStage('shortlisted') : null
      case 'offer': return (stage === 'prospective' || stage === 'shortlisted') ? () => onChangeStage('offered') : null
      case 'jd': return (state === 'warn' || state === 'stop') ? onLinkJd : null
      case 'start': return (isSigned && state !== 'done') ? () => setFocusDateNonce(n => n + 1) : null
      default: return null
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (focusDateNonce > 0) dateInputRef.current?.focus()
  }, [focusDateNonce])

  const steps = signals ? journeySteps(candidate, signals, stage, t, lang) : []
  const progressColor = stageColor(candidate.lifecycle_stage as LifecycleStage)

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col overflow-y-auto border-l p-5"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="mb-4 flex items-start gap-3">
          {candidate.photo_url
            ? <img src={candidate.photo_url} alt="" className="h-11 w-11 rounded-lg object-cover" />
            : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white" style={{ background: gradient }}>{initials || '?'}</div>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{candidate.name}</div>
            <div className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {candidate.job_position || '—'}{candidate.source ? ` · ${candidateSourceLabel(candidate.source as CandidateSourceOption, t)}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={onViewFullProfile} className="rounded-md px-2 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-primary)' }}>
              {t.hiringActionViewFullProfile}
            </button>
            {canWrite && <DrawerMoreMenu canNoShow={canNoShow} onMarkNoShow={onMarkNoShow} onDelete={onDelete} />}
            <button type="button" onClick={onClose} aria-label={t.cancel} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="mb-6 mt-2"><PathTracker stage={candidate.lifecycle_stage as LifecycleStage} size="lg" imminent={status?.kind === 'starts_on' || status?.kind === 'ready_today'} /></div>

        {status && <DrawerBanner status={status} candidate={candidate} t={t} lang={lang} />}

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.recruitDrawerJourney}</div>
        <div className="mb-5 flex flex-col">
          {steps.map((step, i) => (
            <JourneyStep
              key={step.key}
              state={step.state}
              title={step.title}
              sub={step.sub}
              onClick={stepAction(step.key, step.state) ?? undefined}
              isLast={i === steps.length - 1}
              doneColor={progressColor}
              extra={step.key === 'onboarding' && signals?.sections && signals.sections.length > 0
                ? <SectionGrid sections={signals.sections} t={t} />
                : undefined}
            />
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-2.5 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
          {isSigned && canWrite && (
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: hasDate ? 'var(--color-border)' : 'color-mix(in srgb, var(--color-warning) 40%, transparent)', color: 'var(--color-text-secondary)' }}>
              {t.recruitStepStartDate}
              <input
                ref={dateInputRef}
                type="date"
                value={candidate.join_date ?? ''}
                onChange={e => onSetStartDate(e.target.value || null)}
                className="ml-auto rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </label>
          )}

          {canWrite && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringColStage}</span>
              <StagePicker stage={stage} label={stageLabelMap(t)[stage] ?? stage} disabled={!canWrite} onChange={onChangeStage} />
            </div>
          )}

          {primary && (
            <button type="button" onClick={primary.onClick} className="flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: 'var(--color-primary)' }}>
              {primary.label}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
          )}

          <div className="flex gap-2">
            {whatsappShareUrl && (
              <a href={whatsappShareUrl} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text)' }}>
                <WhatsAppIcon size={14} /> {t.hiringActionWhatsApp}
              </a>
            )}
            <DrawerCopyButton url={portalUrl} t={t} />
          </div>
        </div>
      </aside>
    </>,
    document.body,
  )
}

