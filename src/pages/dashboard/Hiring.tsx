import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { normalizePhone, isValidE164 } from '../../lib/phone'
import { generateUniqueSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { setEmployeePrimaryDepartment, type DepartmentOption } from '../../lib/departments'
import { primaryDept, type EmpDeptShape } from '../../lib/employee'
import { findTemplateForPosition, buildContractFromTemplate } from '../../lib/contractTemplates'
import { documentEditPath, documentsIndexPath } from '../../lib/documentTypes'
import { docAsJson, emptyDocumentDoc } from '../../lib/documentDoc'
import { advanceSignedToActiveForOrg } from '../../lib/lifecycleAdvance'
import { PhoneInput } from '../../components/PhoneInput'
import { FilterSearchInput, MultiSelectDropdown } from '../../components/FilterControls'
import type { Employee, Organization, User } from '../../types/aliases'
import type { Translations } from '../../lib/translations'

type HiringStage = 'prospective' | 'shortlisted' | 'offered' | 'signed' | 'talent_pool'
type HiringTab = 'all' | HiringStage
type Candidate = Employee & EmpDeptShape

const HIRING_STAGES: HiringStage[] = ['prospective', 'shortlisted', 'offered', 'signed', 'talent_pool']
const MAX_PHOTO_SIZE = 2 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const CANDIDATE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

export function Hiring({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [jobPositions, setJobPositions] = useState<string[]>([])
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<HiringTab>('all')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<HiringStage[]>([])
  const [modalCandidate, setModalCandidate] = useState<Candidate | null>(null)
  const [makeOfferCandidate, setMakeOfferCandidate] = useState<Employee | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    setLoading(true)
    // Graduate any 'signed' candidates whose start date has arrived before
    // we read — keeps the Hiring page consistent with reality.
    await advanceSignedToActiveForOrg(user.org_id)
    const [empResult, orgResult, refResult, departmentsResult] = await Promise.all([
      supabase.from('employees')
        .select(CANDIDATE_WITH_DEPTS_SELECT)
        .eq('org_id', user.org_id)
        .in('lifecycle_stage', HIRING_STAGES)
        .order('created_at', { ascending: false }),
      supabase.from('organizations').select('*').eq('id', user.org_id).single(),
      supabase.from('company_reference_values')
        .select('*')
        .eq('org_id', user.org_id)
        .order('display_order')
        .order('name'),
      supabase.from('company_departments')
        .select('id, name')
        .eq('org_id', user.org_id)
        .order('display_order')
        .order('name'),
    ])
    setCandidates((empResult.data || []) as Candidate[])
    setOrg(orgResult.data || null)
    if (refResult.data) {
      const buckets = bucketReferenceValues(refResult.data)
      setJobPositions(referenceNames(buckets.job_position))
    }
    if (departmentsResult.data) {
      setAvailableDepartments(departmentsResult.data)
    }
    setLoading(false)
  }

  const counts = useMemo(() => {
    const out: Record<'all' | HiringStage, number> = { all: candidates.length, prospective: 0, shortlisted: 0, offered: 0, signed: 0, talent_pool: 0 }
    for (const c of candidates) {
      const stage = c.lifecycle_stage as HiringStage
      if (stage in out) out[stage]++
    }
    return out
  }, [candidates])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filterSet = new Set(stageFilter)
    return candidates.filter(c => {
      if (tab !== 'all' && c.lifecycle_stage !== tab) return false
      if (filterSet.size > 0 && !filterSet.has(c.lifecycle_stage as HiringStage)) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.job_position || '').toLowerCase().includes(q)
      )
    })
  }, [candidates, tab, stageFilter, search])

  const stageLabels = stageLabelMap(t)

  async function changeStage(candidate: Employee, nextStage: HiringStage) {
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

  async function deleteCandidate(candidate: Employee) {
    if (!confirm(t.hiringDeleteConfirm(candidate.name))) return
    const { error } = await supabase.from('employees').delete().eq('id', candidate.id)
    if (error) {
      alert(error.message)
      return
    }
    await loadData()
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.hiringTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.hiringSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          disabled={!canWrite}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.hiringAddCandidate}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <TabButton active={tab === 'all'} onClick={() => setTab('all')} label={t.hiringTabAll} count={counts.all} />
        <TabButton active={tab === 'prospective'} onClick={() => setTab('prospective')} label={t.hiringTabProspective} count={counts.prospective} />
        <TabButton active={tab === 'shortlisted'} onClick={() => setTab('shortlisted')} label={t.hiringTabShortlisted} count={counts.shortlisted} />
        <TabButton active={tab === 'offered'} onClick={() => setTab('offered')} label={t.hiringTabOffered} count={counts.offered} />
        <TabButton active={tab === 'signed'} onClick={() => setTab('signed')} label={t.hiringTabSigned} count={counts.signed} />
        <TabButton active={tab === 'talent_pool'} onClick={() => setTab('talent_pool')} label={t.hiringTabTalentPool} count={counts.talent_pool} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 max-w-md flex-1">
          <FilterSearchInput value={search} onChange={setSearch} placeholder={t.hiringSearchPlaceholder} />
        </div>
        <MultiSelectDropdown
          label={t.hiringFilterStagesLabel}
          value={stageFilter}
          onChange={next => setStageFilter(next as HiringStage[])}
          options={HIRING_STAGES.map(s => ({ id: s, label: stageLabels[s], count: counts[s] }))}
        />
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
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
                <th className="px-4 py-2.5">{t.hiringColPosition}</th>
                <th className="px-4 py-2.5">{t.hiringFieldPhone}</th>
                <th className="px-4 py-2.5">{t.hiringColStage}</th>
                <th className="px-4 py-2.5">{t.hiringColAdded}</th>
                <th className="px-4 py-2.5 text-right">{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  stageLabel={stageLabels[c.lifecycle_stage as HiringStage] ?? c.lifecycle_stage}
                  lang={lang}
                  canWrite={canWrite}
                  onOpen={() => setModalCandidate(c)}
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
          onManageTemplates={() => { setMakeOfferCandidate(null); navigate(documentsIndexPath('contract')) }}
        />
      )}

      {(showAdd || modalCandidate) && (
        <CandidateModal
          mode={modalCandidate ? 'edit' : 'create'}
          candidate={modalCandidate}
          orgCountryCode={org?.default_country_code || '+62'}
          orgId={user.org_id}
          jobPositions={jobPositions}
          availableDepartments={availableDepartments}
          onAvailableDepartmentsChange={setAvailableDepartments}
          onClose={() => { setShowAdd(false); setModalCandidate(null) }}
          onSaved={async () => { setShowAdd(false); setModalCandidate(null); await loadData() }}
          onManageReferences={() => {
            setShowAdd(false)
            setModalCandidate(null)
            navigate('/dashboard/company?tab=structure')
          }}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      <span>{label}</span>
      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{count}</span>
      {active && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />}
    </button>
  )
}

