// Read-only detail view of a form submission with role-gated approval actions.
// Mirrors HiringRequestDetail.tsx: visibility is enforced by RLS; the action
// buttons are a UI gate over the decide RPCs.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { useRole } from '../../hooks/useRole'
import { managerDecideForm, ownerDecideForm, emitFormEvent, getAdminLeaveBalance, repostFormToPayroll, type FormEventKind, type LeaveBalance } from '../../lib/forms/api'
import { pendingApprover, isTerminalStatus, type FormIdentity } from '../../lib/forms/registry'
import { exportFormPdf } from '../../lib/forms/formPdf'
import { formTypeLabel, StatusBadge, formatDate } from './Forms'
import type { LeaveType } from '../../lib/forms/leaveRequest'
import type { WorkStatus } from '../../lib/forms/overtimeRequest'
import type { Translations } from '../../lib/translations'
import type { User, FormSubmission, FormStatus, FormType } from '../../types/aliases'

interface LineItem {
  line_no: number
  work_date: string
  is_ot_day: boolean
  start_time: string
  end_time: string
  total_hours: number
  reason: string | null
}

type DetailRow = FormSubmission & {
  employee: { id: string; name: string | null } | null
  manager: { id: string; name: string | null } | null
  manager_decider: { id: string; name: string | null } | null
  owner_decider: { id: string; name: string | null } | null
  line_items: LineItem[]
}

const DETAIL_SELECT = `
  *,
  employee:employees!form_submissions_employee_id_fkey(id, name),
  manager:users!form_submissions_manager_user_id_fkey(id, name),
  manager_decider:users!form_submissions_manager_decided_by_fkey(id, name),
  owner_decider:users!form_submissions_owner_decided_by_fkey(id, name),
  line_items:form_line_items(line_no, work_date, is_ot_day, start_time, end_time, total_hours, reason)
`

type DecisionMode = { kind: 'approve' | 'reject' } | null

