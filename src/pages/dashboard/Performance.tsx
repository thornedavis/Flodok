import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { Modal } from '../../components/Modal'
import { getAvatarGradient } from '../../lib/avatar'
import { formatIdr, currentPeriodMonth } from '../../lib/credits'
import { BadgeGlyph } from '../../components/BadgeGlyph'
import { Skeleton } from '../../components/Skeleton'
import { FilterPill, FilterPanel, FilterSearchInput, MultiSelectDropdown, type FilterPanelSection } from '../../components/FilterControls'
import { StatCard, TrendCard, ChartCard, LegendDot, CHART_TOOLTIP, compactIdr, monthShort, CHART_GREEN, CHART_RED, type TrendPoint } from '../../components/Metrics'
import { PayAdjustmentModal } from '../../components/employee/PayAdjustmentModal'
import { MonthStrip } from '../../components/portal/MonthStrip'
import { ActionsMenuButton } from '../../components/ActionsMenuButton'
import { useFullWidthLayout } from '../../components/Layout'
import { useBilling } from '../../contexts/BillingContext'
import type { User, AchievementDefinition } from '../../types/aliases'

type RosterRow = {
  employee_id: string
  name: string
  photo_url: string | null
  departments: string[]
  adjustment_idr: number
  adjustment_frozen: boolean
  achievements_count: number
  top_achievements: Array<{ name: string; icon: string | null; unlocked_at: string }>
  // Attached client-side from the employees lifecycle lookup + contract hours.
  lifecycle_stage?: 'active' | 'separated'
  xp?: number
}

type Roster = {
  period_month: string | null
  rows: RosterRow[]
}

type PayMode = 'reward' | 'penalise'
type PeriodKind = 'month' | 'all'
type SortKey = 'name' | 'adjustment' | 'badges' | 'recent' | 'xp'
type Lens = 'frozen' | 'negative' | 'nobadges'
type PerfView = 'cards' | 'list'
type ColumnKey = 'department' | 'status' | 'adjustment' | 'badges' | 'xp'

const VIEW_KEY = 'flodok-performance-view'
const COLUMNS_KEY = 'flodok-performance-columns'
const COLUMN_ORDER: ColumnKey[] = ['department', 'status', 'adjustment', 'badges', 'xp']
const DEFAULT_COLUMNS: ColumnKey[] = ['department', 'adjustment', 'badges']

// Full-width canvas shell. The page renders edge-to-edge (useFullWidthLayout)
// so the month-picker band can span the full content width; the header,
// toolbar, and roster re-constrain themselves with these — the same pattern
// the Documents page uses for its "Start a new document" band.
const SHELL_PAD = 'px-6 md:px-10'
const SHELL_INNER = 'mx-auto max-w-6xl'

function loadView(): PerfView {
  if (typeof window === 'undefined') return 'cards'
  return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'
}

function loadColumns(): Set<ColumnKey> {
  if (typeof window === 'undefined') return new Set(DEFAULT_COLUMNS)
  try {
    const saved = window.localStorage.getItem(COLUMNS_KEY)
    if (!saved) return new Set(DEFAULT_COLUMNS)
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return new Set(DEFAULT_COLUMNS)
    return new Set(parsed.filter((c): c is ColumnKey => COLUMN_ORDER.includes(c as ColumnKey)))
  } catch { return new Set(DEFAULT_COLUMNS) }
}