function CandidateRow({ candidate, stageLabel, lang, canWrite, onOpen, onChangeStage, onDelete, onViewFullProfile }: {
  candidate: Employee
  stageLabel: string
  lang: 'en' | 'id'
  canWrite: boolean
  onOpen: () => void
  onChangeStage: (next: HiringStage) => void
  onDelete: () => void
  onViewFullProfile: () => void
}) {
  const { t } = useLang()
  const gradient = getAvatarGradient(candidate.id)
  const initials = candidate.name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')
  const stage = candidate.lifecycle_stage as HiringStage
  const whatsappUrl = candidate.phone ? `https://wa.me/${candidate.phone.replace(/[^0-9]/g, '')}` : null

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
          <span className="font-medium" style={{ color: 'var(--color-text)' }}>{candidate.name}</span>
        </div>
      </td>
      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{candidate.job_position || em()}</td>
      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{candidate.phone || em()}</td>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        <StagePicker
          stage={stage}
          label={stageLabel}
          disabled={!canWrite}
          onChange={onChangeStage}
        />
      </td>
      <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(candidate.created_at, lang)}</td>
      <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t.hiringActionWhatsApp}
              aria-label={t.hiringActionWhatsApp}
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

function RowActionsMenu({ stage, disabled, onEdit, onChangeStage, onDelete, onViewFullProfile }: {
  stage: HiringStage
  disabled: boolean
  onEdit: () => void
  onChangeStage: (next: HiringStage) => void
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
  stage: HiringStage
  label: string
  disabled: boolean
  onChange: (next: HiringStage) => void
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
          {HIRING_STAGES.map(s => {
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

const STAGE_TONES: Record<HiringStage, { bg: string; text: string; dot: string }> = {
  prospective: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 14%, transparent)', text: 'var(--color-text-secondary)', dot: 'var(--color-text-tertiary)' },
  shortlisted: { bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)', text: 'var(--color-warning)', dot: 'var(--color-warning)' },
  offered: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', text: 'var(--color-primary)', dot: 'var(--color-primary)' },
  signed: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', text: 'var(--color-success)', dot: 'var(--color-success)' },
  talent_pool: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 10%, transparent)', text: 'var(--color-text-tertiary)', dot: 'var(--color-text-tertiary)' },
}

function stageLabelMap(t: Translations): Record<HiringStage, string> {
  return {
    prospective: t.hiringStageProspective,
    shortlisted: t.hiringStageShortlisted,
    offered: t.hiringStageOffered,
    signed: t.hiringStageSigned,
    talent_pool: t.hiringStageTalentPool,
  }
}

function formatDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

// ───── Modal (create + edit) ──────────────────────────────────────────────

type ModalMode = 'create' | 'edit'

function CandidateModal({ mode, candidate, orgCountryCode, orgId, jobPositions, availableDepartments, onAvailableDepartmentsChange, onClose, onSaved, onManageReferences }: {
  mode: ModalMode
  candidate: Candidate | null
  orgCountryCode: string
  orgId: string
  jobPositions: string[]
  availableDepartments: DepartmentOption[]
  onAvailableDepartmentsChange: (next: DepartmentOption[]) => void
  onClose: () => void
  onSaved: () => void
  onManageReferences: () => void
}) {
  const { t } = useLang()
  const [name, setName] = useState(candidate?.name || '')
  const [phone, setPhone] = useState(candidate?.phone || '')
  const [position, setPosition] = useState(candidate?.job_position || '')
  const initialDepartment = candidate ? (primaryDept(candidate) ?? '') : ''
  const [department, setDepartment] = useState(initialDepartment)
  const [notes, setNotes] = useState(candidate?.notes || '')
  const [photoUrl, setPhotoUrl] = useState<string | null>(candidate?.photo_url || null)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const phoneNormalized = normalizePhone(phone, orgCountryCode)
  const phoneValid = !phone || isValidE164(phoneNormalized)
  const canSubmit = name.trim().length > 0 && phoneValid && !saving
  const positionsEmpty = jobPositions.length === 0
  const departmentsEmpty = availableDepartments.length === 0
  const departmentNames = useMemo(() => availableDepartments.map(d => d.name), [availableDepartments])

  useEffect(() => () => {
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview)
  }, [pendingPhotoPreview])

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError(t.avatarInvalidType)
      return
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setError(t.avatarTooLarge)
      return
    }
    setError('')

    if (mode === 'edit' && candidate) {
      // Edit mode: upload immediately and persist to the row.
      setSaving(true)
      const url = await uploadPhoto(candidate.id, file)
      if (!url) {
        setSaving(false)
        setError(t.hiringPhotoUploadError)
        return
      }
      const { error: updateError } = await supabase.from('employees').update({ photo_url: url }).eq('id', candidate.id)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      setPhotoUrl(url)
    } else {
      // Create mode: hold the file until the row exists.
      if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview)
      setPendingPhoto(file)
      setPendingPhotoPreview(URL.createObjectURL(file))
    }
  }

  async function handlePhotoRemove() {
    if (mode === 'edit' && candidate && photoUrl) {
      setSaving(true)
      const match = photoUrl.match(/\/avatars\/([^?]+)/)
      if (match) await supabase.storage.from('avatars').remove([match[1]])
      const { error: updateError } = await supabase.from('employees').update({ photo_url: null }).eq('id', candidate.id)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      setPhotoUrl(null)
    } else {
      if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview)
      setPendingPhoto(null)
      setPendingPhotoPreview(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError('')

    const payload = {
      name: name.trim(),
      phone: phoneNormalized || '',
      job_position: position || null,
      notes: notes.trim() || null,
    }

    let candidateId: string
    if (mode === 'edit' && candidate) {
      const { error: updateError } = await supabase.from('employees').update(payload).eq('id', candidate.id)
      if (updateError) {
        setSaving(false)
        setError(updateError.message || t.hiringSaveError)
        return
      }
      candidateId = candidate.id
    } else {
      const slug = generateUniqueSlug(name.trim())
      const token = generateAccessToken()
      const { data: newCandidate, error: insertError } = await supabase
        .from('employees')
        .insert({ ...payload, org_id: orgId, slug, access_token: token, lifecycle_stage: 'prospective' })
        .select()
        .single()

      if (insertError || !newCandidate) {
        setSaving(false)
        setError(insertError?.message || t.hiringCreateError)
        return
      }
      candidateId = newCandidate.id

      if (pendingPhoto) {
        const url = await uploadPhoto(newCandidate.id, pendingPhoto)
        if (url) {
          await supabase.from('employees').update({ photo_url: url }).eq('id', newCandidate.id)
        }
      }
    }

    // Department assignment lives in employee_departments; sync it after the
    // employee row exists. Only write when the value has changed.
    if (department.trim() !== initialDepartment) {
      const result = await setEmployeePrimaryDepartment({
        employeeId: candidateId,
        orgId,
        name: department.trim() || null,
        available: availableDepartments,
      })
      if (result.error) {
        setSaving(false)
        setError(result.error)
        return
      }
      if (result.created) {
        onAvailableDepartmentsChange(
          [...availableDepartments, result.created].sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
    }

    setSaving(false)
    onSaved()
  }

  const displayPhoto = pendingPhotoPreview || photoUrl
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?'
  const gradientSeed = candidate?.id || name || 'new'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto rounded-lg border p-5 shadow-xl"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', maxHeight: 'calc(100vh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {mode === 'edit' ? t.hiringEditCandidateTitle : t.hiringAddCandidateTitle}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t.hiringPhotoLabel} help={mode === 'create' && !pendingPhoto ? t.hiringPhotoCreateHint : undefined}>
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white"
                style={{ background: displayPhoto ? 'var(--color-bg-tertiary)' : getAvatarGradient(gradientSeed) }}
              >
                {displayPhoto ? <img src={displayPhoto} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="flex items-center gap-2">
                <label
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors ${saving ? 'pointer-events-none opacity-50' : 'hover:bg-[var(--color-bg-tertiary)]'}`}
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {displayPhoto ? t.hiringPhotoChange : t.hiringPhotoUpload}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} disabled={saving} className="hidden" />
                </label>
                {displayPhoto && (
                  <button
                    type="button"
                    onClick={handlePhotoRemove}
                    disabled={saving}
                    className="text-xs"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    {t.hiringPhotoRemove}
                  </button>
                )}
              </div>
            </div>
          </Field>

          <Field label={t.hiringFieldName} required>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.hiringFieldPhone}>
            <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={orgCountryCode} />
          </Field>
          <Field
            label={t.hiringFieldPosition}
            action={<ManageButton label={t.hiringFieldManage} onClick={onManageReferences} />}
          >
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              disabled={positionsEmpty}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{positionsEmpty ? t.hiringPositionEmpty : t.hiringFieldPositionPlaceholder}</option>
              {jobPositions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field
            label={t.hiringFieldDepartments}
            help={t.hiringFieldDepartmentsHelp}
            action={<ManageButton label={t.hiringFieldManage} onClick={onManageReferences} />}
          >
            <select
              value={department}
              onChange={e => setDepartment(e.target.value)}
              disabled={departmentsEmpty}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{departmentsEmpty ? t.hiringDepartmentEmpty : t.hiringFieldDepartmentPlaceholder}</option>
              {departmentNames.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label={t.hiringFieldNotes}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={t.hiringFieldNotesPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {t.cancel}
            </button>
            <button type="submit" disabled={!canSubmit} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {saving ? t.saving : mode === 'edit' ? t.save : t.add}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
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

async function uploadPhoto(employeeId: string, file: File): Promise<string | null> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${employeeId}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) return null
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${publicUrl}?t=${Date.now()}`
}

function Field({ label, required, help, action, children }: { label: string; required?: boolean; help?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
        </label>
        {action}
      </div>
      {children}
      {help && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{help}</p>}
    </div>
  )
}

function ManageButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
      style={{ color: 'var(--color-primary)' }}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </button>
  )
}
