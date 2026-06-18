// Employee-portal "Requests" tab: lists the employee's own form submissions
// and lets them file a new Leave or Overtime request. RPC-only — submission
// goes through portal_submit_* (slug + token), and the identity header is
// resolved server-side, so nothing here is free-text identity.

import { useEffect, useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import {
  listPortalForms, submitLeaveRequest, submitOvertimeRequest, getPortalLeaveBalance, getPortalFormsConfig,
  type PortalFormsResult, type PortalFormSubmission, type LeaveBalance,
} from '../../lib/forms/api'
import type { FormsConfig } from '../../lib/forms/registry'
import { LEAVE_TYPES, validateLeave, type LeaveType } from '../../lib/forms/leaveRequest'
import { WORK_STATUSES, validateOvertime, type OvertimeLineItem, type WorkStatus } from '../../lib/forms/overtimeRequest'
import type { Translations } from '../../lib/translations'
import type { FormStatus, FormType } from '../../types/aliases'

type View = 'list' | 'pick' | 'leave' | 'overtime'

const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }

export function RequestsTab({ slug, token }: { slug: string | null; token: string | null }) {
  const { t, lang } = useLang()
  const [data, setData] = useState<PortalFormsResult | null>(null)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [config, setConfig] = useState<FormsConfig>({})
  const [view, setView] = useState<View>('list')
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!slug || !token) return
    setLoading(true)
    try {
      setData(await listPortalForms(slug, token))
      getPortalLeaveBalance(slug, token).then(setBalance).catch(() => {})
      getPortalFormsConfig(slug, token).then(setConfig).catch(() => {})
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug, token])

  function onSubmitted() {
    setView('list')
    reload()
  }

  if (loading && !data) {
    return <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</div>
  }

  if (view === 'leave' && slug && token) {
    return <LeaveForm slug={slug} token={token} t={t} config={config.leave_request} onDone={onSubmitted} onCancel={() => setView('list')} />
  }
  if (view === 'overtime' && slug && token) {
    return <OvertimeForm slug={slug} token={token} t={t} config={config.overtime_request} onDone={onSubmitted} onCancel={() => setView('list')} />
  }
  if (view === 'pick') {
    return (
      <div className="space-y-4 px-1 py-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.portalRequestPickType}</h2>
        <div className="grid gap-3">
          <PickCard label={t.portalRequestNewLeave} sub={t.formsTypeLeave} onClick={() => setView('leave')} />
          <PickCard label={t.portalRequestNewOvertime} sub={t.formsTypeOvertime} onClick={() => setView('overtime')} />
        </div>
        <button onClick={() => setView('list')} className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.cancel}</button>
      </div>
    )
  }

  const submissions = data?.submissions ?? []
  return (
    <div className="space-y-4 px-1 py-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.portalRequestsTitle}</h2>
        <button
          onClick={() => setView('pick')}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.portalRequestsNew}
        </button>
      </div>
      {balance && (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.leaveBalanceTitle}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold" style={{ color: 'var(--color-primary)' }}>{balance.remaining}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>/ {balance.entitlement} {t.leaveBalanceDaysUnit}</span>
          </div>
          {balance.eligible === false && (
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.leaveBalanceLocked}</div>
          )}
        </div>
      )}
      {submissions.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.portalRequestsEmpty}
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => <SubmissionRow key={sub.id} sub={sub} t={t} lang={lang} />)}
        </div>
      )}
    </div>
  )
}

function PickCard({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start rounded-xl border p-4 text-left transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</span>
    </button>
  )
}

function SubmissionRow({ sub, t, lang }: { sub: PortalFormSubmission; t: Translations; lang: 'en' | 'id' }) {
  const fd = (sub.field_data ?? {}) as Record<string, unknown>
  const subtitle = sub.form_type === 'leave_request'
    ? leaveTypeLabel(fd.leave_type as LeaveType, t)
    : `${fd.total_ot_hours ?? 0} ${t.formsFieldTotalHours.toLowerCase()}`
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{formTypeLabel(sub.form_type as FormType, t)}</div>
        <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{subtitle} · {formatDate(sub.created_at, lang)}</div>
      </div>
      <StatusPill status={sub.status as FormStatus} t={t} />
    </div>
  )
}

