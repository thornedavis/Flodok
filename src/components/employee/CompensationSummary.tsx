import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { formatIdr, currentPeriodMonth } from '../../lib/credits'
import { documentEditPath } from '../../lib/documentTypes'
import { StatCard } from '../Metrics'
import type { Contract, User } from '../../types/aliases'

// Employee → Compensation tab. A read-only financial summary: itemised pay
// breakdown (base + each allowance component), the contract + payment facts we
// collect, and at-a-glance analytics (lifetime paid out, leave, overtime,
// recognition, tenure) plus the employee's leave/overtime requests. All data
// comes from existing RPCs + RLS-guarded reads — no new backend.

type PayLine = { line_type: string; name: string; kind: string; is_fixed: boolean; amount_idr: number }
type LeaveBalance = { entitlement: number; used: number; remaining: number } | null
type FormRow = {
  id: string
  form_type: string
  status: string
  reference_number: string | null
  field_data: Record<string, unknown> | null
  created_at: string
}

type Analytics = {
  lines: PayLine[]
  paidOutTotal: number
  paidOutMonths: number
  leave: LeaveBalance
  overtimePay: number
  overtimeHours: number
  rewards: number
  penalties: number
  rewardCount: number
  penaltyCount: number
  requests: FormRow[]
  bankName: string | null
  bankAccount: string | null
  npwp: string | null
  joinDate: string | null
}

function mask(value: string | null): string | null {
  if (!value) return null
  const tail = value.slice(-4)
  return `•••• ${tail}`
}

function localeOf(lang: 'en' | 'id') { return lang === 'id' ? 'id-ID' : 'en-US' }

