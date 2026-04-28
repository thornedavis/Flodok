import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts } from '../../lib/employee'
import { formatIdr } from '../../lib/credits'
import { BadgeGlyph } from '../../components/BadgeGlyph'
import type { Translations } from '../../lib/translations'
import type { FeedEvent, User } from '../../types/aliases'

// ─── Types ──────────────────────────────────────────────

interface Stats {
  employeeCount: number
  activeSOPs: number
  activeContracts: number
  pendingSignatures: number
  pendingUpdates: number
}

interface EmployeeLite {
  id: string
  name: string
  photo_url: string | null
  department: string | null
  departments: string[]
  date_of_birth: string | null
  created_at: string
}

interface ActivityBucket {
  date: string
  label: string
  sops: number
  signatures: number
  employees: number
  contracts: number
  other: number
}

interface DepartmentSlice {
  name: string
  value: number
}

interface CoverageBreakdown {
  signed: number
  total: number
  sopsSigned: number
  sopsTotal: number
  contractsSigned: number
  contractsTotal: number
}

interface DashboardData {
  stats: Stats
  activity: ActivityBucket[]
  recent: FeedEvent[]
  departments: DepartmentSlice[]
  totalHeadcount: number
  coverage: CoverageBreakdown | null
  employeesById: Record<string, EmployeeLite>
  employees: EmployeeLite[]
  badgesEnabled: boolean
}

const DEPT_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#ef4444', '#6366f1', '#84cc16', '#14b8a6',
]

const EVENT_TYPE_TO_SERIES: Record<string, keyof Pick<ActivityBucket, 'sops' | 'signatures' | 'employees' | 'contracts' | 'other'>> = {
  sop_updated: 'sops',
  sop_assigned: 'sops',
  sop_signed: 'signatures',
  contract_signed: 'signatures',
  welcome: 'employees',
  contract_updated: 'contracts',
  contract_assigned: 'contracts',
  reward_given: 'other',
}

// ─── Page ───────────────────────────────────────────────

export function Overview({ user }: { user: User }) {
  const { t, lang } = useLang()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => { loadDashboard(user.org_id).then(setData) }, [user.org_id])

  if (!data) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.navOverview}</h1>

      <QuickActions t={t} />

      <StatCards stats={data.stats} t={t} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityPulse buckets={data.activity} t={t} />
        </div>
        <SignatureCoverage coverage={data.coverage} t={t} />
      </div>

      {data.badgesEnabled ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <RecognitionMoments t={t} lang={lang} />
          <CompensationTotal orgId={user.org_id} t={t} lang={lang} />
        </div>
      ) : (
        <CompensationTotal orgId={user.org_id} t={t} lang={lang} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity orgId={user.org_id} initial={data.recent} employeesById={data.employeesById} t={t} lang={lang} />
        </div>
        <div className="flex flex-col gap-6">
          <UpcomingCalendar employees={data.employees} t={t} lang={lang} />
          <TeamComposition slices={data.departments} totalHeadcount={data.totalHeadcount} t={t} />
        </div>
      </div>
    </div>
  )
}

// ─── Data loading ───────────────────────────────────────