export function FormDetail({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const role = useRole(user)

  const [row, setRow] = useState<DetailRow | null>(null)
  const [replacementNames, setReplacementNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState<DecisionMode>(null)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [reposting, setReposting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const fd = useMemo(() => (row?.field_data ?? {}) as Record<string, unknown>, [row])
  useBreadcrumbTrailing(row?.employee?.name ?? null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.from('form_submissions').select(DETAIL_SELECT).eq('id', id!).single()
      if (cancelled) return
      if (error || !data) {
        setError(error?.message ?? t.formsNotFound)
        setLoading(false)
        return
      }
      const r = data as DetailRow
      setRow(r)
      const ids = ((r.field_data as Record<string, unknown>)?.replacement_employee_ids as string[] | undefined) ?? []
      if (ids.length > 0) {
        const { data: emps } = await supabase.from('employees').select('id, name').in('id', ids)
        if (!cancelled) setReplacementNames((emps ?? []).map(e => e.name).filter((n): n is string => !!n))
      } else {
        setReplacementNames([])
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id, t.formsNotFound])

  // Annual-leave balance for the approval surface (owner/admin/hr only).
  useEffect(() => {
    if (!row || row.form_type !== 'leave_request') { setBalance(null); return }
    if ((row.field_data as Record<string, unknown>)?.leave_type !== 'annual') { setBalance(null); return }
    let cancelled = false
    getAdminLeaveBalance(row.employee_id).then(b => { if (!cancelled) setBalance(b) }).catch(() => {})
    return () => { cancelled = true }
  }, [row])

  async function reload() {
    if (!id) return
    const { data } = await supabase.from('form_submissions').select(DETAIL_SELECT).eq('id', id).single()
    if (data) setRow(data as DetailRow)
  }

  async function handleRepost() {
    if (!row) return
    setReposting(true)
    setError('')
    try {
      await repostFormToPayroll(row.id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReposting(false)
    }
  }

  async function handleDownloadPdf() {
    if (!row) return
    setDownloading(true)
    setError('')
    try {
      const identity = (fd.identity ?? {}) as FormIdentity
      const approvals = {
        employee:   { name: identity.name ?? row.employee?.name ?? null, date: row.submitted_at },
        supervisor: { name: row.manager_decider?.name ?? null, date: row.manager_decided_at },
        hr:         { name: row.owner_decider?.name ?? null, date: row.owner_decided_at },
      }
      if ((row.form_type as FormType) === 'leave_request') {
        await exportFormPdf({
          kind: 'leave',
          referenceNumber: row.reference_number,
          identity,
          supervisorName: row.manager?.name ?? null,
          leaveTypeKey: (fd.leave_type as string) ?? '',
          dateStart: (fd.date_start as string) ?? null,
          dateEnd: (fd.date_end as string) ?? null,
          totalDays: (fd.total_days as number) ?? null,
          shortFrom: (fd.short_time_from as string) ?? null,
          shortTo: (fd.short_time_to as string) ?? null,
          reason: (fd.reason as string) ?? null,
          replacements: replacementNames,
          approvals,
        })
      } else {
        await exportFormPdf({
          kind: 'overtime',
          referenceNumber: row.reference_number,
          identity,
          supervisorName: row.manager?.name ?? null,
          workStatusLabel: workStatusLabel(fd.work_status as WorkStatus, t),
          lines: (row.line_items ?? []).map(li => ({
            date: li.work_date, isOtDay: li.is_ot_day,
            start: li.start_time?.slice(0, 5) ?? '', end: li.end_time?.slice(0, 5) ?? '',
            hours: li.total_hours, reason: li.reason,
          })),
          totalDays: Number(fd.total_ot_days ?? 0),
          totalHours: Number(fd.total_ot_hours ?? 0),
          approvals,
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  const capability = useMemo(() => {
    if (!row) return { canManagerDecide: false, canOwnerDecide: false }
    const status = row.status as FormStatus
    const isSubject = !!user.employee_id && row.employee_id === user.employee_id
    return {
      // The designated approver (or an admin override) decides the manager
      // step; never your own request. The decide RPC re-checks server-side.
      canManagerDecide: status === 'submitted' && !isSubject && (row.manager_user_id === user.id || role.isAdmin),
      canOwnerDecide: status === 'manager_approved' && role.isOwner && !isSubject,
    }
  }, [row, role.isAdmin, role.isOwner, user.id, user.employee_id])

  async function confirmDecision() {
    if (!row || !decision) return
    setWorking(true)
    setError('')
    const approve = decision.kind === 'approve'
    const trimmed = note.trim() || null
    try {
      const pending = pendingApprover(row.status as FormStatus)
      let updated: FormSubmission | null = null
      let kind: FormEventKind | null = null
      if (pending === 'manager') {
        updated = await managerDecideForm(row.id, approve, trimmed)
        kind = approve ? 'manager_approved' : 'manager_rejected'
      } else if (pending === 'owner') {
        updated = await ownerDecideForm(row.id, approve, trimmed)
        kind = approve ? 'approved' : 'owner_rejected'
      }
      if (updated && kind) {
        await emitFormEvent({ orgId: user.org_id, kind, submission: updated, title: row.employee?.name ?? 'Employee' })
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

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  if (!row) {
    return (
      <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
        {t.formsNotFound}
      </div>
    )
  }

  const status = row.status as FormStatus
  const formType = row.form_type as FormType
  const identity = (fd.identity ?? {}) as Record<string, string | null>
  const showOwnerStep = row.owner_approval_required || !!row.owner_decision

  return (
    <div className="hiring-print-doc max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              {formTypeLabel(formType, t)}
            </span>
            <StatusBadge status={status} t={t} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{row.employee?.name ?? identity.name ?? '—'}</h1>
          {row.reference_number && (
            <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsReference}: {row.reference_number}</div>
          )}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard/forms')}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.formsDownloadPdf}
          </button>
          {(capability.canManagerDecide || capability.canOwnerDecide) && !decision && (
            <>
              <button
                onClick={() => { setDecision({ kind: 'reject' }); setNote(''); setError('') }}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
              >
                {t.formsActionReject}
              </button>
              <button
                onClick={() => { setDecision({ kind: 'approve' }); setNote(''); setError('') }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t.formsActionApprove}
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

      {decision && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {decision.kind === 'approve' ? t.formsApprovingTitle : t.formsRejectingTitle}
          </h2>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t.formsDecisionNotePlaceholder}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => { setDecision(null); setNote('') }}
              disabled={working}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.cancel}
            </button>
            <button
              onClick={confirmDecision}
              disabled={working}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: decision.kind === 'approve' ? 'var(--color-primary)' : 'var(--color-danger)' }}
            >
              {decision.kind === 'approve' ? t.formsActionConfirmApprove : t.formsActionConfirmReject}
            </button>
          </div>
        </div>
      )}

      <Section title={t.formsDetailSectionEmployee}>
        <Row label={t.formsFieldName} value={identity.name ?? row.employee?.name ?? '—'} />
        <Row label={t.formsFieldEmployeeCode} value={identity.employee_code ?? '—'} />
        <Row label={t.formsFieldPosition} value={identity.job_position ?? '—'} />
        <Row label={t.formsFieldDepartment} value={identity.department ?? '—'} />
        {formType === 'overtime_request' && (
          <Row label={t.formsFieldWorkStatus} value={workStatusLabel(fd.work_status as WorkStatus, t)} />
        )}
      </Section>

      <Section title={t.formsDetailSectionRequest}>
        {formType === 'leave_request' ? (
          <>
            <Row label={t.formsFieldLeaveType} value={leaveTypeLabel(fd.leave_type as LeaveType, t)} />
            {fd.leave_type === 'short_time' ? (
              <>
                <Row label={t.formsFieldDates} value={formatDate((fd.date_start as string) ?? null, lang)} />
                <Row label={t.formsFieldShortTime} value={`${(fd.short_time_from as string) ?? '—'} – ${(fd.short_time_to as string) ?? '—'}`} />
              </>
            ) : (
              <>
                <Row label={t.formsFieldDates} value={`${formatDate((fd.date_start as string) ?? null, lang)} – ${formatDate((fd.date_end as string) ?? null, lang)}`} />
                <Row label={t.formsFieldTotalDays} value={String(fd.total_days ?? '—')} />
              </>
            )}
            {replacementNames.length > 0 && (
              <Row label={t.formsFieldReplacements} value={replacementNames.join(', ')} />
            )}
            <MultilineRow label={t.formsFieldReason} value={(fd.reason as string) ?? ''} />
          </>
        ) : (
          <>
            <LineItemsTable items={row.line_items ?? []} t={t} lang={lang} />
            <Row label={t.formsFieldTotalHours} value={String(fd.total_ot_hours ?? 0)} />
            <Row label={t.formsFieldOtDays} value={String(fd.total_ot_days ?? 0)} />
          </>
        )}
      </Section>

      <Section title={t.formsDetailSectionWorkflow}>
        <div className="space-y-3">
          <Step
            title={t.formsStepSubmitted}
            complete={!!row.submitted_at}
            detail={row.submitted_at
              ? <span>{formatDateTime(row.submitted_at, lang)}</span>
              : <span style={{ color: 'var(--color-text-tertiary)' }}>{t.formsDetailNotSubmitted}</span>}
          />
          <DecisionStep
            title={t.formsStepManager}
            status={status}
            activeWhen="submitted"
            decision={row.manager_decision}
            decidedAt={row.manager_decided_at}
            deciderName={row.manager_auto_approved ? null : row.manager_decider?.name ?? null}
            note={row.manager_decision_note}
            autoApproved={row.manager_auto_approved}
            t={t}
            lang={lang}
          />
          {showOwnerStep && (
            <DecisionStep
              title={t.formsStepOwner}
              status={status}
              activeWhen="manager_approved"
              decision={row.owner_decision}
              decidedAt={row.owner_decided_at}
              deciderName={row.owner_decider?.name ?? null}
              note={row.owner_decision_note}
              autoApproved={false}
              t={t}
              lang={lang}
            />
          )}
          {isTerminalStatus(status) && status !== 'approved' && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, transparent)', color: 'var(--color-danger)' }}>
              {status === 'rejected_by_manager' ? t.formsStatusRejectedByManager : t.formsStatusRejectedByOwner}
            </div>
          )}
        </div>
      </Section>

      {status === 'approved' && (formType === 'overtime_request' || fd.leave_type === 'unpaid' || fd.leave_type === 'annual') && (
        <Section title={t.formsPayrollSection}>
          <PayrollStatus
            row={row}
            isAnnualLeave={formType === 'leave_request' && fd.leave_type === 'annual'}
            canRepost={role.isAdmin}
            reposting={reposting}
            onRepost={handleRepost}
            t={t}
          />
          {fd.leave_type === 'annual' && balance && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <BalanceStat label={t.leaveBalanceEntitlement} value={balance.entitlement} unit={t.leaveBalanceDaysUnit} />
                <BalanceStat label={t.leaveBalanceUsed} value={balance.used} unit={t.leaveBalanceDaysUnit} />
                <BalanceStat label={t.leaveBalanceRemaining} value={balance.remaining} unit={t.leaveBalanceDaysUnit} highlight />
              </div>
              {balance.eligible === false && (
                <div className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.leaveBalanceLocked}</div>
              )}
            </>
          )}
        </Section>
      )}
    </div>
  )
}

// ─── Payroll / balance ────────────────────────────────────────────────────

function PayrollStatus({ row, isAnnualLeave, canRepost, reposting, onRepost, t }: {
  row: DetailRow; isAnnualLeave: boolean; canRepost: boolean; reposting: boolean; onRepost: () => void; t: Translations
}) {
  if (row.payroll_posted_at) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-success)' }}>
        <Dot color="var(--color-success)" />{isAnnualLeave ? t.formsLeaveRecorded : t.formsPayrollPosted}
      </div>
    )
  }
  const reason = row.posting_skipped_reason
  if (reason && reason !== 'non_decrementing_leave_type') {
    const label = reason === 'period_frozen' ? t.formsSkipPeriodFrozen
      : reason === 'no_active_contract' ? t.formsSkipNoContract
      : t.formsSkipPostFailed
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--color-warning)' }}>
        <span className="flex items-center gap-2"><Dot color="var(--color-warning)" />{label}</span>
        {canRepost && (
          <button onClick={onRepost} disabled={reposting} className="rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            {t.formsRepost}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
      <Dot color="var(--color-border)" />{t.formsPostingPending}
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
}

function BalanceStat({ label, value, unit, highlight }: { label: string; value: number; unit: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="mt-0.5 text-lg font-semibold" style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-text)' }}>
        {value} <span className="text-xs font-normal" style={{ color: 'var(--color-text-tertiary)' }}>{unit}</span>
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function LineItemsTable({ items, t, lang }: { items: LineItem[]; t: Translations; lang: 'en' | 'id' }) {
  if (items.length === 0) return <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>—</div>
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-sm">
        <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColDate}</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColStart}</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColEnd}</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColHours}</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsFieldReason}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(li => (
            <tr key={li.line_no} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              <td className="px-3 py-2" style={{ color: 'var(--color-text)' }}>{formatDate(li.work_date, lang)}{li.is_ot_day ? ' ★' : ''}</td>
              <td className="px-3 py-2" style={{ color: 'var(--color-text-secondary)' }}>{li.start_time?.slice(0, 5)}</td>
              <td className="px-3 py-2" style={{ color: 'var(--color-text-secondary)' }}>{li.end_time?.slice(0, 5)}</td>
              <td className="px-3 py-2" style={{ color: 'var(--color-text-secondary)' }}>{li.total_hours}</td>
              <td className="px-3 py-2" style={{ color: 'var(--color-text-secondary)' }}>{li.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DecisionStep({ title, status, activeWhen, decision, decidedAt, deciderName, note, autoApproved, t, lang }: {
  title: string
  status: FormStatus
  activeWhen: FormStatus
  decision: string | null
  decidedAt: string | null
  deciderName: string | null
  note: string | null
  autoApproved: boolean
  t: Translations
  lang: 'en' | 'id'
}) {
  if (decision) {
    return (
      <Step
        title={title}
        complete
        tone={decision === 'approved' ? 'success' : 'danger'}
        detail={
          <div className="space-y-1">
            <div>
              <strong>{decision === 'approved' ? t.formsDetailApproved : t.formsDetailRejected}</strong>
              {decidedAt && <> · {formatDateTime(decidedAt, lang)}</>}
            </div>
            {autoApproved ? (
              <div style={{ color: 'var(--color-text-tertiary)' }}>{t.formsDetailAutoApproved}</div>
            ) : deciderName ? (
              <div style={{ color: 'var(--color-text-tertiary)' }}>{t.formsDetailDecidedBy}: {deciderName}</div>
            ) : null}
            {note && <div style={{ color: 'var(--color-text-secondary)' }}>{t.formsDetailDecisionNote}: {note}</div>}
          </div>
        }
      />
    )
  }
  if (status === activeWhen) {
    return <Step title={title} complete={false} inProgress detail={<span style={{ color: 'var(--color-text-tertiary)' }}>{t.formsDetailWaiting}</span>} />
  }
  return <Step title={title} complete={false} detail={<span style={{ color: 'var(--color-text-tertiary)' }}>{t.formsDetailNotYetReached}</span>} />
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function MultilineRow({ label, value }: { label: string; value: string }) {
  const trimmed = value?.trim() ?? ''
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="whitespace-pre-wrap text-sm" style={{ color: trimmed ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>{trimmed || '—'}</div>
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

// ─── Label helpers ────────────────────────────────────────────────────────

function leaveTypeLabel(lt: LeaveType | undefined, t: Translations): string {
  switch (lt) {
    case 'annual': return t.leaveTypeAnnual
    case 'unpaid': return t.leaveTypeUnpaid
    case 'national_holiday': return t.leaveTypeNationalHoliday
    case 'sick_no_note': return t.leaveTypeSickNoNote
    case 'sick_with_note': return t.leaveTypeSickWithNote
    case 'short_time': return t.leaveTypeShortTime
    case 'special': return t.leaveTypeSpecial
    default: return '—'
  }
}

function workStatusLabel(ws: WorkStatus | undefined, t: Translations): string {
  switch (ws) {
    case 'permanent': return t.workStatusPermanent
    case 'contract': return t.workStatusContract
    case 'daily': return t.workStatusDaily
    case 'piecework': return t.workStatusPiecework
    default: return '—'
  }
}

function formatDateTime(iso: string | null, lang: 'en' | 'id'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d)
}