export function CompensationSummary({ user, contract, employeeId }: {
  user: User
  contract: Contract | null
  employeeId: string
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [a, setA] = useState<Analytics | null>(null)

  const baseWage = contract?.base_wage_idr ?? 0
  const allowance = contract?.allowance_idr ?? 0
  const hasContract = !!contract && baseWage > 0
  const monthlyPay = baseWage + allowance

  useEffect(() => {
    if (!isAdmin || !employeeId) { setA(null); return }
    let cancelled = false
    async function load() {
      const period = currentPeriodMonth()
      const year = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getFullYear()
      const [empRes, setlRes, adjRes, leaveRes, linesRes, formsRes] = await Promise.all([
        supabase.from('employees').select('bank_name, bank_account_number, npwp, join_date, created_at').eq('id', employeeId).single(),
        supabase.from('pay_period_settlements').select('payout_idr').eq('employee_id', employeeId),
        supabase.from('pay_adjustments').select('amount_idr, reason').eq('employee_id', employeeId),
        supabase.rpc('admin_leave_balance', { p_employee_id: employeeId, p_year: year }),
        supabase.rpc('admin_payroll_lines', { p_employee_id: employeeId, p_period: period }),
        supabase.from('form_submissions').select('id, form_type, status, reference_number, field_data, created_at').eq('employee_id', employeeId).is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
      ])
      if (cancelled) return

      const settlements = (setlRes.data ?? []) as { payout_idr: number }[]
      const paidOutTotal = settlements.reduce((s, r) => s + (r.payout_idr ?? 0), 0)

      // Categorise adjustments by their system-generated reason prefix: overtime
      // (Lembur) and unpaid-leave (Cuti) postings are tracked in their own
      // sections; everything else is manual reward/penalty recognition.
      let overtimePay = 0, rewards = 0, penalties = 0, rewardCount = 0, penaltyCount = 0
      for (const row of (adjRes.data ?? []) as { amount_idr: number; reason: string | null }[]) {
        const amt = row.amount_idr ?? 0
        const reason = (row.reason ?? '').toLowerCase()
        if (reason.startsWith('lembur')) { overtimePay += amt; continue }
        if (reason.includes('cuti')) continue
        if (amt > 0) { rewards += amt; rewardCount++ }
        else if (amt < 0) { penalties += amt; penaltyCount++ }
      }

      const lb = (leaveRes.data as unknown as LeaveBalance) ?? null
      const lines = (linesRes.data as unknown as PayLine[] | null) ?? []
      const requests = (formsRes.data as unknown as FormRow[] | null) ?? []
      const overtimeHours = requests
        .filter(r => r.form_type === 'overtime_request' && r.status === 'approved')
        .reduce((s, r) => s + Number(r.field_data?.total_ot_hours ?? 0), 0)

      const emp = empRes.data as { bank_name: string | null; bank_account_number: string | null; npwp: string | null; join_date: string | null; created_at: string } | null

      setA({
        lines,
        paidOutTotal,
        paidOutMonths: settlements.length,
        leave: lb,
        overtimePay,
        overtimeHours,
        rewards,
        penalties,
        rewardCount,
        penaltyCount,
        requests,
        bankName: emp?.bank_name ?? null,
        bankAccount: emp?.bank_account_number ?? null,
        npwp: emp?.npwp ?? null,
        joinDate: emp?.join_date ?? emp?.created_at ?? null,
      })
    }
    void load()
    return () => { cancelled = true }
  }, [isAdmin, employeeId])

  // Earnings breakdown: prefer the itemised lines (base + each allowance
  // component); fall back to the two contract totals if lines aren't loaded.
  const earnings: PayLine[] = a?.lines.filter(l => l.line_type === 'base' || l.line_type === 'allowance') ?? []
  const earningsRows = earnings.length > 0
    ? earnings
    : [
        { line_type: 'base', name: t.portalBaseWage, kind: 'earning', is_fixed: true, amount_idr: baseWage },
        ...(allowance > 0 ? [{ line_type: 'allowance', name: t.portalAllowance, kind: 'earning', is_fixed: false, amount_idr: allowance }] : []),
      ]

  const tenure = (() => {
    if (!a?.joinDate) return null
    const start = new Date(a.joinDate)
    if (isNaN(start.getTime())) return null
    const now = new Date()
    const total = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
    return { years: Math.floor(total / 12), months: total % 12, since: start.toLocaleDateString(localeOf(lang), { month: 'short', year: 'numeric' }) }
  })()

  const recognitionNet = a ? a.rewards + a.penalties : 0

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotTitle}
        </h2>
        {contract && (
          <Link to={documentEditPath('contract', contract.id)} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.contractSnapshotEdit} →
          </Link>
        )}
      </div>

      {!hasContract ? (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotNoActive}
        </div>
      ) : (
        <>
          {/* Pay summary — money on the left, contract + payment facts on the right. */}
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.compensationMonthlyPay}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {formatIdr(monthlyPay, lang)}
              </p>
              <p className="mt-4 mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t.compEarnings}</p>
              {earningsRows.map((l, i) => (
                <div key={i} className="flex items-center justify-between border-t py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text)' }}>
                    {l.name}
                    {l.line_type === 'allowance' && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[11px]"
                        style={l.is_fixed
                          ? { border: '0.5px solid var(--color-border)', color: 'var(--color-text-tertiary)' }
                          : { backgroundColor: 'var(--color-primary-subtle, var(--color-bg-tertiary))', color: 'var(--color-primary)' }}>
                        {l.is_fixed ? t.compFixed : t.compVariable}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--color-text)' }}>{formatIdr(l.amount_idr, lang)}</span>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t.compContract}</p>
              <Fact k={t.compFieldType} v={contract?.contract_type ?? '—'} />
              <Fact k={t.compFieldSchedule} v={t.compScheduleValue(contract?.hours_per_day ?? 0, contract?.days_per_week ?? 0)} />
              <Fact k={t.compFieldAnnualLeave} v={t.compReqDays(contract?.annual_leave_days ?? 0)} />
              {(a?.bankName || a?.npwp) && (
                <>
                  <p className="mb-1 mt-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t.compPayment}</p>
                  {a?.bankName && <Fact k={t.compFieldBank} v={`${a.bankName} ${mask(a.bankAccount) ?? ''}`.trim()} />}
                  {a?.npwp && <Fact k={t.compFieldNpwp} v={mask(a.npwp) ?? '—'} />}
                </>
              )}
            </div>
          </div>

          {/* At a glance — admin-only analytics. */}
          {isAdmin && a && (
            <>
              <h3 className="mb-2.5 mt-6 text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.compGlance}</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard label={t.compPaidOut} value={formatIdr(a.paidOutTotal, lang)} hint={t.compPaidOutMonths(a.paidOutMonths)} />
                <StatCard
                  label={t.compLeaveLeft}
                  value={a.leave ? `${a.leave.remaining} / ${a.leave.entitlement}` : '—'}
                  hint={a.leave ? t.compLeaveTaken(a.leave.used) : undefined}
                />
                <StatCard label={t.compOvertime} value={t.compHours(a.overtimeHours)} hint={a.overtimePay > 0 ? formatIdr(a.overtimePay, lang) : undefined} />
                <StatCard
                  label={t.compRecognition}
                  value={`${recognitionNet > 0 ? '+' : recognitionNet < 0 ? '−' : ''}${formatIdr(Math.abs(recognitionNet), lang)}`}
                  hint={t.compRecognitionHint(a.rewardCount, a.penaltyCount)}
                  tone={recognitionNet > 0 ? 'success' : recognitionNet < 0 ? 'danger' : undefined}
                />
                <StatCard
                  label={t.compTenure}
                  value={tenure ? t.compTenureValue(tenure.years, tenure.months) : '—'}
                  hint={tenure ? t.compTenureSince(tenure.since) : undefined}
                />
              </div>

              {/* Requests — the employee's leave & overtime submissions. */}
              <h3 className="mb-1 mt-6 text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.compReqTitle}</h3>
              {a.requests.length === 0 ? (
                <p className="py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.compReqEmpty}</p>
              ) : (
                a.requests.map(r => <RequestRow key={r.id} row={r} t={t} lang={lang} />)
              )}
            </>
          )}

          <div className="mt-6">
            <Link to={`/dashboard/performance/${employeeId}`} className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              {t.compensationViewPerformance} →
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-t py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{k}</span>
      <span style={{ color: 'var(--color-text)' }}>{v}</span>
    </div>
  )
}

function statusMeta(status: string, t: ReturnType<typeof useLang>['t']): { label: string; color: string; bg: string } {
  switch (status) {
    case 'approved': return { label: t.formsStatusApproved, color: 'var(--color-success, #16a34a)', bg: 'var(--color-success-subtle, var(--color-bg-tertiary))' }
    case 'submitted': return { label: t.formsStatusSubmitted, color: 'var(--color-warning)', bg: 'var(--color-bg-tertiary)' }
    case 'manager_approved': return { label: t.formsStatusManagerApproved, color: 'var(--color-warning)', bg: 'var(--color-bg-tertiary)' }
    case 'rejected_by_manager': return { label: t.formsStatusRejectedByManager, color: 'var(--color-danger)', bg: 'var(--color-bg-tertiary)' }
    case 'rejected_by_owner': return { label: t.formsStatusRejectedByOwner, color: 'var(--color-danger)', bg: 'var(--color-bg-tertiary)' }
    default: return { label: t.formsStatusDraft, color: 'var(--color-text-tertiary)', bg: 'var(--color-bg-tertiary)' }
  }
}

function leaveTypeLabel(lt: string, t: ReturnType<typeof useLang>['t']): string {
  switch (lt) {
    case 'unpaid': return t.leaveTypeUnpaid
    case 'national_holiday': return t.leaveTypeNationalHoliday
    case 'sick_no_note': return t.leaveTypeSickNoNote
    case 'sick_with_note': return t.leaveTypeSickWithNote
    case 'short_time': return t.leaveTypeShortTime
    case 'special': return t.leaveTypeSpecial
    default: return t.leaveTypeAnnual
  }
}

function RequestRow({ row, t, lang }: { row: FormRow; t: ReturnType<typeof useLang>['t']; lang: 'en' | 'id' }) {
  const st = statusMeta(row.status, t)
  const fd = row.field_data ?? {}
  const isOvertime = row.form_type === 'overtime_request'
  const typeLabel = isOvertime ? t.compReqOvertime : leaveTypeLabel(String(fd.leave_type ?? 'annual'), t)

  let summary = ''
  if (isOvertime) {
    summary = t.compReqHours(Number(fd.total_ot_hours ?? 0))
  } else {
    const days = Number(fd.total_days ?? 0)
    const start = fd.date_start ? new Date(String(fd.date_start)) : null
    const dateStr = start && !isNaN(start.getTime()) ? start.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' }) : ''
    summary = [dateStr, t.compReqDays(days)].filter(Boolean).join(' · ')
  }

  return (
    <div className="flex items-center gap-3 border-t py-2.5 text-sm" style={{ borderColor: 'var(--color-border)' }}>
      <span className="w-28 shrink-0" style={{ color: 'var(--color-text)' }}>{typeLabel}</span>
      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{summary}</span>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
      {row.reference_number && (
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{row.reference_number}</span>
      )}
    </div>
  )
}
