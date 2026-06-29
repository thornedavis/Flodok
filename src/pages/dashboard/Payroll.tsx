// Payroll — the dedicated monthly payroll surface (Phase 5).
//
// Organises every employee's pay for a selected month (base + allowances +
// adjustments → payout) and replaces the silent month-end cron with an
// explicit "Freeze & Run Payroll" action. Reads via preview_payroll (live for
// open employees, frozen snapshot for settled ones); the run freezes the whole
// org for the period through run_payroll. Owner/admin only — the RPCs enforce
// this server-side; the page guards the UI.

import { Fragment, useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { currentPeriodMonth, formatIdr } from '../../lib/credits'
import { MonthStrip } from '../../components/portal/MonthStrip'
import { useFullWidthLayout } from '../../components/Layout'
import { downloadPayslipPdf, downloadAllPayslipsZip, type PayslipData } from '../../lib/payslipPdf'
import type { User } from '../../types/aliases'

// Full-width canvas shell (matches the Performance page): the page renders
// edge-to-edge via useFullWidthLayout so the month-picker band can span the
// full width; each section re-constrains its content with SHELL_PAD + SHELL_INNER.
const SHELL_PAD = 'px-6 md:px-10'
const SHELL_INNER = 'mx-auto max-w-6xl'

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

type PayrollLine = {
  line_type: 'base' | 'allowance' | 'adjustment' | string
  name: string
  kind: string
  is_fixed: boolean
  amount_idr: number
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
  // Render edge-to-edge so the month-picker band spans the full page width.
  useFullWidthLayout()

  const current = currentPeriodMonth()
  const [period, setPeriod] = useState(current)
  const [data, setData] = useState<PayrollPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [payslipBusy, setPayslipBusy] = useState<string | null>(null)
  // Row-expand: which employees are expanded, and their lazily-loaded line
  // breakdowns (keyed by employee id, reset whenever the period changes).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lines, setLines] = useState<Record<string, PayrollLine[] | 'loading'>>({})
  const [zipBusy, setZipBusy] = useState(false)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    setError('')
    setExpanded(new Set())
    setLines({})
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

  async function handleDownloadAll() {
    if (!data || zipBusy) return
    const settled = data.rows.filter(r => r.settled)
    if (settled.length === 0) return
    setZipBusy(true)
    setError('')
    setZipProgress({ done: 0, total: settled.length })
    try {
      const results = await Promise.all(
        settled.map(r => supabase.rpc('admin_payslip', { p_employee_id: r.employee_id, p_period: period })),
      )
      const payslips = results.map(res => res.data).filter(Boolean) as unknown as PayslipData[]
      await downloadAllPayslipsZip(payslips, lang, period, (done, total) => setZipProgress({ done, total }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch payslip failed')
    } finally {
      setZipBusy(false)
      setZipProgress(null)
    }
  }

  async function toggleExpand(employeeId: string) {
    const next = new Set(expanded)
    if (next.has(employeeId)) {
      next.delete(employeeId)
      setExpanded(next)
      return
    }
    next.add(employeeId)
    setExpanded(next)
    if (lines[employeeId]) return // already loaded
    setLines(prev => ({ ...prev, [employeeId]: 'loading' }))
    const { data: res } = await supabase.rpc('admin_payroll_lines', { p_employee_id: employeeId, p_period: period })
    setLines(prev => ({ ...prev, [employeeId]: (res as unknown as PayrollLine[]) ?? [] }))
  }

  if (!isAdmin) {
    return (
      <div className={`${SHELL_PAD} pt-8`}>
        <div className={SHELL_INNER}>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.payrollAdminOnly}</p>
        </div>
      </div>
    )
  }

  const counts = data?.counts
  const canRun = (counts?.open ?? 0) > 0

  return (
    <div className="pb-20">
      {/* Header + run action — re-constrained within the full-width canvas. */}
      <div className={`${SHELL_PAD} pt-8 pb-5`}>
        <div className={SHELL_INNER}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.payrollTitle}</h1>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.payrollSubtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              {flash && <span className="text-xs font-medium" style={{ color: 'var(--color-success)' }}>{flash}</span>}
              {(counts?.settled ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={zipBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {zipBusy ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  )}
                  {zipBusy && zipProgress ? t.payrollDownloadingAll(zipProgress.done, zipProgress.total) : t.payrollDownloadAll}
                </button>
              )}
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
        </div>
      </div>

      {/* Month picker — a full-bleed band framing the period selection,
          mirroring the Performance page. Edge-to-edge surface, re-constrained inner column. */}
      <section
        className="border-y py-3"
        style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
      >
        <div className={SHELL_PAD}>
          <div className={SHELL_INNER}>
            <MonthStrip
              selectedMonth={period}
              earliestMonth={monthsAgo(current, 11)}
              currentMonth={current}
              onSelect={setPeriod}
              lang={lang}
            />
          </div>
        </div>
      </section>

      {/* Body — summary + roster, re-constrained. */}
      <div className={`${SHELL_PAD} pt-5`}>
        <div className={SHELL_INNER}>
          {/* Summary */}
          {counts && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label={t.payrollTotalPayout} value={formatIdr(data?.total_payout_idr ?? 0, lang)} emphasis />
          <SummaryStat label={t.payrollSettledCount} value={String(counts.settled)} />
          <SummaryStat label={t.payrollOpenCount} value={String(counts.open)} />
          {counts.no_contract > 0 && <SummaryStat label={t.payrollNoContractCount} value={String(counts.no_contract)} warn />}
        </div>
      )}

      {error && <p className="mt-4 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {/* Reconciliation note — only when this period actually carries adjustments,
          so the operator keying the payroll provider doesn't double-count them. */}
      {data?.rows.some(r => r.adjustment_net_idr !== 0) && (
        <div
          className="mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))', color: 'var(--color-text-secondary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: 'var(--color-text-tertiary)' }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          <span>{t.payrollReconcileNote}</span>
        </div>
      )}

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
            {!loading && data?.rows.map(r => {
              const isOpen = expanded.has(r.employee_id)
              return (
                <Fragment key={r.employee_id}>
                  <tr className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => toggleExpand(r.employee_id)} className="flex items-start gap-2 text-left">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', color: 'var(--color-text-tertiary)' }}><polyline points="9 18 15 12 9 6" /></svg>
                        <span>
                          <span className="block font-medium" style={{ color: 'var(--color-text)' }}>{r.name}</span>
                          {!r.has_active_contract && (
                            <span className="block text-[11px]" style={{ color: 'var(--color-warning)' }}>{t.payrollNoContract}</span>
                          )}
                        </span>
                      </button>
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
                            className="inline-flex items-center gap-1 text-xs font-medium disabled:opacity-50"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            {payslipBusy === r.employee_id ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            )}
                            {t.payrollPayslip}
                          </button>
                        )}
                        <StatusBadge settled={r.settled} t={t} />
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
                      <td colSpan={6} className="px-3 pb-3 pt-0">
                        <PayrollBreakdown lines={lines[r.employee_id]} t={t} lang={lang} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
        </div>
      </div>
    </div>
  )
}

function PayrollBreakdown({ lines, t, lang }: { lines: PayrollLine[] | 'loading' | undefined; t: ReturnType<typeof useLang>['t']; lang: 'en' | 'id' }) {
  if (lines === undefined || lines === 'loading') {
    return <div className="py-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
  }
  if (lines.length === 0) {
    return <div className="py-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.payrollNoBreakdown}</div>
  }
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <div className="space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {l.name}
              {l.line_type === 'allowance' && (
                <span className="ml-1.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{l.is_fixed ? t.payCompFixed : t.payCompVariable}</span>
              )}
            </span>
            <span className="tabular-nums" style={{ color: l.amount_idr < 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>{formatIdr(l.amount_idr, lang)}</span>
          </div>
        ))}
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