function columnLabel(key: ColumnKey, t: ReturnType<typeof useLang>['t']): string {
  switch (key) {
    case 'department': return t.performanceFilterDepartment
    case 'status': return t.performanceFilterStatus
    case 'adjustment': return t.performanceStatAdjustments
    case 'badges': return t.empNavAchievements
    case 'xp': return t.portalExperience
  }
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

function signedIdr(idr: number, lang: 'en' | 'id'): string {
  return `${idr > 0 ? '+' : idr < 0 ? '−' : ''}${formatIdr(Math.abs(idr), lang)}`
}

export function Performance({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const { canWrite } = useBilling()
  const navigate = useNavigate()

  // Render edge-to-edge so the month-picker band can span the full content
  // width; the sections below re-constrain with SHELL_PAD + SHELL_INNER.
  useFullWidthLayout()
  const [roster, setRoster] = useState<Roster | null>(null)
  const [loading, setLoading] = useState(true)
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([])

  // Org feature flags + cap.
  const [badgesEnabled, setBadgesEnabled] = useState(true)
  const [adjustmentsEnabled, setAdjustmentsEnabled] = useState(true)
  const [maxAdjustmentIdr, setMaxAdjustmentIdr] = useState<number | null>(null)

  // Period navigation. offset 0 = current month; negative = past months. The
  // server is the source of truth for "current period" (Asia/Jakarta), so we
  // capture it from the first load and shift relative to it.
  const [baseCurrent] = useState(() => currentPeriodMonth())
  const [selectedMonth, setSelectedMonth] = useState(baseCurrent)
  const [earliestMonth, setEarliestMonth] = useState(baseCurrent)
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month')
  const isCurrentPeriod = selectedMonth === baseCurrent
  // Rewards/penalties can only be applied to the live, current month.
  const canAct = periodKind === 'month' && isCurrentPeriod

  // Card vs line view (persisted).
  const [view, setView] = useState<PerfView>(loadView)
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, view)
  }, [view])

  // Configurable table columns (list view), persisted.
  const [columns, setColumns] = useState<Set<ColumnKey>>(loadColumns)
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(COLUMNS_KEY, JSON.stringify([...columns]))
  }, [columns])
  const visibleColumns = COLUMN_ORDER.filter(k => columns.has(k))

  // Filters.
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>('name')
  const [lenses, setLenses] = useState<Set<Lens>>(new Set())

  // Analytics: recent monthly recognition totals (rewards/penalties) for the
  // "vs last month" tile + charts. Reuses the payroll_trend RPC — its bonus
  // (positive) / deduction (negative) splits are exactly rewards / penalties.
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  // Period-scoped recognition signal (org-wide), for the dashboard cards.

  // Action modals.
  const [payAction, setPayAction] = useState<{ row: RosterRow; mode: PayMode } | null>(null)
  const [badgeAction, setBadgeAction] = useState<RosterRow | null>(null)

  async function loadRoster() {
    setLoading(true)
    const allTime = periodKind === 'all'
    const target = !allTime && !isCurrentPeriod ? selectedMonth : null
    const rpcArgs: { target_period_month?: string; all_time?: boolean } =
      allTime ? { all_time: true } : (target ? { target_period_month: target } : {})
    const [{ data: rosterData }, { data: empRows }, { data: contractRows }] = await Promise.all([
      supabase.rpc('admin_rewards_roster', rpcArgs),
      supabase
        .from('employees')
        .select('id, lifecycle_stage, created_at')
        .eq('org_id', user.org_id)
        .in('lifecycle_stage', ['active', 'separated']),
      supabase
        .from('contracts')
        .select('employee_id, hours_per_day, days_per_week')
        .eq('org_id', user.org_id)
        .eq('status', 'active'),
    ])
    const stageById = new Map((empRows ?? []).map(e => [e.id, e.lifecycle_stage as 'active' | 'separated']))
    const createdById = new Map((empRows ?? []).map(e => [e.id, e.created_at]))
    const hoursById = new Map((contractRows ?? []).map(c => [c.employee_id, (c.hours_per_day ?? 0) * (c.days_per_week ?? 0)]))
    // Bound the month strip at the earliest employee start month.
    const createdMonths = (empRows ?? []).map(e => e.created_at.slice(0, 7) + '-01')
    if (createdMonths.length) setEarliestMonth(createdMonths.reduce((a, b) => (a < b ? a : b)))
    const now = Date.now()
    const raw = rosterData as unknown as Roster | null
    if (raw) {
      raw.rows = raw.rows
        .filter(r => stageById.has(r.employee_id))
        .map(r => {
          const created = createdById.get(r.employee_id)
          const days = created ? Math.max(0, Math.floor((now - new Date(created).getTime()) / 86400000)) : 0
          const xp = Math.floor((days / 7) * (hoursById.get(r.employee_id) ?? 0))
          return { ...r, lifecycle_stage: stageById.get(r.employee_id), xp }
        })
    }
    setRoster(raw ?? null)
    setLoading(false)
  }

  async function loadDefinitions() {
    const { data } = await supabase
      .from('achievement_definitions')
      .select('*')
      .eq('org_id', user.org_id)
      .eq('is_active', true)
      .order('name')
    setDefinitions(data || [])
  }

  async function loadOrgFlags() {
    const { data } = await supabase
      .from('organizations')
      .select('badges_enabled, credits_enabled, max_bonus_idr')
      .eq('id', user.org_id)
      .single()
    setBadgesEnabled(data?.badges_enabled ?? true)
    setAdjustmentsEnabled(data?.credits_enabled ?? true)
    setMaxAdjustmentIdr(data?.max_bonus_idr ?? null)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadDefinitions(); loadOrgFlags() }, [user.org_id])
  // Reload the roster whenever the org, selected month, or period kind changes.
  useEffect(() => {
    loadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.org_id, selectedMonth, periodKind])

  // Recent recognition trend. In all-time mode there's no single period to
  // compare, so the tile/charts anchor to the current month either way.
  const trendPeriod = periodKind === 'all' ? baseCurrent : selectedMonth
  useEffect(() => {
    let cancelled = false
    setTrend(null)
    supabase.rpc('payroll_trend', { p_period: trendPeriod, p_months: 6 }).then(({ data, error }) => {
      if (!cancelled) setTrend(error ? [] : ((data as unknown as TrendPoint[]) ?? []))
    })
    return () => { cancelled = true }
  }, [trendPeriod])

  function refreshAfterAction() {
    setPayAction(null)
    setBadgeAction(null)
    loadRoster()
  }

  // Clicking an employee opens their dedicated Performance page.
  function openEmployee(employeeId: string) {
    navigate(`/dashboard/performance/${employeeId}`)
  }

  // Department options (from the full roster), with counts.
  const deptOptions = useMemo(() => {
    if (!roster) return [] as Array<{ id: string; label: string; count: number }>
    const counts = new Map<string, number>()
    for (const r of roster.rows) for (const d of r.departments) counts.set(d, (counts.get(d) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, count]) => ({ id, label: id, count }))
  }, [roster])

  const statusCounts = useMemo(() => {
    const c = { active: 0, separated: 0 }
    for (const r of roster?.rows ?? []) if (r.lifecycle_stage) c[r.lifecycle_stage]++
    return c
  }, [roster])

  // Org-wide recognition summary for the info-box cards (current roster scope:
  // the selected month, or all-time). Coverage is over active employees only.
  const summary = useMemo(() => {
    const rows = roster?.rows ?? []
    let rewards = 0
    let penalties = 0
    for (const r of rows) {
      if (r.adjustment_idr > 0) rewards += r.adjustment_idr
      else if (r.adjustment_idr < 0) penalties += r.adjustment_idr
    }
    const active = rows.filter(r => r.lifecycle_stage === 'active')
    const recognized = active.filter(r => r.adjustment_idr > 0).length
    return { rewards, penalties, recognized, activeCount: active.length }
  }, [roster])

  const filtered = useMemo(() => {
    if (!roster) return []
    const q = search.trim().toLowerCase()
    const depts = new Set(deptFilter)
    const stages = new Set(statusFilter)
    let rows = roster.rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q) && !r.departments.some(d => d.toLowerCase().includes(q))) return false
      if (depts.size && !r.departments.some(d => depts.has(d))) return false
      if (stages.size && (!r.lifecycle_stage || !stages.has(r.lifecycle_stage))) return false
      if (lenses.has('frozen') && !r.adjustment_frozen) return false
      if (lenses.has('negative') && !(r.adjustment_idr < 0)) return false
      if (lenses.has('nobadges') && r.achievements_count > 0) return false
      return true
    })
    const recency = (r: RosterRow) => r.top_achievements.reduce((m, b) => (b.unlocked_at > m ? b.unlocked_at : m), '')
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'adjustment': return b.adjustment_idr - a.adjustment_idr
        case 'badges': return b.achievements_count - a.achievements_count
        case 'xp': return (b.xp ?? 0) - (a.xp ?? 0)
        case 'recent': return recency(b).localeCompare(recency(a))
        default: return a.name.localeCompare(b.name)
      }
    })
    return rows
  }, [roster, search, deptFilter, statusFilter, lenses, sort])

  function toggleLens(l: Lens) {
    setLenses(prev => {
      const next = new Set(prev)
      if (next.has(l)) next.delete(l); else next.add(l)
      return next
    })
  }

  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect', key: 'status', label: t.performanceFilterStatus, value: statusFilter, onChange: setStatusFilter,
      options: [
        { id: 'active', label: t.derivedStatusActive, count: statusCounts.active },
        { id: 'separated', label: t.derivedStatusSeparated, count: statusCounts.separated },
      ],
    },
    {
      type: 'multiselect', key: 'department', label: t.performanceFilterDepartment, value: deptFilter, onChange: setDeptFilter,
      options: deptOptions,
    },
    {
      type: 'select', key: 'sort', label: t.sortLabel, value: sort, defaultValue: 'name',
      onChange: v => setSort(v as SortKey),
      options: [
        { id: 'name', label: t.performanceSortName },
        { id: 'adjustment', label: t.performanceSortAdjustmentDesc },
        { id: 'badges', label: t.performanceSortBadgesDesc },
        { id: 'recent', label: t.performanceSortRecent },
      ],
    },
  ]

  function resetFilters() {
    setDeptFilter([]); setStatusFilter([]); setSort('name'); setLenses(new Set())
  }

  if (!isAdmin) {
    return (
      <div className={`${SHELL_PAD} pt-8`}>
        <div className={SHELL_INNER}>
          <p className="max-w-2xl text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.adminOnlyHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Header — re-constrained within the full-width canvas. */}
      <div className={`${SHELL_PAD} pt-8 pb-5`}>
        <div className={SHELL_INNER}>
          <header>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.performanceTitle}</h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.performanceSubtitle}</p>
          </header>
        </div>
      </div>

      {/* Month picker — a full-bleed band that frames the period selection,
          mirroring the Documents "Start a new document" band: an edge-to-edge
          surface with a re-constrained inner column. Picking a month from the
          strip drops back into month mode. */}
      <section
        className="border-y py-3"
        style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
      >
        <div className={SHELL_PAD}>
          <div className={SHELL_INNER}>
            <MonthStrip
              selectedMonth={selectedMonth}
              earliestMonth={earliestMonth}
              currentMonth={baseCurrent}
              onSelect={month => { setSelectedMonth(month); setPeriodKind('month') }}
              lang={lang}
              muted={periodKind === 'all'}
              trailing={<PeriodKindToggle value={periodKind} onChange={setPeriodKind} t={t} />}
            />
          </div>
        </div>
      </section>

      {/* Toolbar + roster — re-constrained. */}
      <div className={`${SHELL_PAD} pt-5`}>
        <div className={SHELL_INNER}>
          {/* Recognition summary — rewards/penalties/coverage + a vs-last-month
              tile that expands to the trend charts. */}
          {roster && (
            <div className="mb-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label={t.performanceTotalRewards} value={formatIdr(summary.rewards, lang)} tone="success" />
                <StatCard label={t.performanceTotalPenalties} value={formatIdr(summary.penalties, lang)} tone="danger" />
                <StatCard
                  label={t.performanceStatCoverage}
                  value={t.performanceCoverageValue(summary.recognized, summary.activeCount)}
                  hint={t.performanceCoverageHint}
                />
                <TrendCard
                  values={trend ? trend.map(p => p.total_bonus_idr) : null}
                  label={t.performanceVsLastMonth}
                  newLabel={t.payrollTrendNew}
                  open={analyticsOpen}
                  onToggle={() => setAnalyticsOpen(o => !o)}
                />
              </div>
              {analyticsOpen && <PerformanceAnalyticsPanel trend={trend} t={t} lang={lang} />}
            </div>
          )}

          {/* Filter toolbar */}
          <div className="sticky top-0 z-10 -mx-4 mb-3 bg-opacity-90 px-4 pb-2 pt-2 backdrop-blur" style={{ backgroundColor: 'var(--color-bg)' }}>
            <div className="flex w-full flex-wrap items-center gap-2">
              <ViewToggle view={view} onChange={setView} t={t} />
              <FilterPanel triggerLabel={t.filterButtonLabel} sections={filterSections} onReset={resetFilters} />
              {view === 'list' && (
                <MultiSelectDropdown
                  label={t.columnsButtonLabel}
                  value={[...columns]}
                  onChange={next => setColumns(new Set(next as ColumnKey[]))}
                  options={COLUMN_ORDER.map(key => ({ id: key, label: columnLabel(key, t) }))}
                />
              )}
              {periodKind === 'month' && (
                <FilterPill active={lenses.has('frozen')} onClick={() => toggleLens('frozen')}>{t.performanceLensFrozen}</FilterPill>
              )}
              <FilterPill active={lenses.has('negative')} onClick={() => toggleLens('negative')}>{t.performanceLensNegative}</FilterPill>
              <FilterPill active={lenses.has('nobadges')} onClick={() => toggleLens('nobadges')}>{t.performanceLensNoBadges}</FilterPill>
              <div className="ml-auto w-full sm:w-56">
                <FilterSearchInput value={search} onChange={setSearch} placeholder={t.performanceSearchPlaceholder} />
              </div>
            </div>
            {periodKind === 'month' && !isCurrentPeriod && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.performancePastPeriodNote}</p>
            )}
          </div>

          {loading ? (
            <ul className={view === 'list' ? 'flex flex-col gap-2' : 'grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3'} role="status" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="mt-2 h-2.5 w-1/2" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {roster && roster.rows.length === 0 ? t.performanceEmptyNoMembers : t.performanceEmptyNoMatch}
            </p>
          ) : view === 'list' ? (
            <RosterTable
              rows={filtered}
              columns={visibleColumns}
              sort={sort}
              onSort={setSort}
              isCurrentPeriod={canAct}
              canWrite={canWrite}
              adjustmentsEnabled={adjustmentsEnabled}
              badgesEnabled={badgesEnabled}
              lang={lang}
              t={t}
              onOpen={openEmployee}
              onReward={row => setPayAction({ row, mode: 'reward' })}
              onPenalise={row => setPayAction({ row, mode: 'penalise' })}
              onAwardBadge={row => setBadgeAction(row)}
            />
          ) : (
            <ul className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map(row => (
                <RosterItem
                  key={row.employee_id}
                  row={row}
                  view={view}
                  isCurrentPeriod={canAct}
                  canWrite={canWrite}
                  adjustmentsEnabled={adjustmentsEnabled}
                  badgesEnabled={badgesEnabled}
                  lang={lang}
                  t={t}
                  onOpen={() => openEmployee(row.employee_id)}
                  onReward={() => setPayAction({ row, mode: 'reward' })}
                  onPenalise={() => setPayAction({ row, mode: 'penalise' })}
                  onAwardBadge={() => setBadgeAction(row)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {payAction && roster && (
        <PayAdjustmentModal
          mode={payAction.mode}
          user={user}
          employeeId={payAction.row.employee_id}
          employeeName={payAction.row.name}
          period={selectedMonth}
          maxIdr={maxAdjustmentIdr}
          onClose={() => setPayAction(null)}
          onDone={refreshAfterAction}
        />
      )}

      {badgeAction && (
        <BadgeActionModal
          row={badgeAction}
          definitions={definitions}
          user={user}
          onClose={() => setBadgeAction(null)}
          onDone={refreshAfterAction}
          t={t}
        />
      )}
    </div>
  )
}

// ─── Recognition analytics panel (expands under the summary cards) ───────────

function PerformanceAnalyticsPanel({ trend, t, lang }: {
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
  const data = trend.map(p => ({
    label: monthShort(p.period, lang),
    rewards: p.total_bonus_idr,
    penalties: p.total_deduction_idr,
  }))
  return (
    <div className="mt-4">
      <ChartCard
        title={t.performanceChartTitle}
        legend={
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            <LegendDot color={CHART_GREEN} label={t.performanceChartRewards} />
            <LegendDot color={CHART_RED} label={t.performanceChartPenalties} />
          </div>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
            <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={v => compactIdr(v as number, lang)} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Tooltip cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }} contentStyle={CHART_TOOLTIP} labelStyle={{ color: 'var(--color-text)' }} formatter={(value, name) => [formatIdr(value as number, lang), name === 'rewards' ? t.performanceChartRewards : t.performanceChartPenalties]} />
            <Bar dataKey="rewards" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
            <Bar dataKey="penalties" fill={CHART_RED} radius={[0, 0, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

// ─── Period kind toggle (month / all-time) ───────────────

function PeriodKindToggle({ value, onChange, t }: {
  value: PeriodKind
  onChange: (next: PeriodKind) => void
  t: ReturnType<typeof useLang>['t']
}) {
  const items: Array<{ key: PeriodKind; label: string }> = [
    { key: 'month', label: t.performancePeriodMonth },
    { key: 'all', label: t.leaderboardPeriodAllTime },
  ]
  return (
    <div role="group" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium">
      {items.map(item => {
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            className="rounded-full px-2.5 py-1 transition-colors"
            style={{
              backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── View toggle (card / line) ───────────────────────────

function ViewToggle({ view, onChange, t }: {
  view: PerfView
  onChange: (next: PerfView) => void
  t: ReturnType<typeof useLang>['t']
}) {
  const items: Array<{ key: PerfView; label: string; icon: React.ReactNode }> = [
    {
      key: 'cards',
      label: t.viewCards,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      key: 'list',
      label: t.viewList,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
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

// ─── Roster item (card / line) ───────────────────────────

function RosterItem({
  row, view, isCurrentPeriod, canWrite, adjustmentsEnabled, badgesEnabled,
  lang, t, onOpen, onReward, onPenalise, onAwardBadge,
}: {
  row: RosterRow
  view: PerfView
  isCurrentPeriod: boolean
  canWrite: boolean
  adjustmentsEnabled: boolean
  badgesEnabled: boolean
  lang: 'en' | 'id'
  t: ReturnType<typeof useLang>['t']
  onOpen: () => void
  onReward: () => void
  onPenalise: () => void
  onAwardBadge: () => void
}) {
  const list = view === 'list'

  const avatar = (
    <div
      className={`${list ? 'h-9 w-9' : 'h-10 w-10'} shrink-0 overflow-hidden rounded-full`}
      style={{ background: row.photo_url ? 'transparent' : getAvatarGradient(row.employee_id) }}
    >
      {row.photo_url && <img src={row.photo_url} alt="" className="h-full w-full object-cover" />}
    </div>
  )

  const stat = (
    <>
      {row.departments[0] || '—'}
      {row.adjustment_idr !== 0 && (
        <>
          {' · '}
          <span style={{ color: row.adjustment_idr > 0 ? 'var(--color-success, #16a34a)' : 'var(--color-danger)' }}>
            {signedIdr(row.adjustment_idr, lang)}
          </span>
        </>
      )}
      {row.achievements_count > 0 && ` · ${t.performanceRowBadges(row.achievements_count)}`}
      {row.adjustment_frozen && (
        <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
          {t.performanceFrozenTag}
        </span>
      )}
    </>
  )

  const menu = isCurrentPeriod ? (
    <RewardMenu
      row={row}
      canWrite={canWrite}
      adjustmentsEnabled={adjustmentsEnabled}
      badgesEnabled={badgesEnabled}
      onReward={onReward}
      onPenalise={onPenalise}
      onAwardBadge={onAwardBadge}
      t={t}
    />
  ) : null

  if (list) {
    return (
      <li className="rounded-xl border transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3 px-3 py-2">
          <button type="button" onClick={onOpen} title={t.performanceViewProfile} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {avatar}
            <span className="shrink-0 truncate text-sm font-medium" style={{ color: 'var(--color-text)', maxWidth: '45%' }}>{row.name}</span>
            <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{stat}</span>
          </button>
          {menu}
        </div>
      </li>
    )
  }

  return (
    <li className="rounded-xl border transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onOpen} title={t.performanceViewProfile} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {avatar}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{row.name}</p>
            <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{stat}</p>
            {row.top_achievements.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {row.top_achievements.map((b, i) => (
                  <span key={i} title={b.name}><BadgeGlyph icon={b.icon} size={18} /></span>
                ))}
              </div>
            )}
          </div>
        </button>
        {menu}
      </div>
    </li>
  )
}

// ─── Roster table (list view) ────────────────────────────

function SortHeader({ label, active, onClick, align }: {
  label: string
  active: boolean
  onClick?: () => void
  align?: 'right'
}) {
  const cls = `px-4 py-2.5 ${align === 'right' ? 'text-right' : ''}`
  if (!onClick) return <th className={cls}>{label}</th>
  return (
    <th className={cls}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${align === 'right' ? 'flex-row-reverse' : ''}`}
        style={{ color: active ? 'var(--color-text)' : undefined }}
      >
        {label}
        {active && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        )}
      </button>
    </th>
  )
}

function RosterTable({
  rows, columns, sort, onSort, isCurrentPeriod, canWrite, adjustmentsEnabled, badgesEnabled,
  lang, t, onOpen, onReward, onPenalise, onAwardBadge,
}: {
  rows: RosterRow[]
  columns: ColumnKey[]
  sort: SortKey
  onSort: (s: SortKey) => void
  isCurrentPeriod: boolean
  canWrite: boolean
  adjustmentsEnabled: boolean
  badgesEnabled: boolean
  lang: 'en' | 'id'
  t: ReturnType<typeof useLang>['t']
  onOpen: (id: string) => void
  onReward: (row: RosterRow) => void
  onPenalise: (row: RosterRow) => void
  onAwardBadge: (row: RosterRow) => void
}) {
  const sortKeyFor: Partial<Record<ColumnKey, SortKey>> = { adjustment: 'adjustment', badges: 'badges', xp: 'xp' }
  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
            <SortHeader label={t.hiringFieldName} active={sort === 'name'} onClick={() => onSort('name')} />
            {columns.map(col => {
              const sk = sortKeyFor[col]
              const right = col === 'adjustment'
              return (
                <SortHeader
                  key={col}
                  label={columnLabel(col, t)}
                  active={!!sk && sort === sk}
                  onClick={sk ? () => onSort(sk) : undefined}
                  align={right ? 'right' : undefined}
                />
              )
            })}
            {isCurrentPeriod && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <RosterTableRow
              key={row.employee_id}
              row={row}
              columns={columns}
              isCurrentPeriod={isCurrentPeriod}
              canWrite={canWrite}
              adjustmentsEnabled={adjustmentsEnabled}
              badgesEnabled={badgesEnabled}
              lang={lang}
              t={t}
              onOpen={() => onOpen(row.employee_id)}
              onReward={() => onReward(row)}
              onPenalise={() => onPenalise(row)}
              onAwardBadge={() => onAwardBadge(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RosterTableRow({
  row, columns, isCurrentPeriod, canWrite, adjustmentsEnabled, badgesEnabled,
  lang, t, onOpen, onReward, onPenalise, onAwardBadge,
}: {
  row: RosterRow
  columns: ColumnKey[]
  isCurrentPeriod: boolean
  canWrite: boolean
  adjustmentsEnabled: boolean
  badgesEnabled: boolean
  lang: 'en' | 'id'
  t: ReturnType<typeof useLang>['t']
  onOpen: () => void
  onReward: () => void
  onPenalise: () => void
  onAwardBadge: () => void
}) {
  function cell(col: ColumnKey) {
    switch (col) {
      case 'department':
        return <span style={{ color: 'var(--color-text-secondary)' }}>{row.departments[0] || '—'}</span>
      case 'status':
        return row.lifecycle_stage ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: row.lifecycle_stage === 'active' ? 'var(--color-success, #16a34a)' : 'var(--color-text-tertiary)',
            }}
          >
            {row.lifecycle_stage === 'active' ? t.derivedStatusActive : t.derivedStatusSeparated}
          </span>
        ) : '—'
      case 'adjustment':
        return (
          <span className="inline-flex items-center gap-1.5 tabular-nums font-medium" style={{ color: row.adjustment_idr > 0 ? 'var(--color-success, #16a34a)' : row.adjustment_idr < 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
            {row.adjustment_idr === 0 ? '—' : signedIdr(row.adjustment_idr, lang)}
            {row.adjustment_frozen && (
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>{t.performanceFrozenTag}</span>
            )}
          </span>
        )
      case 'badges':
        return row.achievements_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            {row.top_achievements.slice(0, 3).map((b, i) => (
              <span key={i} title={b.name}><BadgeGlyph icon={b.icon} size={16} /></span>
            ))}
            <span style={{ color: 'var(--color-text-tertiary)' }}>{row.achievements_count}</span>
          </span>
        ) : '—'
      case 'xp':
        return <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{t.portalExperienceXp(row.xp ?? 0)}</span>
    }
  }
  return (
    <tr
      onClick={onOpen}
      title={t.performanceViewProfile}
      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-[var(--color-bg-tertiary)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full" style={{ background: row.photo_url ? 'transparent' : getAvatarGradient(row.employee_id) }}>
            {row.photo_url && <img src={row.photo_url} alt="" className="h-full w-full object-cover" />}
          </div>
          <span className="font-medium" style={{ color: 'var(--color-text)' }}>{row.name}</span>
        </div>
      </td>
      {columns.map(col => (
        <td key={col} className={`px-4 py-2.5 ${col === 'adjustment' ? 'text-right' : ''}`} style={{ color: 'var(--color-text-tertiary)' }}>
          {cell(col)}
        </td>
      ))}
      {isCurrentPeriod && (
        <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex justify-end">
            <RewardMenu
              row={row}
              canWrite={canWrite}
              adjustmentsEnabled={adjustmentsEnabled}
              badgesEnabled={badgesEnabled}
              onReward={onReward}
              onPenalise={onPenalise}
              onAwardBadge={onAwardBadge}
              t={t}
            />
          </div>
        </td>
      )}
    </tr>
  )
}

// ─── Reward menu (per-row action dropdown) ───────────────

function RewardMenu({
  row, canWrite, adjustmentsEnabled, badgesEnabled,
  onReward, onPenalise, onAwardBadge, t,
}: {
  row: RosterRow
  canWrite: boolean
  adjustmentsEnabled: boolean
  badgesEnabled: boolean
  onReward: () => void
  onPenalise: () => void
  onAwardBadge: () => void
  t: ReturnType<typeof useLang>['t']
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  function run(fn: () => void) { setOpen(false); fn() }

  const items: Array<{ label: string; onClick: () => void; disabled?: boolean; tone?: string }> = []
  if (adjustmentsEnabled) {
    items.push({ label: t.compensationReward, onClick: onReward, disabled: row.adjustment_frozen, tone: 'var(--color-success, #16a34a)' })
    items.push({ label: t.compensationPenalise, onClick: onPenalise, disabled: row.adjustment_frozen, tone: 'var(--color-danger)' })
  }
  if (badgesEnabled) items.push({ label: t.awardAchievement, onClick: onAwardBadge, tone: 'var(--color-primary)' })

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative shrink-0">
      <ActionsMenuButton
        label={t.performanceActions}
        open={open}
        onClick={() => setOpen(o => !o)}
        disabled={!canWrite}
        title={!canWrite ? t.dunningWriteBlocked : undefined}
      />
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => !it.disabled && run(it.onClick)}
              disabled={it.disabled}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: it.tone }} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Achievement modal ───────────────────────────────────

function BadgeActionModal({
  row,
  definitions,
  user,
  onClose,
  onDone,
  t,
}: {
  row: RosterRow
  definitions: AchievementDefinition[]
  user: User
  onClose: () => void
  onDone: () => void
  t: ReturnType<typeof useLang>['t']
}) {
  const manual = definitions.filter(d => d.trigger_type === 'manual')
  const [selectedId, setSelectedId] = useState(manual[0]?.id || '')
  const [reason, setReason] = useState('')
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10))
  const [minBackdateIso] = useState(() => new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [unlockedDate, setUnlockedDate] = useState(todayIso)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const REASON_MAX = 200

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) { setError(t.validationPickAchievement); return }
    const trimmed = reason.trim()
    if (!trimmed) { setError(t.validationReasonRequired); return }
    if (trimmed.length > REASON_MAX) { setError(t.validationReasonTooLong); return }
    setSubmitting(true)
    setError('')
    let unlockedAt: string | undefined
    if (unlockedDate && unlockedDate !== todayIso) {
      unlockedAt = new Date(`${unlockedDate}T12:00:00`).toISOString()
    }
    const payload: {
      employee_id: string
      achievement_id: string
      awarded_by: string
      reason: string
      unlocked_at?: string
    } = {
      employee_id: row.employee_id,
      achievement_id: selectedId,
      awarded_by: user.id,
      reason: trimmed,
    }
    if (unlockedAt) payload.unlocked_at = unlockedAt
    const { error: insertError } = await supabase.from('achievement_unlocks').insert(payload)
    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`${t.awardAchievement} — ${row.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.pickAchievement}</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
            autoFocus
          >
            {manual.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{t.achievementReasonLabel}</span>
            <span className="text-xs" style={{ color: reason.length > REASON_MAX ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
              {reason.length}/{REASON_MAX}
            </span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value.slice(0, REASON_MAX + 50))}
            rows={2}
            required
            placeholder={t.achievementReasonPlaceholder}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementUnlockDate}</label>
          <input
            type="date"
            value={unlockedDate}
            min={minBackdateIso}
            max={todayIso}
            onChange={e => setUnlockedDate(e.target.value || todayIso)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.achievementUnlockDateHint}</p>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {submitting ? '...' : t.submitAward}
          </button>
        </div>
      </form>
    </Modal>
  )
}