async function loadDashboard(orgId: string): Promise<DashboardData> {
  const now = Date.now()
  const windowDays = 30
  const windowStartMs = now - windowDays * 86400000
  const windowStartIso = new Date(windowStartMs).toISOString()

  const [empResult, sopResult, contractResult, pendingResult, feedWindowResult, recentResult, sigResult, csigResult, orgResult] = await Promise.all([
    supabase.from('employees').select('id, name, photo_url, department, departments, date_of_birth, created_at').eq('org_id', orgId),
    supabase.from('sops').select('id, status, current_version, employee_id').eq('org_id', orgId),
    supabase.from('contracts').select('id, status, current_version, employee_id').eq('org_id', orgId),
    supabase.from('pending_updates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
    supabase.from('feed_events').select('event_type, created_at').eq('org_id', orgId).gte('created_at', windowStartIso),
    supabase.from('feed_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(10),
    supabase.from('sop_signatures').select('sop_id, version_number'),
    supabase.from('contract_signatures').select('contract_id, version_number'),
    supabase.from('organizations').select('badges_enabled').eq('id', orgId).single(),
  ])

  const employees = (empResult.data || []) as EmployeeLite[]
  const sops = sopResult.data || []
  const contracts = contractResult.data || []

  // Stats
  const activeSops = sops.filter(s => s.status === 'active')
  const activeContracts = contracts.filter(c => c.status === 'active')
  const signedSopSet = new Set((sigResult.data || []).map(s => `${s.sop_id}-${s.version_number}`))
  const signedContractSet = new Set((csigResult.data || []).map(c => `${c.contract_id}-${c.version_number}`))
  const pendingSignatures = activeSops.filter(s => s.employee_id && !signedSopSet.has(`${s.id}-${s.current_version}`)).length
  const stats: Stats = {
    employeeCount: employees.length,
    activeSOPs: activeSops.length,
    activeContracts: activeContracts.length,
    pendingSignatures,
    pendingUpdates: pendingResult.count || 0,
  }

  // Signature coverage — both active SOPs and active contracts with an assigned employee
  const assignedSops = activeSops.filter(s => s.employee_id)
  const assignedContracts = activeContracts.filter(c => c.employee_id)
  const sopsSigned = assignedSops.filter(s => signedSopSet.has(`${s.id}-${s.current_version}`)).length
  const contractsSigned = assignedContracts.filter(c => signedContractSet.has(`${c.id}-${c.current_version}`)).length
  const totalAssigned = assignedSops.length + assignedContracts.length
  const coverage: CoverageBreakdown | null = totalAssigned === 0
    ? null
    : {
        total: totalAssigned,
        signed: sopsSigned + contractsSigned,
        sopsSigned,
        sopsTotal: assignedSops.length,
        contractsSigned,
        contractsTotal: assignedContracts.length,
      }

  // Activity timeseries — 30 days of daily buckets
  const buckets: ActivityBucket[] = []
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    buckets.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      sops: 0,
      signatures: 0,
      employees: 0,
      contracts: 0,
      other: 0,
    })
  }
  const bucketByDate = new Map(buckets.map(b => [b.date, b]))
  for (const evt of feedWindowResult.data || []) {
    const key = new Date(evt.created_at).toISOString().slice(0, 10)
    const bucket = bucketByDate.get(key)
    if (!bucket) continue
    const series = EVENT_TYPE_TO_SERIES[evt.event_type] || 'other'
    bucket[series] += 1
  }

  // Departments — count each employee in every department they're tagged with,
  // so the slices reflect "assignments per department" (e.g. a Marketing + Growth
  // hire shows up in both). The donut centre still shows true headcount.
  const deptCounts = new Map<string, number>()
  for (const emp of employees) {
    const depts = getEmployeeDepts(emp)
    if (depts.length === 0) {
      deptCounts.set('__none__', (deptCounts.get('__none__') || 0) + 1)
    } else {
      for (const d of depts) {
        deptCounts.set(d, (deptCounts.get(d) || 0) + 1)
      }
    }
  }
  const departments: DepartmentSlice[] = [...deptCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Employees lookup for activity feed
  const employeesById = Object.fromEntries(employees.map(e => [e.id, e]))

  return {
    stats,
    activity: buckets,
    recent: (recentResult.data || []) as FeedEvent[],
    departments,
    totalHeadcount: employees.length,
    coverage,
    employeesById,
    employees,
    badgesEnabled: orgResult.data?.badges_enabled ?? true,
  }
}

// ─── Quick actions ──────────────────────────────────────

