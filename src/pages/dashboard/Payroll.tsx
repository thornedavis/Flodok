// Payroll — the dedicated monthly payroll surface (Phase 5).
//
// Organises every employee's pay for a selected month (base + allowances +
// adjustments → payout) and replaces the silent month-end cron with an
// explicit "Freeze & Run Payroll" action. Reads via preview_payroll (live for
// open employees, frozen snapshot for settled ones); the run freezes the whole
// org for the period through run_payroll. Owner/admin only — the RPCs enforce
// this server-side; the page guards the UI.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { currentPeriodMonth, formatIdr } from '../../lib/credits'
import { MonthStrip } from '../../components/portal/MonthStrip'
import { useFullWidthLayout } from '../../components/Layout'
import { FilterPanel, FilterSearchInput, type FilterPanelSection } from '../../components/FilterControls'
import { Modal } from '../../components/Modal'
import {
  StatCard, TrendCard, ChartCard, LegendDot, CHART_TOOLTIP, compactIdr,
  monthShort, monthLong, monthsAgo, CHART_BLUE, CHART_GREEN, CHART_RED, type TrendPoint,
} from '../../components/Metrics'
import { getAvatarGradient } from '../../lib/avatar'
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
  // Org-wide gross adjustment split for the period: bonuses ≥ 0, deductions ≤ 0
  // (signed). Computed server-side because the per-row figure is only the net.
  total_bonus_idr: number
  total_deduction_idr: number
  counts: { total: number; settled: number; open: number; no_contract: number }
}

type PayrollLine = {
  line_type: 'base' | 'allowance' | 'adjustment' | string
  name: string
  kind: string
  is_fixed: boolean
  amount_idr: number
}

const TREND_MONTHS = 6

