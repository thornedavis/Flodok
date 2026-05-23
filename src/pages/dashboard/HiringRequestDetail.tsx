// Read-only detail view of a hiring request with role-gated approval actions.
//
// Visibility is enforced server-side by the table's RLS policies — by the
// time we render here, the row was already approved for read by Supabase.
// The action buttons we expose are an additional UI gate to avoid presenting
// a button that would just get rejected by the RPC.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PickJdTemplateModal } from './JobDescriptions'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { useRole } from '../../hooks/useRole'
import {
  emitHiringRequestEvent,
  managerDecideHiringRequest, ownerDecideHiringRequest,
  pendingApprover, statusTone, submitHiringRequest, isTerminalStatus,
  type AllowanceOption, type CandidateSource, type EmploymentType, type FundSource, type HiringEventKind, type RequestCategory, type RequestStatus,
} from '../../lib/hiringRequests'
import { trashHiringRequest } from '../../lib/trash'
import type { Translations } from '../../lib/translations'
import type { User, HiringRequest } from '../../types/aliases'

type DetailRow = HiringRequest & {
  department: { id: string; name: string } | null
  requester: { id: string; name: string | null } | null
  replacing_employee: { id: string; name: string } | null
  manager_decider: { id: string; name: string | null } | null
  owner_decider: { id: string; name: string | null } | null
  actioned_user: { id: string; name: string | null } | null
  candidate_employee: { id: string; name: string } | null
}

const DETAIL_SELECT = `
  *,
  department:company_departments!hiring_requests_department_id_fkey(id, name),
  requester:users!hiring_requests_hiring_manager_id_fkey(id, name),
  replacing_employee:employees!hiring_requests_replacing_employee_id_fkey(id, name),
  manager_decider:users!hiring_requests_manager_decided_by_fkey(id, name),
  owner_decider:users!hiring_requests_owner_decided_by_fkey(id, name),
  actioned_user:users!hiring_requests_actioned_by_fkey(id, name),
  candidate_employee:employees!hiring_requests_candidate_employee_id_fkey(id, name)
`

type DecisionMode = { kind: 'approve' | 'reject' } | null