function QuickActions({ t }: { t: Translations }) {
  const navigate = useNavigate()
  const actions: { label: string; onClick: () => void; icon: React.ReactNode }[] = [
    {
      label: t.quickActionAddEmployee,
      onClick: () => navigate('/dashboard/employees'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      ),
    },
    {
      label: t.quickActionNewSop,
      onClick: () => navigate('/dashboard/sops'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
    },
    {
      label: t.quickActionNewContract,
      onClick: () => navigate('/dashboard/contracts'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="12" y1="8" x2="12" y2="14" />
          <line x1="9" y1="11" x2="15" y2="11" />
        </svg>
      ),
    },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(a => (
        <button
          key={a.label}
          onClick={a.onClick}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  )
}

// ─── Stat cards ─────────────────────────────────────────

function StatCards({ stats, t }: { stats: Stats; t: Translations }) {
  const cards = [
    { label: t.overviewEmployees, value: stats.employeeCount, link: '/dashboard/employees' },
    { label: t.overviewActiveSops, value: stats.activeSOPs, link: '/dashboard/sops' },
    { label: t.overviewActiveContracts, value: stats.activeContracts, link: '/dashboard/contracts' },
    { label: t.overviewAwaitingSignature, value: stats.pendingSignatures, link: '/dashboard/sops' },
    { label: t.overviewPendingUpdates, value: stats.pendingUpdates, link: '/dashboard/pending' },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map(card => (
        <Link
          key={card.label}
          to={card.link}
          className="rounded-xl border p-5 transition-colors"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
        >
          <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{card.label}</div>
          <div className="mt-1 text-3xl font-semibold" style={{ color: 'var(--color-text)' }}>{card.value}</div>
        </Link>
      ))}
    </div>
  )
}

// ─── Activity pulse (stacked bar) ───────────────────────

function ActivityPulse({ buckets, t }: { buckets: ActivityBucket[]; t: Translations }) {
  const totalEvents = useMemo(
    () => buckets.reduce((sum, b) => sum + b.sops + b.signatures + b.employees + b.contracts + b.other, 0),
    [buckets],
  )
  return (
    <Card>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.activityPulseTitle}</h3>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.activityPulseSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <LegendDot color="#3b82f6" label={t.activityLegendSops} />
          <LegendDot color="#10b981" label={t.activityLegendSignatures} />
          <LegendDot color="#f59e0b" label={t.activityLegendEmployees} />
          <LegendDot color="#8b5cf6" label={t.activityLegendContracts} />
        </div>
      </div>

      {totalEvents === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.activityEmptyState}
        </div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                interval={Math.floor(buckets.length / 6)}
              />
              <YAxis
                tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.4 }}
                contentStyle={{
                  backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: 'var(--color-text)' }}
                formatter={(value, name) => {
                  const map: Record<string, string> = {
                    sops: t.activityLegendSops,
                    signatures: t.activityLegendSignatures,
                    employees: t.activityLegendEmployees,
                    contracts: t.activityLegendContracts,
                    other: t.activityLegendOther,
                  }
                  return [value as number, map[name as string] || (name as string)]
                }}
              />
              <Bar dataKey="sops" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="signatures" stackId="a" fill="#10b981" />
              <Bar dataKey="employees" stackId="a" fill="#f59e0b" />
              <Bar dataKey="contracts" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="other" stackId="a" fill="#6b7280" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// ─── Signature coverage gauge ───────────────────────────

function SignatureCoverage({ coverage, t }: { coverage: DashboardData['coverage']; t: Translations }) {
  const header = (
    <div className="mb-4">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.signatureCoverageTitle}</h3>
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.signatureCoverageSubtitle}</p>
    </div>
  )

  if (!coverage) {
    return (
      <Card>
        {header}
        <div className="flex h-56 items-center justify-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.signatureCoverageNone}
        </div>
      </Card>
    )
  }

  const pct = Math.round((coverage.signed / coverage.total) * 100)
  const size = 140
  const center = size / 2
  const stroke = 12
  const radius = center - stroke / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - pct / 100)
  const color = pct >= 90 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'

  const rows: { key: string; label: string; color: string; signed: number; total: number }[] = [
    { key: 'sops', label: t.navSops, color: '#3b82f6', signed: coverage.sopsSigned, total: coverage.sopsTotal },
    { key: 'contracts', label: t.navContracts, color: '#8b5cf6', signed: coverage.contractsSigned, total: coverage.contractsTotal },
  ].filter(r => r.total > 0)

  return (
    <Card>
      {header}
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--color-bg-tertiary)"
              strokeWidth={stroke}
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold" style={{ color: 'var(--color-text)' }}>{pct}%</span>
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {coverage.signed} / {coverage.total}
            </span>
          </div>
        </div>

        <ul className="w-full space-y-1.5">
          {rows.map(r => (
            <li key={r.key} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span style={{ color: 'var(--color-text)' }}>{r.signed} / {r.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

// ─── Recent activity feed ───────────────────────────────

type ActivityFilter = 'all' | 'signatures' | 'sops' | 'contracts' | 'team'

const PAGE_SIZE = 10

const FILTER_EVENT_TYPES: Record<ActivityFilter, string[] | null> = {
  all: null,
  signatures: ['sop_signed', 'contract_signed'],
  sops: ['sop_updated', 'sop_assigned'],
  contracts: ['contract_updated', 'contract_assigned'],
  team: ['welcome'],
}

function RecentActivity({ orgId, initial, employeesById, t, lang }: {
  orgId: string
  initial: FeedEvent[]
  employeesById: Record<string, EmployeeLite>
  t: Translations
  lang: string
}) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [events, setEvents] = useState<FeedEvent[]>(initial)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initial.length >= PAGE_SIZE)
  const initialForAll = useRef(initial)

  async function fetchPage(nextFilter: ActivityFilter, before?: string): Promise<FeedEvent[]> {
    let query = supabase
      .from('feed_events')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (before) query = query.lt('created_at', before)
    const types = FILTER_EVENT_TYPES[nextFilter]
    if (types) query = query.in('event_type', types)
    const { data } = await query
    return (data || []) as FeedEvent[]
  }

  async function handleFilterChange(next: ActivityFilter) {
    if (next === filter) return
    setFilter(next)
    if (next === 'all') {
      // Re-seed with the pre-fetched initial batch — avoids a redundant round trip.
      setEvents(initialForAll.current)
      setHasMore(initialForAll.current.length >= PAGE_SIZE)
      return
    }
    setLoading(true)
    const page = await fetchPage(next)
    setEvents(page)
    setHasMore(page.length >= PAGE_SIZE)
    setLoading(false)
  }

  async function handleLoadMore() {
    const last = events[events.length - 1]
    if (!last) return
    setLoading(true)
    const page = await fetchPage(filter, last.created_at)
    setEvents(prev => [...prev, ...page])
    setHasMore(page.length >= PAGE_SIZE)
    setLoading(false)
  }

  const filterPills: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: t.activityFilterAll },
    { key: 'signatures', label: t.activityFilterSignatures },
    { key: 'sops', label: t.activityFilterSops },
    { key: 'contracts', label: t.activityFilterContracts },
    { key: 'team', label: t.activityFilterTeam },
  ]

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.recentActivityTitle}</h3>
        <div className="flex flex-wrap gap-1">
          {filterPills.map(p => {
            const active = filter === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => handleFilterChange(p.key)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--color-text)' : 'var(--color-border)',
                  backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {events.length === 0 && !loading ? (
        <div className="flex h-40 items-center justify-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.noActivity}
        </div>
      ) : (
        <>
          <ul>
            {events.map((evt, i) => {
              const isLast = i === events.length - 1
              const emp = evt.employee_id ? employeesById[evt.employee_id] : null
              const visual = eventVisual(evt.event_type)
              const meta = (evt.metadata || {}) as { signature_font?: string; version?: number; icon?: string | null }
              const isBadgeEvent = evt.event_type === 'achievement_unlocked'

              return (
                <li key={evt.id} className="flex gap-3">
                  {/* Timeline: icon + connecting line */}
                  <div className="flex flex-col items-center">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${visual.color} 15%, transparent)`,
                        color: visual.color,
                      }}
                    >
                      {isBadgeEvent ? (
                        <BadgeGlyph icon={meta.icon ?? null} size={18} />
                      ) : (
                        visual.icon
                      )}
                    </div>
                    {!isLast && (
                      <div className="min-h-4 w-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 pb-5 pt-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 text-sm" style={{ color: 'var(--color-text)' }}>
                        <span className="font-medium">{emp?.name || '—'}</span>{' '}
                        <span style={{ color: 'var(--color-text-secondary)' }}>{eventLabel(evt.event_type, t).toLowerCase()}</span>
                      </div>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {formatRelativeTime(evt.created_at, lang)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {evt.title}
                      {typeof meta.version === 'number' && (
                        <> · {t.version} {meta.version}</>
                      )}
                    </div>
                    {/* Signature rendered in chosen font — only for signed events */}
                    {(evt.event_type === 'sop_signed' || evt.event_type === 'contract_signed') && meta.signature_font && emp && (
                      <p
                        className="mt-1 text-lg leading-tight"
                        style={{
                          fontFamily: `'${meta.signature_font}', cursive`,
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {emp.name}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-1 flex items-center justify-center">
            {loading ? (
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.activityLoading}</span>
            ) : hasMore ? (
              <button
                type="button"
                onClick={handleLoadMore}
                className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  backgroundColor: 'transparent',
                }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {t.activityLoadMore}
              </button>
            ) : (
              events.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.activityAllLoaded}</span>
              )
            )}
          </div>
        </>
      )}
    </Card>
  )
}

function eventLabel(eventType: string, t: Translations): string {
  switch (eventType) {
    case 'sop_signed': return t.eventSopSigned
    case 'sop_updated': return t.eventSopUpdated
    case 'sop_assigned': return t.eventSopAssigned
    case 'contract_assigned': return t.eventContractAssigned
    case 'contract_updated': return t.eventContractUpdated
    case 'contract_signed': return t.eventContractSigned
    case 'reward_given': return t.eventRewardGiven
    case 'welcome': return t.eventWelcome
    case 'achievement_unlocked': return t.eventBadgeEarned
    default: return eventType
  }
}

function eventVisual(eventType: string): { color: string; icon: React.ReactNode } {
  switch (eventType) {
    case 'sop_signed':
    case 'contract_signed':
      return {
        color: '#10b981',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ),
      }
    case 'sop_updated':
    case 'sop_assigned':
      return {
        color: '#3b82f6',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        ),
      }
    case 'contract_updated':
    case 'contract_assigned':
      return {
        color: '#8b5cf6',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <line x1="8" y1="8" x2="16" y2="8" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="8" y1="16" x2="12" y2="16" />
          </svg>
        ),
      }
    case 'welcome':
      return {
        color: '#f59e0b',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        ),
      }
    case 'reward_given':
    case 'bonus_awarded':
      return {
        color: '#eab308',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        ),
      }
    case 'achievement_unlocked':
      return {
        color: '#f59e0b',
        icon: null,
      }
    default:
      return {
        color: '#6b7280',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        ),
      }
  }
}

// ─── Recognition Moments ────────────────────────────────
// Today's unlocks + next 7 days of forecast tenure milestones. Powered by
// the recent_unlocks(0) and upcoming_milestones(7) RPCs added in 042.

type RecentUnlock = {
  unlock_id: string
  unlocked_at: string
  announced_at: string
  awarded_by: string | null
  reason: string | null
  employee_id: string
  employee_name: string
  employee_photo: string | null
  achievement_id: string
  achievement_name: string
  achievement_description: string | null
  achievement_icon: string | null
  is_manual: boolean
}

type UpcomingMilestone = {
  employee_id: string
  employee_name: string
  employee_photo: string | null
  achievement_id: string
  achievement_name: string
  achievement_description: string | null
  achievement_icon: string | null
  milestone_at: string
}

type RecognitionTab = 'today' | '7d' | '30d'

function RecognitionMoments({ t, lang }: { t: Translations; lang: 'en' | 'id' }) {
  const [today, setToday] = useState<RecentUnlock[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingMilestone[]>([])
  const [tab, setTab] = useState<RecognitionTab>('today')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.rpc('recent_unlocks', { p_days_back: 0 }),
      supabase.rpc('upcoming_milestones', { p_days_ahead: 30 }),
    ]).then(([recentRes, upcomingRes]) => {
      if (cancelled) return
      setToday((recentRes.data as RecentUnlock[] | null) ?? [])
      setUpcoming((upcomingRes.data as UpcomingMilestone[] | null) ?? [])
    })
    return () => { cancelled = true }
  }, [])

  const upcoming7 = upcoming.filter(u => {
    const ms = new Date(u.milestone_at).getTime() - Date.now()
    return ms <= 7 * 24 * 60 * 60 * 1000
  })

  const tabs: { key: RecognitionTab; label: string; count: number }[] = [
    { key: 'today', label: t.recognitionToday, count: today.length },
    { key: '7d', label: t.recognitionUpcoming7, count: upcoming7.length },
    { key: '30d', label: t.recognitionUpcoming30, count: upcoming.length },
  ]

  const emptyMessage =
    tab === 'today' ? t.recognitionEmptyToday : t.recognitionEmptyUpcoming

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.recognitionMomentsTitle}</h3>
        <div className="flex flex-wrap gap-1">
          {tabs.map(p => {
            const active = tab === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setTab(p.key)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--color-text)' : 'var(--color-border)',
                  backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                }}
              >
                {p.label}
                {p.count > 0 && <span className="ml-1 opacity-70">{p.count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'today' && today.length === 0 ? (
        <p className="py-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{emptyMessage}</p>
      ) : tab === '7d' && upcoming7.length === 0 ? (
        <p className="py-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{emptyMessage}</p>
      ) : tab === '30d' && upcoming.length === 0 ? (
        <p className="py-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{emptyMessage}</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {tab === 'today' && today.map(u => (
            <li key={u.unlock_id} className="flex items-center gap-2.5">
              <BadgeGlyph icon={u.achievement_icon} size={18} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{u.employee_name}</p>
                <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {u.achievement_name}
                  {u.is_manual && u.reason ? ` · ${u.reason}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {formatRelativeTime(u.announced_at, lang)}
              </span>
            </li>
          ))}
          {tab === '7d' && upcoming7.map(u => (
            <li key={`${u.employee_id}-${u.achievement_id}`} className="flex items-center gap-2.5">
              <BadgeGlyph icon={u.achievement_icon} size={18} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{u.employee_name}</p>
                <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{u.achievement_name}</p>
              </div>
              <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {formatUpcomingDate(u.milestone_at, lang)}
              </span>
            </li>
          ))}
          {tab === '30d' && upcoming.map(u => (
            <li key={`${u.employee_id}-${u.achievement_id}`} className="flex items-center gap-2.5">
              <BadgeGlyph icon={u.achievement_icon} size={18} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{u.employee_name}</p>
                <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{u.achievement_name}</p>
              </div>
              <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {formatUpcomingDate(u.milestone_at, lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ─── Compensation Total ─────────────────────────────────
// Sums base wage + allowance across every active employee with an active
// contract. Shows the total alongside a horizontal split bar so the manager
// can see fixed-cost structure at a glance.

function CompensationTotal({ orgId, t, lang }: { orgId: string; t: Translations; lang: 'en' | 'id' }) {
  const [data, setData] = useState<{ wages: number; allowances: number; headcount: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [employeesRes, contractsRes] = await Promise.all([
        supabase
          .from('employees')
          .select('id, status')
          .eq('org_id', orgId)
          .in('status', ['trial', 'active']),
        supabase
          .from('contracts')
          .select('employee_id, base_wage_idr, allowance_idr')
          .eq('org_id', orgId)
          .eq('status', 'active'),
      ])
      if (cancelled) return
      const activeIds = new Set((employeesRes.data ?? []).map(e => e.id))
      const contracts = (contractsRes.data ?? []).filter(c => c.employee_id != null && activeIds.has(c.employee_id))
      const wages = contracts.reduce((s, c) => s + (c.base_wage_idr ?? 0), 0)
      const allowances = contracts.reduce((s, c) => s + (c.allowance_idr ?? 0), 0)
      setData({ wages, allowances, headcount: contracts.length })
    }
    load()
    return () => { cancelled = true }
  }, [orgId])

  if (!data) {
    return (
      <Card>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.compensationTotalTitle}</h3>
        <p className="mt-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      </Card>
    )
  }

  const total = data.wages + data.allowances
  const wagesPct = total > 0 ? (data.wages / total) * 100 : 0
  const allowancesPct = total > 0 ? (data.allowances / total) * 100 : 0

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.compensationTotalTitle}</h3>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.compensationTotalHeadcount(data.headcount)}
        </span>
      </div>

      <div className="mb-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
        {formatIdr(total, lang)}
      </div>
      <p className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.compensationTotalSubtitle}</p>

      {total > 0 ? (
        <>
          <div
            className="mb-3 flex h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--color-border)' }}
          >
            <div style={{ width: `${wagesPct}%`, backgroundColor: 'var(--color-primary)' }} />
            <div style={{ width: `${allowancesPct}%`, backgroundColor: '#10b981' }} />
          </div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                {t.compensationTotalWages}
              </span>
              <span style={{ color: 'var(--color-text)' }}>{formatIdr(data.wages, lang)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
                {t.compensationTotalAllowances}
              </span>
              <span style={{ color: 'var(--color-text)' }}>{formatIdr(data.allowances, lang)}</span>
            </li>
          </ul>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.compensationTotalEmpty}</p>
      )}
    </Card>
  )
}

function formatUpcomingDate(iso: string, lang: string): string {
  const date = new Date(iso)
  const ms = date.getTime() - Date.now()
  const days = Math.round(ms / (24 * 60 * 60 * 1000))
  if (days === 0) return lang === 'id' ? 'hari ini' : 'today'
  if (days === 1) return lang === 'id' ? 'besok' : 'tomorrow'
  if (days <= 7) return lang === 'id' ? `dalam ${days} hari` : `in ${days} days`
  return date.toLocaleDateString(lang === 'id' ? 'id-ID' : undefined, { month: 'short', day: 'numeric' })
}

function formatRelativeTime(iso: string, lang: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return lang === 'id' ? 'baru saja' : 'just now'
  if (mins < 60) return lang === 'id' ? `${mins}m lalu` : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return lang === 'id' ? `${hours}j lalu` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return lang === 'id' ? `${days}h lalu` : `${days}d ago`
  return new Date(iso).toLocaleDateString(lang === 'id' ? 'id-ID' : undefined, { month: 'short', day: 'numeric' })
}

// ─── Team composition donut ─────────────────────────────

function TeamComposition({ slices, totalHeadcount, t }: {
  slices: DepartmentSlice[]
  totalHeadcount: number
  t: Translations
}) {
  const sliceTotal = slices.reduce((sum, s) => sum + s.value, 0)
  const prepared = slices.map(s => ({
    name: s.name === '__none__' ? t.teamCompositionNoDept : s.name,
    value: s.value,
  }))

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.teamCompositionTitle}</h3>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.teamCompositionSubtitle}</p>
      </div>
      {sliceTotal === 0 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.teamCompositionEmpty}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={prepared}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={68}
                  paddingAngle={2}
                  stroke="none"
                >
                  {prepared.map((_, i) => (
                    <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-semibold leading-none" style={{ color: 'var(--color-text)' }}>{totalHeadcount}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.totalEmployees}
            </span>
            {sliceTotal > totalHeadcount && (
              <span className="group relative inline-flex" style={{ position: 'relative' }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {t.teamCompositionDoubleCountHint}
                </span>
              </span>
            )}
          </div>
          <ul className="w-full space-y-1.5">
            {prepared.map((s, i) => (
              <li key={s.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span style={{ color: 'var(--color-text)' }}>{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// ─── Upcoming calendar ──────────────────────────────────

type CalendarFilter = 'all' | 'birthdays' | 'anniversaries'

interface KeyDateEvent {
  date: Date
  employeeId: string
  employeeName: string
  type: 'birthday' | 'anniversary'
  years: number
}

const BIRTHDAY_COLOR = '#10b981'
const ANNIVERSARY_COLOR = '#f59e0b'

function UpcomingCalendar({ employees, t, lang }: {
  employees: EmployeeLite[]
  t: Translations
  lang: string
}) {
  const [filter, setFilter] = useState<CalendarFilter>('all')
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const allEvents = useMemo(() => computeKeyDates(employees, today), [employees, today])

  const filtered = useMemo(() => {
    if (filter === 'all') return allEvents
    if (filter === 'birthdays') return allEvents.filter(e => e.type === 'birthday')
    return allEvents.filter(e => e.type === 'anniversary')
  }, [allEvents, filter])

  // Events occurring within the viewed month (recurring every year, so we map
  // the employee's m/d into the current view year).
  const monthEvents = useMemo(() => {
    const map = new Map<number, KeyDateEvent[]>()
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    for (const emp of employees) {
      if (filter !== 'anniversaries' && emp.date_of_birth) {
        const src = parseDateOnly(emp.date_of_birth)
        if (src && src.getMonth() === month) {
          const day = src.getDate()
          pushEvent(map, day, {
            date: new Date(year, month, day),
            employeeId: emp.id,
            employeeName: emp.name,
            type: 'birthday',
            years: year - src.getFullYear(),
          })
        }
      }
      if (filter !== 'birthdays') {
        const src = new Date(emp.created_at)
        if (!isNaN(src.getTime()) && src.getMonth() === month) {
          const day = src.getDate()
          const years = year - src.getFullYear()
          if (years >= 1) {
            pushEvent(map, day, {
              date: new Date(year, month, day),
              employeeId: emp.id,
              employeeName: emp.name,
              type: 'anniversary',
              years,
            })
          }
        }
      }
    }
    return map
  }, [employees, viewMonth, filter])

  const upcoming = useMemo(() => {
    const in90 = today.getTime() + 90 * 86400000
    return filtered
      .filter(e => e.date.getTime() >= today.getTime() && e.date.getTime() <= in90)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5)
  }, [filtered, today])

  const locale = lang === 'id' ? 'id-ID' : undefined
  const filterPills: { key: CalendarFilter; label: string }[] = [
    { key: 'all', label: t.calendarFilterAll },
    { key: 'birthdays', label: t.calendarFilterBirthdays },
    { key: 'anniversaries', label: t.calendarFilterAnniversaries },
  ]

  return (
    <Card>
      <div className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.calendarTitle}</h3>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.calendarSubtitle}</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {filterPills.map(p => {
          const active = filter === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
              style={{
                borderColor: active ? 'var(--color-text)' : 'var(--color-border)',
                backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <MonthGrid
        viewMonth={viewMonth}
        today={today}
        monthEvents={monthEvents}
        locale={locale}
        onPrev={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
        onNext={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
      />

      <ul className="mt-4 space-y-2">
        {upcoming.length === 0 ? (
          <li className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.calendarEmpty}</li>
        ) : upcoming.map((evt, i) => (
          <li key={`${evt.employeeId}-${evt.type}-${i}`} className="flex items-start gap-2 text-xs">
            <span
              className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: evt.type === 'birthday' ? BIRTHDAY_COLOR : ANNIVERSARY_COLOR }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{evt.employeeName}</span>
                <span className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
                  {formatRelativeDay(evt.date, today, lang, t)}
                </span>
              </div>
              <div style={{ color: 'var(--color-text-secondary)' }}>
                {evt.type === 'birthday'
                  ? `${t.calendarEventBirthday} · ${t.calendarTurningAge.replace('{n}', String(evt.years))}`
                  : `${t.calendarEventAnniversary} · ${evt.years === 1 ? t.calendarOneYearAtCompany : t.calendarYearsAtCompany.replace('{n}', String(evt.years))}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function MonthGrid({ viewMonth, today, monthEvents, locale, onPrev, onNext }: {
  viewMonth: Date
  today: Date
  monthEvents: Map<number, KeyDateEvent[]>
  locale: string | undefined
  onPrev: () => void
  onNext: () => void
}) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Monday-first week: JS getDay() returns 0=Sun..6=Sat → shift to 0=Mon..6=Sun
  const leadingBlanks = (firstDay.getDay() + 6) % 7

  const weekdayLabels = useMemo(() => {
    // Week starting Monday 2024-01-01
    const base = new Date(2024, 0, 1)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return d.toLocaleDateString(locale, { weekday: 'narrow' })
    })
  }, [locale])

  const cells: (number | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          className="rounded-md p-1 transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs font-medium capitalize" style={{ color: 'var(--color-text)' }}>{monthLabel}</span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next month"
          className="rounded-md p-1 transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((label, i) => (
          <div key={i} className="text-[10px] font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="aspect-square" />
          const cellDate = new Date(year, month, day)
          const isToday = cellDate.getTime() === today.getTime()
          const events = monthEvents.get(day) || []
          const hasBirthday = events.some(e => e.type === 'birthday')
          const hasAnniv = events.some(e => e.type === 'anniversary')
          const tooltip = events.map(e => `${e.employeeName} · ${e.type === 'birthday' ? '🎂' : '🎉'}`).join('\n')

          // Today wins visually. Otherwise tint the cell by the event type —
          // birthdays win over anniversaries when both fall on the same day,
          // but we still show both indicator dots so nothing is hidden.
          let bgColor = 'transparent'
          let textColor = 'var(--color-text-secondary)'
          let fontWeight = 400
          if (isToday) {
            bgColor = '#3b82f6'
            textColor = '#ffffff'
            fontWeight = 600
          } else if (hasBirthday) {
            bgColor = `color-mix(in srgb, ${BIRTHDAY_COLOR} 22%, transparent)`
            textColor = 'var(--color-text)'
            fontWeight = 500
          } else if (hasAnniv) {
            bgColor = `color-mix(in srgb, ${ANNIVERSARY_COLOR} 22%, transparent)`
            textColor = 'var(--color-text)'
            fontWeight = 500
          }

          return (
            <div
              key={i}
              className="relative flex aspect-square flex-col items-center justify-center rounded-md text-[11px]"
              style={{
                backgroundColor: bgColor,
                color: textColor,
                fontWeight,
                cursor: events.length > 0 ? 'help' : 'default',
              }}
              title={tooltip || undefined}
            >
              <span>{day}</span>
              {(hasBirthday || hasAnniv) && (
                <div className="absolute bottom-1 flex gap-0.5">
                  {hasBirthday && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isToday ? '#ffffff' : BIRTHDAY_COLOR }} />}
                  {hasAnniv && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isToday ? '#ffffff' : ANNIVERSARY_COLOR }} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function parseDateOnly(s: string): Date | null {
  // Parses 'YYYY-MM-DD' as a local date (avoids timezone shift that new Date(s) causes).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function pushEvent(map: Map<number, KeyDateEvent[]>, day: number, evt: KeyDateEvent) {
  const list = map.get(day)
  if (list) list.push(evt)
  else map.set(day, [evt])
}

function computeKeyDates(employees: EmployeeLite[], today: Date): KeyDateEvent[] {
  const events: KeyDateEvent[] = []
  for (const emp of employees) {
    if (emp.date_of_birth) {
      const src = parseDateOnly(emp.date_of_birth)
      if (src) {
        const next = nextAnnualOccurrence(src, today)
        events.push({
          date: next,
          employeeId: emp.id,
          employeeName: emp.name,
          type: 'birthday',
          years: next.getFullYear() - src.getFullYear(),
        })
      }
    }
    const src = new Date(emp.created_at)
    if (!isNaN(src.getTime())) {
      const next = nextAnnualOccurrence(src, today)
      const years = next.getFullYear() - src.getFullYear()
      if (years >= 1) {
        events.push({
          date: next,
          employeeId: emp.id,
          employeeName: emp.name,
          type: 'anniversary',
          years,
        })
      }
    }
  }
  return events
}

function nextAnnualOccurrence(src: Date, from: Date): Date {
  const candidate = new Date(from.getFullYear(), src.getMonth(), src.getDate())
  if (candidate.getTime() < from.getTime()) {
    candidate.setFullYear(from.getFullYear() + 1)
  }
  return candidate
}

function formatRelativeDay(date: Date, today: Date, lang: string, t: Translations): string {
  const days = Math.round((date.getTime() - today.getTime()) / 86400000)
  if (days === 0) return t.calendarToday
  if (days === 1) return t.calendarTomorrow
  if (days < 14) return t.calendarInDays.replace('{n}', String(days))
  return date.toLocaleDateString(lang === 'id' ? 'id-ID' : undefined, { month: 'short', day: 'numeric' })
}

// ─── Card shell ─────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {children}
    </div>
  )
}