// ─── Leave form ─────────────────────────────────────────────────────────────

export function LeaveForm({ slug, token, t, config, onDone, onCancel }: {
  slug: string; token: string; t: Translations
  config?: { enabled_leave_types?: string[]; require_reason?: boolean }
  onDone: () => void; onCancel: () => void
}) {
  const enabledTypes: LeaveType[] = (config?.enabled_leave_types && config.enabled_leave_types.length > 0)
    ? LEAVE_TYPES.filter(k => config.enabled_leave_types!.includes(k))
    : [...LEAVE_TYPES]
  const [leaveType, setLeaveType] = useState<LeaveType>(enabledTypes[0] ?? 'annual')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [shortFrom, setShortFrom] = useState('')
  const [shortTo, setShortTo] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const isShort = leaveType === 'short_time'

  async function submit() {
    const payload = {
      leave_type: leaveType,
      date_start: dateStart,
      date_end: isShort ? undefined : (dateEnd || dateStart),
      short_time_from: isShort ? shortFrom : undefined,
      short_time_to: isShort ? shortTo : undefined,
      reason: reason.trim() || undefined,
    }
    const e = validateLeave(payload)
    if (config?.require_reason && !payload.reason) e.push('reason')
    setErrors(e)
    if (e.length > 0) return
    setSubmitting(true)
    setErr('')
    try {
      await submitLeaveRequest(slug, token, payload)
      onDone()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormShell title={t.formsTypeLeave} onCancel={onCancel} onSubmit={submit} submitting={submitting} err={err} t={t}>
      <Field label={t.formsFieldLeaveType}>
        <select value={leaveType} onChange={e => setLeaveType(e.target.value as LeaveType)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
          {LEAVE_TYPES.map(lt => <option key={lt} value={lt}>{leaveTypeLabel(lt, t)}</option>)}
        </select>
      </Field>
      {isShort ? (
        <>
          <Field label={t.formsColDate} invalid={errors.includes('date_start')}>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.portalRequestDateFrom} invalid={errors.includes('short_time')}>
              <input type="time" value={shortFrom} onChange={e => setShortFrom(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            </Field>
            <Field label={t.portalRequestDateTo} invalid={errors.includes('short_time')}>
              <input type="time" value={shortTo} onChange={e => setShortTo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.portalRequestDateFrom} invalid={errors.includes('date_start')}>
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </Field>
          <Field label={t.portalRequestDateTo} invalid={errors.includes('date_range')}>
            <input type="date" value={dateEnd} min={dateStart} onChange={e => setDateEnd(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </Field>
        </div>
      )}
      <Field label={t.formsFieldReason} invalid={errors.includes('reason')}>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder={t.portalRequestReasonPlaceholder} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
      </Field>
    </FormShell>
  )
}

// ─── Overtime form ───────────────────────────────────────────────────────────

const emptyLine = (): OvertimeLineItem => ({ work_date: '', is_ot_day: false, start_time: '', end_time: '', reason: '' })

export function OvertimeForm({ slug, token, t, config, onDone, onCancel }: {
  slug: string; token: string; t: Translations
  config?: { enabled_work_statuses?: string[] }
  onDone: () => void; onCancel: () => void
}) {
  const enabledStatuses: WorkStatus[] = (config?.enabled_work_statuses && config.enabled_work_statuses.length > 0)
    ? WORK_STATUSES.filter(k => config.enabled_work_statuses!.includes(k))
    : [...WORK_STATUSES]
  const [workStatus, setWorkStatus] = useState<WorkStatus>(enabledStatuses[0] ?? 'permanent')
  const [lines, setLines] = useState<OvertimeLineItem[]>([emptyLine()])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  function updateLine(i: number, patch: Partial<OvertimeLineItem>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  async function submit() {
    const e = validateOvertime({ work_status: workStatus }, lines)
    setErrors(e)
    if (e.length > 0) return
    setSubmitting(true)
    setErr('')
    try {
      await submitOvertimeRequest(slug, token, { work_status: workStatus }, lines)
      onDone()
    } catch (ex) {
      setErr((ex as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormShell title={t.formsTypeOvertime} onCancel={onCancel} onSubmit={submit} submitting={submitting} err={err} t={t}>
      <Field label={t.formsFieldWorkStatus}>
        <select value={workStatus} onChange={e => setWorkStatus(e.target.value as WorkStatus)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
          {enabledStatuses.map(ws => <option key={ws} value={ws}>{workStatusLabel(ws, t)}</option>)}
        </select>
      </Field>
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="rounded-lg border p-3" style={{ borderColor: errors.includes(`line_${i}_date`) || errors.includes(`line_${i}_time`) ? 'var(--color-danger)' : 'var(--color-border)' }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>#{i + 1}</span>
              {lines.length > 1 && (
                <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="text-xs font-medium" style={{ color: 'var(--color-danger)' }}>
                  {t.portalRequestRemoveRow}
                </button>
              )}
            </div>
            <Field label={t.formsColDate}>
              <input type="date" value={l.work_date} onChange={e => updateLine(i, { work_date: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            </Field>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label={t.formsColStart}>
                <input type="time" value={l.start_time} onChange={e => updateLine(i, { start_time: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </Field>
              <Field label={t.formsColEnd}>
                <input type="time" value={l.end_time} onChange={e => updateLine(i, { end_time: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </Field>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={l.is_ot_day} onChange={e => updateLine(i, { is_ot_day: e.target.checked })} style={{ accentColor: 'var(--color-primary)' }} />
              {t.formsColOtDay}
            </label>
            <input value={l.reason ?? ''} onChange={e => updateLine(i, { reason: e.target.value })} placeholder={t.portalRequestReasonPlaceholder} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
        ))}
        <button onClick={() => setLines(prev => [...prev, emptyLine()])} className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
          + {t.portalRequestAddRow}
        </button>
      </div>
    </FormShell>
  )
}

// ─── Shared form chrome ───────────────────────────────────────────────────────

function FormShell({ title, children, onCancel, onSubmit, submitting, err, t }: {
  title: string; children: React.ReactNode; onCancel: () => void; onSubmit: () => void; submitting: boolean; err: string; t: Translations
}) {
  return (
    <div className="space-y-4 px-1 py-2">
      <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      {err && <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{err}</div>}
      <div className="space-y-3">{children}</div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} disabled={submitting} className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
          {t.cancel}
        </button>
        <button onClick={onSubmit} disabled={submitting} className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
          {submitting ? t.portalRequestSubmitting : t.portalRequestSubmit}
        </button>
      </div>
    </div>
  )
}

function Field({ label, invalid, children }: { label: string; invalid?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: invalid ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{label}</span>
      {children}
    </label>
  )
}

function StatusPill({ status, t }: { status: FormStatus; t: Translations }) {
  const tone = status === 'approved' ? 'success'
    : status === 'rejected_by_manager' || status === 'rejected_by_owner' ? 'danger'
    : status === 'draft' ? 'neutral' : 'progress'
  const palette: Record<string, { bg: string; fg: string }> = {
    neutral:  { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
    progress: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' },
    success:  { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    danger:   { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',  fg: 'var(--color-danger)' },
  }
  const { bg, fg } = palette[tone]
  return <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>{statusLabel(status, t)}</span>
}

// ─── Label helpers ────────────────────────────────────────────────────────

function formTypeLabel(ft: FormType, t: Translations): string {
  return ft === 'leave_request' ? t.formsTypeLeave : t.formsTypeOvertime
}

function statusLabel(s: FormStatus, t: Translations): string {
  switch (s) {
    case 'draft': return t.formsStatusDraft
    case 'submitted': return t.formsStatusSubmitted
    case 'manager_approved': return t.formsStatusManagerApproved
    case 'approved': return t.formsStatusApproved
    case 'rejected_by_manager': return t.formsStatusRejectedByManager
    case 'rejected_by_owner': return t.formsStatusRejectedByOwner
  }
}

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

function workStatusLabel(ws: WorkStatus, t: Translations): string {
  switch (ws) {
    case 'permanent': return t.workStatusPermanent
    case 'contract': return t.workStatusContract
    case 'daily': return t.workStatusDaily
    case 'piecework': return t.workStatusPiecework
  }
}

function formatDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}