export function HiringRequestDetail({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const { id } = useParams<{ id: string }>()
  const role = useRole(user)

  const [row, setRow] = useState<DetailRow | null>(null)
  const [iManageThisDept, setIManageThisDept] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Holds the client-side validation message when the user tries to submit
  // a draft that's missing required fields. Surfaced as a banner with an
  // "Open editor to fix" CTA, so the user is never bounced to the RPC just
  // to learn what's missing. Cleared on successful submit or dismiss.
  const [submitBlocker, setSubmitBlocker] = useState<string | null>(null)
  const [showJdTemplatePicker, setShowJdTemplatePicker] = useState(false)
  const [decision, setDecision] = useState<DecisionMode>(null)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)

  useBreadcrumbTrailing(row?.position_name ?? null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('hiring_requests')
        .select(DETAIL_SELECT)
        .eq('id', id!)
        .single()
      if (cancelled) return
      if (error || !data) {
        setError(error?.message ?? t.hiringRequestsNotFound)
        setLoading(false)
        return
      }
      setRow(data as DetailRow)
      // Need to know whether the caller manages this specific department to
      // gate the manager-step action buttons. The list page does this with a
      // batched query; here we only care about one department.
      if (user.employee_id) {
        const r = data as DetailRow
        if (r.department && user.employee_id) {
          const { data: deptCheck } = await supabase
            .from('company_departments')
            .select('id')
            .eq('id', r.department.id)
            .eq('manager_employee_id', user.employee_id)
            .maybeSingle()
          if (!cancelled) setIManageThisDept(!!deptCheck)
        }
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id, user.employee_id, t.hiringRequestsNotFound])

  async function reload() {
    if (!id) return
    const { data } = await supabase
      .from('hiring_requests')
      .select(DETAIL_SELECT)
      .eq('id', id)
      .single()
    if (data) setRow(data as DetailRow)
  }

  function openDecision(kind: 'approve' | 'reject') {
    setDecision({ kind })
    setNote('')
    setError('')
  }

  function cancelDecision() {
    setDecision(null)
    setNote('')
  }

  async function confirmDecision() {
    if (!row || !decision) return
    setWorking(true)
    setError('')
    const approve = decision.kind === 'approve'
    const trimmed = note.trim() || null
    try {
      const pending = pendingApprover(row.status as RequestStatus)
      let updated: HiringRequest | null = null
      let kind: HiringEventKind | null = null
      if (pending === 'manager') {
        updated = await managerDecideHiringRequest(row.id, approve, trimmed)
        kind = approve ? 'manager_approved' : 'manager_rejected'
      } else if (pending === 'owner') {
        updated = await ownerDecideHiringRequest(row.id, approve, trimmed)
        // Owner approval is the final approval — use 'approved' so the feed
        // reads as the request now being green-lit; rejection uses
        // 'owner_rejected' so it's distinguishable from a manager-level reject.
        kind = approve ? 'approved' : 'owner_rejected'
      }
      if (updated && kind) {
        const deciderName = user.name ?? null
        const verbBase = approve ? 'Approved' : 'Rejected'
        const verb = kind === 'manager_approved' || kind === 'manager_rejected'
          ? `${verbBase} by manager`
          : `${verbBase} by owner`
        const description = [
          deciderName ? `${verb} (${deciderName})` : verb,
          trimmed ? `— ${trimmed}` : null,
        ].filter(Boolean).join(' ')
        await emitHiringRequestEvent({
          orgId: user.org_id,
          kind,
          request: updated,
          positionName: row.position_name,
          description: description || null,
        })
      }
      setDecision(null)
      setNote('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function handleDeleteDraft() {
    if (!row) return
    if (!confirm(t.hiringRequestsDeleteDraftConfirm)) return
    setWorking(true)
    try {
      await trashHiringRequest(row.id)
      navigate('/dashboard/hiring')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  async function handleSubmit() {
    if (!row || working) return
    // Pre-flight: same checks the form's Submit button runs, but against
    // the saved row (since the detail surface is read-only). If anything's
    // missing, surface a one-click "Open editor" banner instead of round-
    // tripping to the RPC just to learn the same thing. The server-side
    // check in submit_hiring_request stays as the source-of-truth backstop.
    const missing = validateForSubmit(row, t)
    if (missing) { setSubmitBlocker(missing); return }
    if (!confirm(t.hiringRequestsSubmitConfirm)) return
    setSubmitBlocker(null)
    setWorking(true)
    setError('')
    try {
      await submitHiringRequest(row.id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  // Who can do what on this row, given the caller's role/relationship and
  // the row's current state. Derived once; the JSX just renders from it.
  const capability = useMemo(() => {
    if (!row) return {
      canEditDraft: false, canDeleteDraft: false, canSubmitDraft: false,
      canManagerDecide: false, canOwnerDecide: false,
      canDraftJd: false,
    }
    const isRequester = row.hiring_manager_id === user.id
    const status = row.status as RequestStatus
    return {
      canEditDraft: isRequester && status === 'draft',
      canDeleteDraft: isRequester && status === 'draft',
      // Same gate as Edit/Delete — only the requester moves their draft
      // forward. The submit RPC validates required fields server-side, so
      // we don't gate on client-side validation here.
      canSubmitDraft: isRequester && status === 'draft',
      // Manager step is open: caller manages this dept, status is awaiting
      // manager, and caller is not the requester (server blocks self-approval
      // too — this gate is just to hide a button that would error).
      canManagerDecide: iManageThisDept && status === 'submitted' && !isRequester,
      canOwnerDecide: role.isOwner && status === 'manager_approved',
      // HR/admin/owner can draft a JD from any approved request. The button
      // disappears once a JD has actually been drafted (we don't currently
      // track the back-link from request → JD; revisit when D2 lands).
      canDraftJd: role.canManagePeople && status === 'approved',
    }
  }, [row, iManageThisDept, role.isOwner, role.canManagePeople, user.id])

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  }
  if (!row) {
    return (
      <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
        {t.hiringRequestsNotFound}
      </div>
    )
  }

  const status = row.status as RequestStatus
  const writeDisabledTitle = !canWrite ? t.dunningWriteBlocked : undefined

  return (
    <div className="hiring-print-doc max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Eyebrow + status pill ride a single line so the form reads as a
              titled document ("HIRING REQUEST — Draft") on screen and in
              print. The position name sits below as the document title. */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.hiringRequestsDetailEyebrow}
            </span>
            <StatusBadge status={status} t={t} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{row.position_name}</h1>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {/* Always-available escape hatch back to the list. The breadcrumb
              also links there, but a button in the header chrome reads as
              the more obvious "I'm done looking, take me back" affordance —
              matches what Cancel does on the edit pages. */}
          <button
            type="button"
            onClick={() => navigate('/dashboard/hiring')}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.cancel}
          </button>
          {/* Browser-native print — relies on the @media print stylesheet in
              index.css (hides .no-print, white bg, black text) plus the
              section-card styling which already reads as a printable form. */}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.hiringRequestsActionPrint}
          </button>
          {capability.canEditDraft && (
            <button
              onClick={() => navigate(`/dashboard/hiring/${row.id}/edit`)}
              disabled={!canWrite}
              title={writeDisabledTitle}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.hiringRequestsActionEditDraft}
            </button>
          )}
          {capability.canDeleteDraft && (
            <button
              onClick={handleDeleteDraft}
              disabled={working || !canWrite}
              title={writeDisabledTitle}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
            >
              {t.hiringRequestsActionDeleteDraft}
            </button>
          )}
          {capability.canSubmitDraft && (
            <button
              onClick={handleSubmit}
              disabled={working || !canWrite}
              title={writeDisabledTitle}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t.hiringRequestsActionSubmit}
            </button>
          )}
          {capability.canDraftJd && (
            <DraftJdDropdown
              onDraftNew={() => navigate(`/dashboard/hiring/jds/new?from_request=${row.id}`)}
              onPickTemplate={() => setShowJdTemplatePicker(true)}
              disabled={!canWrite}
              title={writeDisabledTitle}
              t={t}
            />
          )}
          {(capability.canManagerDecide || capability.canOwnerDecide) && !decision && (
            <>
              <button
                onClick={() => openDecision('reject')}
                disabled={!canWrite}
                title={writeDisabledTitle}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
              >
                {t.hiringRequestsActionReject}
              </button>
              <button
                onClick={() => openDecision('approve')}
                disabled={!canWrite}
                title={writeDisabledTitle}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t.hiringRequestsActionApprove}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {submitBlocker && row && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-warning)', backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)' }}
        >
          <span>{submitBlocker}</span>
          <button
            type="button"
            onClick={() => navigate(`/dashboard/hiring/${row.id}/edit`)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium"
            style={{ backgroundColor: 'var(--color-warning)', color: 'var(--color-bg)' }}
          >
            {t.hiringRequestsSubmitBlockerCta}
          </button>
        </div>
      )}

      {decision && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {decision.kind === 'approve' ? t.hiringRequestsApprovingTitle : t.hiringRequestsRejectingTitle}
          </h2>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t.hiringRequestsDecisionNotePlaceholder}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={cancelDecision}
              disabled={working}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.cancel}
            </button>
            <button
              onClick={confirmDecision}
              disabled={working}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: decision.kind === 'approve' ? 'var(--color-primary)' : 'var(--color-danger)',
              }}
            >
              {decision.kind === 'approve' ? t.hiringRequestsActionConfirmApprove : t.hiringRequestsActionConfirmReject}
            </button>
          </div>
        </div>
      )}

      {/* Requester section — top of the form, mirrors the paper template's
          REQUESTER block. Replaces the inline "Marketing · Submitted by X"
          subtitle so this info reads as a structured part of the document
          (and prints alongside the rest of the form, not as page chrome). */}
      <Section title={t.hiringRequestsDetailSectionRequester}>
        <Row label={t.hiringRequestsDetailDateOfRequest} value={formatDate(row.created_at, lang) || '—'} />
        <Row label={t.hiringRequestsDetailHiringManager} value={row.requester?.name ?? '—'} />
        <Row label={t.hiringRequestsDetailDepartment} value={row.department?.name ?? '—'} />
      </Section>

      <Section title={t.hiringRequestsDetailSectionPosition}>
        <Row label={t.hiringRequestsFieldEmploymentType} value={employmentTypeLabel(row.employment_type as EmploymentType, t)} />
        <Row label={t.hiringRequestsFieldCategory} value={categoryLabel(row.category as RequestCategory, t)} />
        {row.category === 'replacement' && (
          <Row label={t.hiringRequestsDetailReplacing} value={row.replacing_employee?.name ?? '—'} />
        )}
        <Row label={t.hiringRequestsFieldSource} value={sourceLabel(row.source_of_candidate as CandidateSource, t)} />
        <Row label={t.hiringRequestsDetailExpectedDate} value={formatDate(row.expected_hiring_date, lang) || '—'} />
        <MultilineRow
          label={t.hiringRequestsFieldQualifications}
          value={row.required_qualifications_md}
          empty={t.hiringRequestsDetailNoQualifications}
        />
        <MultilineRow
          label={t.hiringRequestsFieldReason}
          value={row.supporting_reason}
          empty={t.hiringRequestsDetailNoReason}
        />
      </Section>

      <Section title={t.hiringRequestsDetailSectionRemuneration}>
        <Row label={t.hiringRequestsFieldFund} value={fundLabel(row.source_of_fund as FundSource, t)} />
        {row.source_of_fund === 'non_budgeted' && row.source_of_fund_justification && (
          <MultilineRow
            label={t.hiringRequestsFieldFundJustification}
            value={row.source_of_fund_justification}
            empty={t.hiringRequestsDetailNoReason}
          />
        )}
        <Row
          label={t.hiringRequestsDetailSalaryRange}
          value={formatSalaryRange(row.base_salary_min, row.base_salary_max, t) || t.hiringRequestsDetailNoSalary}
        />
        <Row
          label={t.hiringRequestsFieldAllowances}
          value={
            row.allowances.length === 0
              ? t.hiringRequestsDetailNoAllowances
              : row.allowances.map(a => allowanceLabel(a as AllowanceOption, t)).join(', ')
          }
        />
        {row.allowances.includes('other') && row.allowance_other && (
          <Row label={t.hiringRequestsFieldAllowanceOther} value={row.allowance_other} />
        )}
        <MultilineRow
          label={t.hiringRequestsFieldOtherBenefits}
          value={row.other_benefits ?? ''}
          empty={t.hiringRequestsDetailNoOtherBenefits}
        />
      </Section>

      <Workflow row={row} t={t} lang={lang} />

      {showJdTemplatePicker && (
        <PickJdTemplateModal
          orgId={user.org_id}
          t={t}
          onClose={() => setShowJdTemplatePicker(false)}
          onPick={tplId => {
            setShowJdTemplatePicker(false)
            // Carry both signals into the JD editor so it hydrates from
            // the template AND layers the request's data on top.
            navigate(`/dashboard/hiring/jds/new?from_request=${row.id}&template=${tplId}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Draft JD dropdown ─────────────────────────────────────────────────
//
// Tiny inline dropdown — primary button label is the "common case" (Draft
// new, since that's what HR does for most one-off roles), and the chevron
// reveals the "Use template" path when the org has standard templates.

function DraftJdDropdown({ onDraftNew, onPickTemplate, disabled, title, t }: {
  onDraftNew: () => void
  onPickTemplate: () => void
  disabled: boolean
  title: string | undefined
  t: Translations
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={onDraftNew}
        disabled={disabled}
        title={title}
        className="rounded-l-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        {t.jdDraftActionLabel}
      </button>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.jdDraftActionOptions}
        className="rounded-r-lg border-l border-white/20 px-2 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onDraftNew() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: 'var(--color-text)' }}
          >
            {t.jdDraftActionLabel}
          </button>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onPickTemplate() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: 'var(--color-text)' }}
          >
            {t.jdDraftActionFromTemplate}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Workflow timeline ─────────────────────────────────────────────────

function Workflow({ row, t, lang }: { row: DetailRow; t: Translations; lang: 'en' | 'id' }) {
  const status = row.status as RequestStatus

  const submittedStep = (
    <Step
      title={t.hiringRequestsDetailSubmittedAt}
      complete={!!row.submitted_at}
      detail={
        row.submitted_at ? (
          <span>
            {row.requester?.name ?? '—'} · {formatDateTime(row.submitted_at, lang)}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailNotSubmitted}</span>
        )
      }
    />
  )

  const managerStep = (() => {
    if (row.manager_decision) {
      return (
        <Step
          title={t.hiringRequestsDetailStepManager}
          complete
          tone={row.manager_decision === 'approved' ? 'success' : 'danger'}
          detail={
            <div className="space-y-1">
              <div>
                <strong>
                  {row.manager_decision === 'approved' ? t.hiringRequestsDetailDecisionApproved : t.hiringRequestsDetailDecisionRejected}
                </strong>
                {row.manager_decided_at && <> · {formatDateTime(row.manager_decided_at, lang)}</>}
              </div>
              {row.manager_auto_approved ? (
                <div style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailAutoApprovedNote}</div>
              ) : row.manager_decider?.name ? (
                <div style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailDecidedBy}: {row.manager_decider.name}</div>
              ) : null}
              {row.manager_decision_note && (
                <div style={{ color: 'var(--color-text-secondary)' }}>{t.hiringRequestsDetailDecisionNote}: {row.manager_decision_note}</div>
              )}
            </div>
          }
        />
      )
    }
    if (status === 'submitted') {
      return (
        <Step
          title={t.hiringRequestsDetailStepManager}
          complete={false}
          inProgress
          detail={<span style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailWaiting}</span>}
        />
      )
    }
    return (
      <Step
        title={t.hiringRequestsDetailStepManager}
        complete={false}
        detail={<span style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailNotYetReached}</span>}
      />
    )
  })()

  const ownerStep = (() => {
    if (row.owner_decision) {
      return (
        <Step
          title={t.hiringRequestsDetailStepOwner}
          complete
          tone={row.owner_decision === 'approved' ? 'success' : 'danger'}
          detail={
            <div className="space-y-1">
              <div>
                <strong>
                  {row.owner_decision === 'approved' ? t.hiringRequestsDetailDecisionApproved : t.hiringRequestsDetailDecisionRejected}
                </strong>
                {row.owner_decided_at && <> · {formatDateTime(row.owner_decided_at, lang)}</>}
              </div>
              {row.owner_decider?.name && (
                <div style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailDecidedBy}: {row.owner_decider.name}</div>
              )}
              {row.owner_decision_note && (
                <div style={{ color: 'var(--color-text-secondary)' }}>{t.hiringRequestsDetailDecisionNote}: {row.owner_decision_note}</div>
              )}
            </div>
          }
        />
      )
    }
    if (status === 'manager_approved') {
      return (
        <Step
          title={t.hiringRequestsDetailStepOwner}
          complete={false}
          inProgress
          detail={<span style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailWaiting}</span>}
        />
      )
    }
    return (
      <Step
        title={t.hiringRequestsDetailStepOwner}
        complete={false}
        detail={<span style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsDetailNotYetReached}</span>}
      />
    )
  })()

  const actionedStep = row.actioned_at ? (
    <Step
      title={t.hiringRequestsDetailStepActioned}
      complete
      tone="success"
      detail={
        <div className="space-y-1">
          <div>{formatDateTime(row.actioned_at, lang)}</div>
          {row.candidate_employee?.name && (
            <div style={{ color: 'var(--color-text-tertiary)' }}>
              {t.hiringRequestsDetailActionedCandidate}: {row.candidate_employee.name}
            </div>
          )}
        </div>
      }
    />
  ) : null

  return (
    <Section title={t.hiringRequestsDetailSectionWorkflow}>
      <div className="space-y-3">
        {submittedStep}
        {managerStep}
        {ownerStep}
        {actionedStep}
        {isTerminalStatus(status) && status !== 'approved' && status !== 'actioned' && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, transparent)', color: 'var(--color-danger)' }}>
            {/* The final rejection status is shown by the manager/owner step above; this row is
               just a soft tail-note so the user sees terminal state at a glance. */}
            {status === 'rejected_by_manager' ? t.hiringRequestsStatusRejectedByManager : t.hiringRequestsStatusRejectedByOwner}
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Section + row primitives ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // hiring-print-section is a hook the print stylesheet uses to (a) keep
  // each section together on one page (no mid-section breaks) and (b)
  // tighten padding so the full form has a better chance of fitting on
  // a single A4 page when content is short.
  return (
    <div className="hiring-print-section rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="text-sm" style={{ color: 'var(--color-text)' }}>{value}</div>
    </div>
  )
}

function MultilineRow({ label, value, empty }: { label: string; value: string; empty: string }) {
  const trimmed = value?.trim() ?? ''
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="whitespace-pre-wrap text-sm" style={{ color: trimmed ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
        {trimmed || empty}
      </div>
    </div>
  )
}

function Step({ title, detail, complete, inProgress, tone }: {
  title: string
  detail: React.ReactNode
  complete: boolean
  inProgress?: boolean
  tone?: 'success' | 'danger'
}) {
  const dotColor =
    tone === 'success' ? 'var(--color-success)'
    : tone === 'danger' ? 'var(--color-danger)'
    : complete ? 'var(--color-success)'
    : inProgress ? 'var(--color-primary)'
    : 'var(--color-border)'
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      <div className="flex-1 text-sm">
        <div className="font-medium" style={{ color: 'var(--color-text)' }}>{title}</div>
        <div className="mt-0.5">{detail}</div>
      </div>
    </div>
  )
}

// ─── Status badge ──────────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: RequestStatus; t: Translations }) {
  const tone = statusTone(status)
  const palette: Record<string, { bg: string; fg: string }> = {
    neutral:  { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
    progress: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' },
    success:  { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    danger:   { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',  fg: 'var(--color-danger)' },
  }
  const { bg, fg } = palette[tone]
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {statusLabel(status, t)}
    </span>
  )
}

function statusLabel(s: RequestStatus, t: Translations): string {
  switch (s) {
    case 'draft': return t.hiringRequestsStatusDraft
    case 'submitted': return t.hiringRequestsStatusSubmitted
    case 'manager_approved': return t.hiringRequestsStatusManagerApproved
    case 'approved': return t.hiringRequestsStatusApproved
    case 'rejected_by_manager': return t.hiringRequestsStatusRejectedByManager
    case 'rejected_by_owner': return t.hiringRequestsStatusRejectedByOwner
    case 'actioned': return t.hiringRequestsStatusActioned
  }
}

// ─── Enum → label helpers (mirror of HiringRequestEdit) ────────────────

function employmentTypeLabel(et: EmploymentType, t: Translations): string {
  switch (et) {
    case 'freelance': return t.hiringRequestsEmpTypeFreelance
    case 'fixed_contract': return t.hiringRequestsEmpTypeFixedContract
    case 'permanent': return t.hiringRequestsEmpTypePermanent
  }
}

function categoryLabel(c: RequestCategory, t: Translations): string {
  switch (c) {
    case 'new_hire': return t.hiringRequestsCategoryNewHire
    case 'replacement': return t.hiringRequestsCategoryReplacement
  }
}

function sourceLabel(s: CandidateSource, t: Translations): string {
  switch (s) {
    case 'internal': return t.hiringRequestsSourceInternal
    case 'external': return t.hiringRequestsSourceExternal
  }
}

function fundLabel(f: FundSource, t: Translations): string {
  switch (f) {
    case 'budgeted': return t.hiringRequestsFundBudgeted
    case 'non_budgeted': return t.hiringRequestsFundNonBudgeted
  }
}

function allowanceLabel(a: AllowanceOption, t: Translations): string {
  switch (a) {
    case 'meal': return t.hiringRequestsAllowanceMeal
    case 'transport': return t.hiringRequestsAllowanceTransport
    case 'overtime': return t.hiringRequestsAllowanceOvertime
    case 'incentive': return t.hiringRequestsAllowanceIncentive
    case 'bonus': return t.hiringRequestsAllowanceBonus
    case 'other': return t.hiringRequestsAllowanceOther
  }
}

// ─── Submit validation ─────────────────────────────────────────────────
//
// Mirrors HiringRequestEdit's submit-path validation but reads from the
// saved DetailRow (typed columns) rather than the form's stringly-typed
// state. The server's submit_hiring_request RPC remains the source of
// truth; this is purely a pre-flight so the user sees a one-click fix
// path instead of an opaque RPC error.

function validateForSubmit(row: DetailRow, t: Translations): string | null {
  if (!row.department_id) return t.hiringRequestsValidationDepartment
  if (!row.position_name?.trim()) return t.hiringRequestsValidationPosition
  if (row.category === 'replacement' && !row.replacing_employee_id) {
    return t.hiringRequestsValidationReplacing
  }
  if (row.source_of_fund === 'non_budgeted' && !row.source_of_fund_justification?.trim()) {
    return t.hiringRequestsValidationFundJustification
  }
  if (row.allowances?.includes('other') && !row.allowance_other?.trim()) {
    return t.hiringRequestsValidationAllowanceOther
  }
  if (row.base_salary_min !== null && row.base_salary_max !== null && row.base_salary_min > row.base_salary_max) {
    return t.hiringRequestsValidationSalaryRange
  }
  if (!row.expected_hiring_date) return t.hiringRequestsValidationExpectedDate
  return null
}

// ─── Formatting helpers ─────────────────────────────────────────────────

function formatDate(iso: string | null, lang: 'en' | 'id'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function formatDateTime(iso: string | null, lang: 'en' | 'id'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

function formatSalaryRange(min: number | null, max: number | null, t: Translations): string {
  const fmt = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
  if (min !== null && max !== null) return t.hiringRequestsDetailFromTo.replace('{min}', fmt(min)).replace('{max}', fmt(max))
  if (min !== null) return t.hiringRequestsDetailFromOnly.replace('{min}', fmt(min))
  if (max !== null) return t.hiringRequestsDetailUpToOnly.replace('{max}', fmt(max))
  return ''
}
