// Payroll — the dedicated monthly payroll surface (Phase 5).
//
// Organises every employee's pay for a selected month (base + allowances +
// adjustments → payout) and replaces the silent month-end cron with an
// explicit "Freeze & Run Payroll" action. Reads via preview_payroll (live for
// open employees, frozen snapshot for settled ones); the run freezes the whole
// org for the period through run_payroll. Owner/admin only — the RPCs enforce
// this server-side; the page guards the UI.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { currentPeriodMonth, formatIdr } from '../../lib/credits'
import { MonthStrip } from '../../components/portal/MonthStrip'
import { downloadPayslipPdf, type PayslipData } from '../../lib/payslipPdf'
import type { User } from '../../types/aliases'

type PayrollRow = {
  employee_id: string
  name: string
  photo_url: string | null
  settled: boolean
  has_active_contract: boolean
  base_idr: number
  allowance_idr: number
  adjustment_net_idr: number
  payout_idr: number
}

type PayrollPreview = {
  period: string
  rows: PayrollRow[]
  total_payout_idr: number
  counts: { total: number; settled: number; open: number; no_contract: number }
}

// Shift an ISO first-of-month back n months (for the MonthStrip window).
function monthsAgo(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number)
  let yy = y
  let mm = m - n
  while (mm < 1) { mm += 12; yy -= 1 }
  return `${yy}-${String(mm).padStart(2, '0')}-01`
}

export function Payroll({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)

  const current = currentPeriodMonth()
  const [period, setPeriod] = useState(current)
  const [data, setData] = useState<PayrollPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [payslipBusy, setPayslipBusy] = useState<string | null>(null)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    setError('')
    const { data: res, error: rpcError } = await supabase.rpc('preview_payroll', { p_period: p })
    if (rpcError) {
      setError(rpcError.message)
      setData(null)
    } else {
      setData(res as unknown as PayrollPreview)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isAdmin) load(period)
  }, [period, isAdmin, load])

  async function handleRun() {
    if (!data || running) return
    const openCount = data.counts.open
    if (openCount === 0) return
    if (!window.confirm(t.payrollRunConfirm(openCount))) return
    setRunning(true)
    setError('')
    const { data: res, error: rpcError } = await supabase.rpc('run_payroll', { p_period: period })
    setRunning(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    const ran = (res as { employees_run?: number } | null)?.employees_run ?? 0
    setFlash(t.payrollRunDone(ran))
    setTimeout(() => setFlash(''), 4000)
    await load(period)
  }

  async function handlePayslip(employeeId: string) {
    if (payslipBusy) return
    setPayslipBusy(employeeId)
    setError('')
    try {
      const { data: res, error: rpcError } = await supabase.rpc('admin_payslip', { p_employee_id: employeeId, p_period: period })
      if (rpcError || !res) {
        setError(rpcError?.message || t.payrollPayslipUnavailable)
        return
      }
      await downloadPayslipPdf(res as unknown as PayslipData, lang)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payslip failed')
    } finally {
      setPayslipBusy(null)
    }
  }

  if (!isAdmin) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.payrollAdminOnly}</div>
  }

  const counts = data?.counts
  const canRun = (counts?.open ?? 0) > 0

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.payrollTitle}</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.payrollSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {flash && <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>{flash}</span>}
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun || running || loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
            title={!canRun ? t.payrollNothingToRun : undefined}
          >
            {running && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
            {running ? t.payrollRunning : t.payrollRunButton}
          </button>
        </div>
      </div>

      <MonthStrip
        selectedMonth={period}
        earliestMonth={monthsAgo(current, 11)}
        currentMonth={current}
        onSelect={setPeriod}
        lang={lang}
      />

      {/* Summary */}
      {counts && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label={t.payrollTotalPayout} value={formatIdr(data?.total_payout_idr ?? 0, lang)} emphasis />
          <SummaryStat label={t.payrollSettledCount} value={String(counts.settled)} />
          <SummaryStat label={t.payrollOpenCount} value={String(counts.open)} />
          {counts.no_contract > 0 && <SummaryStat label={t.payrollNoContractCount} value={String(counts.no_contract)} warn />}
        </div>
      )}

      {error && <p className="mt-4 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {/* Roster */}
      <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
              <Th className="text-left">{t.payrollColEmployee}</Th>
              <Th className="text-right">{t.payrollColBase}</Th>
              <Th className="text-right">{t.payrollColAllowance}</Th>
              <Th className="text-right">{t.payrollColAdjustments}</Th>
              <Th className="text-right">{t.payrollColPayout}</Th>
              <Th className="text-right">{t.payrollColStatus}</Th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</td></tr>
            )}
            {!loading && data && data.rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.payrollEmpty}</td></tr>
            )}
            {!loading && data?.rows.map(r => (
              <tr key={r.employee_id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                <td className="px-3 py-2.5">
                  <div className="font-medium" style={{ color: 'var(--color-text)' }}>{r.name}</div>
                  {!r.has_active_contract && (
                    <div className="text-[11px]" style={{ color: 'var(--color-warning)' }}>{t.payrollNoContract}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{formatIdr(r.base_idr, lang)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{formatIdr(r.allowance_idr, lang)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: r.adjustment_net_idr < 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                  {r.adjustment_net_idr === 0 ? '—' : formatIdr(r.adjustment_net_idr, lang)}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums" style={{ color: 'var(--color-text)' }}>{formatIdr(r.payout_idr, lang)}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    {r.settled && (
                      <button
                        type="button"
                        onClick={() => handlePayslip(r.employee_id)}
                        disabled={payslipBusy === r.employee_id}
                        className="text-xs font-medium disabled:opacity-50"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {payslipBusy === r.employee_id ? '…' : t.payrollPayslip}
                      </button>
                    )}
                    <StatusBadge settled={r.settled} t={t} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, emphasis, warn }: { label: string; value: string; emphasis?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="text-xs" style={{ color: warn ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}>{label}</div>
      <div className={`mt-0.5 tabular-nums ${emphasis ? 'text-lg font-semibold' : 'text-base font-medium'}`} style={{ color: 'var(--color-text)' }}>{value}</div>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-xs font-medium ${className ?? ''}`} style={{ color: 'var(--color-text-tertiary)' }}>{children}</th>
}

function StatusBadge({ settled, t }: { settled: boolean; t: ReturnType<typeof useLang>['t'] }) {
  const color = settled ? 'var(--color-success)' : 'var(--color-warning)'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: 'var(--color-border)', color }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {settled ? t.payrollStatusSettled : t.payrollStatusOpen}
    </span>
  )
}
