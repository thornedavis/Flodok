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
import type { Translations } from '../../lib/translations'
import type { FeedEvent, User } from '../../types/database'

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity orgId={user.org_id} initial={data.recent} employeesById={data.employeesById} t={t} lang={lang} />
        </div>
        <TeamComposition slices={data.departments} totalHeadcount={data.totalHeadcount} t={t} />
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

  const [empResult, sopResult, contractResult, pendingResult, feedWindowResult, recentResult, sigResult, csigResult] = await Promise.all([
    supabase.from('employees').select('id, name, photo_url, department, departments').eq('org_id', orgId),
    supabase.from('sops').select('id, status, current_version, employee_id').eq('org_id', orgId),
    supabase.from('contracts').select('id, status, current_version, employee_id').eq('org_id', orgId),
    supabase.from('pending_updates').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending'),
    supabase.from('feed_events').select('event_type, created_at').eq('org_id', orgId).gte('created_at', windowStartIso),
    supabase.from('feed_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(10),
    supabase.from('sop_signatures').select('sop_id, version_number'),
    supabase.from('contract_signatures').select('contract_id, version_number'),
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
              const meta = (evt.metadata || {}) as { signature_font?: string; version?: number }

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
                      {visual.icon}
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