type PayrollView = 'list' | 'cards'
type PayrollSort = 'name' | 'payout' | 'adjustment'
const VIEW_STORAGE_KEY = 'flodok-payroll-view'

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
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [payslipBusy, setPayslipBusy] = useState<string | null>(null)
  // Row-expand: which employees are expanded, and their lazily-loaded line
  // breakdowns (keyed by employee id, reset whenever the period changes).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lines, setLines] = useState<Record<string, PayrollLine[] | 'loading'>>({})
  const [zipBusy, setZipBusy] = useState(false)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  // Analytics: the last few months of org totals (for the "vs last month" tile
  // and the expandable charts), plus whether the chart panel is open.
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)
  // Roster controls: view (persisted), free-text search, filters and sort.
  const [view, setView] = useState<PayrollView>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null
    return stored === 'cards' || stored === 'list' ? stored : 'list'
  })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [contractFilter, setContractFilter] = useState<string[]>([])
  const [sort, setSort] = useState<PayrollSort>('name')

  const setViewPersisted = useCallback((next: PayrollView) => {
    setView(next)
    try { localStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

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

  // Trend is non-critical: failures (e.g. migration not yet applied) just leave
  // the comparison tile and charts in their "no data" state — never block the page.
  const loadTrend = useCallback(async (p: string) => {
    setTrend(null)
    const { data: res, error: rpcError } = await supabase.rpc('payroll_trend', { p_period: p, p_months: TREND_MONTHS })
    setTrend(rpcError ? [] : ((res as unknown as TrendPoint[]) ?? []))
  }, [])

  useEffect(() => {
    if (isAdmin) {
      load(period)
      loadTrend(period)
    }
  }, [period, isAdmin, load, loadTrend])

  // Invoked from the confirmation modal (which carries the info + irreversibility
  // warning + acknowledgement). On success it closes the modal and reloads.
  async function handleRun() {
    if (!data || running) return
    if (data.counts.open === 0) return
    setRunning(true)
    setError('')
    const { data: res, error: rpcError } = await supabase.rpc('run_payroll', { p_period: period })
    setRunning(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    const ran = (res as { employees_run?: number } | null)?.employees_run ?? 0
    setRunModalOpen(false)
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

  // Counts power the filter option badges; filteredRows applies search + filters
  // + sort to the roster (both views render from it).
  const statusCounts = useMemo(() => {
    const c = { open: 0, frozen: 0 }
    data?.rows.forEach(r => { if (r.settled) c.frozen++; else c.open++ })
    return c
  }, [data])
  const contractCounts = useMemo(() => {
    const c = { active: 0, none: 0 }
    data?.rows.forEach(r => { if (r.has_active_contract) c.active++; else c.none++ })
    return c
  }, [data])
  const filteredRows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const rows = data.rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q)) return false
      if (statusFilter.length && !statusFilter.includes(r.settled ? 'frozen' : 'open')) return false
      if (contractFilter.length && !contractFilter.includes(r.has_active_contract ? 'active' : 'none')) return false
      return true
    })
    return [...rows].sort((a, b) => {
      if (sort === 'payout') return b.payout_idr - a.payout_idr
      if (sort === 'adjustment') return b.adjustment_net_idr - a.adjustment_net_idr
      return a.name.localeCompare(b.name)
    })
  }, [data, search, statusFilter, contractFilter, sort])

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
  const hasRows = !!data && data.rows.length > 0

  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect', key: 'status', label: t.payrollFilterStatus, value: statusFilter, onChange: setStatusFilter,
      options: [
        { id: 'open', label: t.payrollStatusOpen, count: statusCounts.open },
        { id: 'frozen', label: t.payrollStatusSettled, count: statusCounts.frozen },
      ],
    },
    {
      type: 'multiselect', key: 'contract', label: t.payrollFilterContract, value: contractFilter, onChange: setContractFilter,
      options: [
        { id: 'active', label: t.payrollContractActive, count: contractCounts.active },
        { id: 'none', label: t.payrollNoContract, count: contractCounts.none },
      ],
    },
    {
      type: 'select', key: 'sort', label: t.sortLabel, value: sort, defaultValue: 'name', onChange: v => setSort(v as PayrollSort),
      options: [
        { id: 'name', label: t.payrollSortName },
        { id: 'payout', label: t.payrollSortPayoutDesc },
        { id: 'adjustment', label: t.payrollSortAdjustment },
      ],
    },
  ]
  const resetFilters = () => { setStatusFilter([]); setContractFilter([]); setSort('name'); setSearch('') }

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
                onClick={() => setRunModalOpen(true)}
                disabled={!canRun || running || loading}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
                title={!canRun ? t.payrollNothingToRun : undefined}
              >
                {t.payrollRunButton}
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
          {/* Summary — bonuses & deductions explain the headline payout; the
              trend tile compares this month to last and opens the charts. */}
          {data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label={t.payrollTotalPayout} value={formatIdr(data.total_payout_idr, lang)} emphasis />
              <StatCard label={t.payrollTotalBonus} value={formatIdr(data.total_bonus_idr ?? 0, lang)} tone="success" />
              <StatCard label={t.payrollTotalDeduction} value={formatIdr(data.total_deduction_idr ?? 0, lang)} tone="danger" />
              <TrendCard
                values={trend ? trend.map(p => p.total_payout_idr) : null}
                label={t.payrollVsLastMonth}
                newLabel={t.payrollTrendNew}
                open={analyticsOpen}
                onToggle={() => setAnalyticsOpen(o => !o)}
              />
            </div>
          )}

          {/* Analytics — charts expand inline beneath the summary cards. */}
          {data && analyticsOpen && <AnalyticsPanel trend={trend} t={t} lang={lang} />}

      {/* The page-level error only surfaces when the run modal is closed; while
          it's open the modal owns the error display. */}
      {error && !runModalOpen && <p className="mt-4 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {/* The adjustments/double-count note now lives in the run-confirmation
          modal, surfaced at the moment of the irreversible action. */}

      {/* Roster controls — view toggle, filter, search. Quick-filter chips are
          intentionally omitted (unlike the Performance page). */}
      {hasRows && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ViewToggle view={view} onChange={setViewPersisted} t={t} />
          <FilterPanel triggerLabel={t.filterButtonLabel} sections={filterSections} onReset={resetFilters} />
          <div className="ml-auto w-full sm:w-56">
            <FilterSearchInput value={search} onChange={setSearch} placeholder={t.performanceSearchPlaceholder} />
          </div>
        </div>
      )}

      {/* Roster */}
      {loading ? (
        <RosterMessage>{t.loading}</RosterMessage>
      ) : !hasRows ? (
        <RosterMessage>{t.payrollEmpty}</RosterMessage>
      ) : filteredRows.length === 0 ? (
        <RosterMessage>{t.payrollNoMatches}</RosterMessage>
      ) : view === 'cards' ? (
        <ul className="mt-4 grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map(r => (
            <PayrollCard
              key={r.employee_id}
              r={r}
              isOpen={expanded.has(r.employee_id)}
              onToggle={toggleExpand}
              lines={lines[r.employee_id]}
              onPayslip={handlePayslip}
              payslipBusy={payslipBusy}
              t={t}
              lang={lang}
            />
          ))}
        </ul>
      ) : (
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
            {filteredRows.map(r => {
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
      )}
        </div>
      </div>

      <PayrollRunModal
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
        monthLabel={monthLong(period, lang)}
        openCount={counts?.open ?? 0}
        running={running}
        error={error}
        onConfirm={handleRun}
        t={t}
      />
    </div>
  )
}

function RosterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border px-3 py-6 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
      {children}
    </div>
  )
}

// Confirmation for the irreversible "Freeze & run". Carries the adjustments note
// (moved off the page), an explicit can't-be-undone warning, and a required
// acknowledgement before the primary action enables.
function PayrollRunModal({ open, onClose, monthLabel, openCount, running, error, onConfirm, t }: {
  open: boolean
  onClose: () => void
  monthLabel: string
  openCount: number
  running: boolean
  error: string
  onConfirm: () => void
  t: ReturnType<typeof useLang>['t']
}) {
  const [ack, setAck] = useState(false)
  // Re-arm the acknowledgement every time the modal opens.
  useEffect(() => { if (open) setAck(false) }, [open])

  return (
    <Modal open={open} onClose={running ? () => undefined : onClose} title={t.payrollRunButton}>
      <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <p>{t.payrollRunModalIntro(monthLabel, openCount)}</p>

        {/* Adjustments / double-count note (previously a page banner). */}
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))', color: 'var(--color-text-secondary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: 'var(--color-text-tertiary)' }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          <span>{t.payrollReconcileNote}</span>
        </div>

        {/* Irreversibility warning. */}
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-warning)', backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)', color: 'var(--color-text)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: 'var(--color-warning)' }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span>{t.payrollRunModalWarning}</span>
        </div>

        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} disabled={running} className="mt-0.5" />
          <span className="text-xs" style={{ color: 'var(--color-text)' }}>{t.payrollRunModalAck}</span>
        </label>

        {error && (
          <div className="rounded-md border p-2 text-xs" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ack || running}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {running && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
            {running ? t.payrollRunning : t.payrollRunButton}
          </button>
        </div>
      </div>
    </Modal>
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


// ─── Roster controls: view toggle + card view ───────────────────────────────

function ViewToggle({ view, onChange, t }: {
  view: PayrollView
  onChange: (next: PayrollView) => void
  t: ReturnType<typeof useLang>['t']
}) {
  const items: Array<{ key: PayrollView; label: string; icon: React.ReactNode }> = [
    {
      key: 'cards',
      label: t.viewCards,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      key: 'list',
      label: t.viewList,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
  ]
  return (
    <div role="group" className="inline-flex items-center rounded-full border p-0.5" style={{ borderColor: 'var(--color-border)' }}>
      {items.map(item => {
        const active = view === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            title={item.label}
            className="flex items-center justify-center rounded-full p-1.5 transition-colors"
            style={{
              backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}

function PayrollCard({ r, isOpen, onToggle, lines, onPayslip, payslipBusy, t, lang }: {
  r: PayrollRow
  isOpen: boolean
  onToggle: (employeeId: string) => void
  lines: PayrollLine[] | 'loading' | undefined
  onPayslip: (employeeId: string) => void
  payslipBusy: string | null
  t: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
}) {
  return (
    <li className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
      <button type="button" onClick={() => onToggle(r.employee_id)} className="w-full p-3 text-left">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full" style={{ background: r.photo_url ? 'transparent' : getAvatarGradient(r.employee_id) }}>
            {r.photo_url && <img src={r.photo_url} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{r.name}</p>
            {!r.has_active_contract && <p className="truncate text-[11px]" style={{ color: 'var(--color-warning)' }}>{t.payrollNoContract}</p>}
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', color: 'var(--color-text-tertiary)' }}><polyline points="9 18 15 12 9 6" /></svg>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          <CardFigure label={t.payrollColBase} value={formatIdr(r.base_idr, lang)} />
          <CardFigure label={t.payrollColAllowance} value={formatIdr(r.allowance_idr, lang)} />
          <CardFigure label={t.payrollColAdjustments} value={r.adjustment_net_idr === 0 ? '—' : formatIdr(r.adjustment_net_idr, lang)} tone={r.adjustment_net_idr < 0 ? 'danger' : undefined} />
          <CardFigure label={t.payrollColPayout} value={formatIdr(r.payout_idr, lang)} emphasis />
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <StatusBadge settled={r.settled} t={t} />
        {r.settled && (
          <button
            type="button"
            onClick={() => onPayslip(r.employee_id)}
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
      </div>
      {isOpen && (
        <div className="border-t px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
          <PayrollBreakdown lines={lines} t={t} lang={lang} />
        </div>
      )}
    </li>
  )
}

function CardFigure({ label, value, emphasis, tone }: { label: string; value: string; emphasis?: boolean; tone?: 'danger' }) {
  const color = tone === 'danger' ? 'var(--color-danger)' : 'var(--color-text)'
  return (
    <div className="min-w-0">
      <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className={`truncate tabular-nums ${emphasis ? 'text-sm font-semibold' : 'text-xs font-medium'}`} style={{ color }}>{value}</div>
    </div>
  )
}

// ─── Analytics: expandable charts panel (payroll-specific) ──────────────────

function AnalyticsPanel({ trend, t, lang }: {
  trend: TrendPoint[] | null
  t: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
}) {
  if (trend === null) {
    return (
      <div className="mt-4 flex h-32 items-center justify-center rounded-xl border text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
        {t.loading}
      </div>
    )
  }
  if (trend.length < 2) {
    return (
      <div className="mt-4 flex h-24 items-center justify-center rounded-xl border text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
        {t.payrollTrendUnavailable}
      </div>
    )
  }
  const chartData = trend.map(p => ({
    label: monthShort(p.period, lang),
    payout: p.total_payout_idr,
    bonus: p.total_bonus_idr,
    deduction: p.total_deduction_idr,
  }))
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title={t.payrollChartPayoutTitle}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={v => compactIdr(v as number, lang)} />
            <Tooltip cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }} contentStyle={CHART_TOOLTIP} labelStyle={{ color: 'var(--color-text)' }} formatter={value => [formatIdr(value as number, lang), t.payrollTotalPayout]} />
            <Bar dataKey="payout" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard
        title={t.payrollChartAdjustmentsTitle}
        legend={
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            <LegendDot color={CHART_GREEN} label={t.payrollChartBonus} />
            <LegendDot color={CHART_RED} label={t.payrollChartDeduction} />
          </div>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={v => compactIdr(v as number, lang)} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Tooltip cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }} contentStyle={CHART_TOOLTIP} labelStyle={{ color: 'var(--color-text)' }} formatter={(value, name) => [formatIdr(value as number, lang), name === 'bonus' ? t.payrollChartBonus : t.payrollChartDeduction]} />
            <Bar dataKey="bonus" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
            <Bar dataKey="deduction" fill={CHART_RED} radius={[0, 0, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
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
