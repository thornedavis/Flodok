// Founder Console — platform-wide admin dashboard (Phase 1).
//
// Cross-tenant "god view" for the founder: every org's signup, billing status,
// last login, and content scale. Gated on user.is_platform_admin both here (UI
// convenience) and inside the admin_org_rows() RPC (the real boundary — it
// re-checks the bit and bypasses RLS via SECURITY DEFINER). See
// docs/founder-console.md. AI cost panel arrives in Phase 2.

import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useFullWidthLayout } from '../../components/Layout'
import { calculateProMonthlyIdr, formatIdr } from '../../lib/pricing'
import type { User } from '../../types/aliases'
import type { Database } from '../../types/database'

type OrgRow = Database['public']['Functions']['admin_org_rows']['Returns'][number]

// Shape of the admin_ai_usage() jsonb payload (Phase 2). The RPC types as Json,
// so we assert this richer shape at the call site.
type AiUsage = {
  since: string
  until: string
  total: { calls: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number }
  by_function: { function_name: string; calls: number; total_tokens: number; cost_usd: number }[]
  by_model: { model: string; calls: number; total_tokens: number; cost_usd: number }[]
  by_org: { org_id: string | null; org_name: string | null; calls: number; total_tokens: number; cost_usd: number }[]
  by_day: { day: string; cost_usd: number; total_tokens: number }[]
}

// admin-metrics edge function — OpenRouter account-level totals (USD).
type AccountMetrics = { available: boolean; total_credits?: number | null; total_usage?: number | null; balance?: number | null }

// admin_org_detail() jsonb payload — backs the row-click drawer (Phase 3).
type OrgDetail = {
  org: {
    id: string; name: string; display_name: string | null; plan_tier: string
    subscription_status: string | null; subscription_quantity: number | null
    current_period_end: string | null; cancel_at_period_end: boolean
    past_due_since: string | null; created_at: string; onboarding_completed_at: string | null
    stripe_customer_id: string | null; company_email: string | null
  }
  counts: { employees: number; contracts: number; sops: number; ndas: number; forms: number; letters: number; job_descriptions: number }
  users: { id: string; name: string; email: string; role: string; created_at: string; last_sign_in_at: string | null }[]
  ai_30d: { calls: number; cost_usd: number; total_tokens: number }
  pending_claim: { owner_email: string; owner_name: string | null; created_at: string; expires_at: string } | null
}

// Stripe's "active" cluster keeps an org on Pro and counts toward MRR. Mirrors
// the proStatuses set in supabase/functions/billing/index.ts.
const PAYING_STATUSES = new Set(['active', 'trialing', 'past_due'])

const DAY_MS = 24 * 60 * 60 * 1000

function orgMrrIdr(row: OrgRow): number {
  if (row.plan_tier !== 'pro') return 0
  if (!row.subscription_status || !PAYING_STATUSES.has(row.subscription_status)) return 0
  return calculateProMonthlyIdr(row.subscription_quantity ?? 0)
}

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const dp = Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const d = daysSince(iso) ?? 0
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// status → display label + badge colour. plan_tier 'free' (null status) reads
// as "Free"; the Stripe statuses get their own hues.
function statusBadge(row: OrgRow): { label: string; color: string; bg: string } {
  const s = row.plan_tier === 'free' ? 'free' : (row.subscription_status ?? 'free')
  switch (s) {
    case 'active': return { label: 'Active', color: '#15803d', bg: 'rgba(34,197,94,0.14)' }
    case 'trialing': return { label: 'Trial', color: '#1d4ed8', bg: 'rgba(59,130,246,0.14)' }
    case 'past_due': return { label: 'Past due', color: '#b45309', bg: 'rgba(245,158,11,0.16)' }
    case 'canceled': return { label: 'Canceled', color: '#6b7280', bg: 'rgba(107,114,128,0.14)' }
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return { label: s.replace(/_/g, ' '), color: '#b91c1c', bg: 'rgba(239,68,68,0.14)' }
    case 'paused': return { label: 'Paused', color: '#6b7280', bg: 'rgba(107,114,128,0.14)' }
    default: return { label: 'Free', color: '#6b7280', bg: 'rgba(107,114,128,0.10)' }
  }
}

type SortKey = 'created' | 'last_login' | 'employees' | 'mrr' | 'name'

export function Admin({ user }: { user: User }) {
  useFullWidthLayout()
  const [rows, setRows] = useState<OrgRow[] | null>(null)
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null)
  const [accountMetrics, setAccountMetrics] = useState<AccountMetrics | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'trial' | 'past_due' | 'free'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (!user.is_platform_admin) return
    supabase.rpc('admin_org_rows').then(({ data, error }) => {
      if (error) { setError(error.message); return }
      setRows((data ?? []) as OrgRow[])
    })
    // AI usage (last 30 days) — per-org/function/model breakdowns from ai_usage.
    supabase.rpc('admin_ai_usage', {}).then(({ data }) => {
      if (data) setAiUsage(data as unknown as AiUsage)
    })
    // OpenRouter account-level totals via the admin-metrics edge function.
    supabase.auth.getSession().then(({ data: s }) => {
      const token = s.session?.access_token
      if (!token) return
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      })
        .then(r => r.json())
        .then(m => setAccountMetrics(m as AccountMetrics))
        .catch(() => { /* account totals are best-effort */ })
    })
  }, [user.is_platform_admin])

  const kpis = useMemo(() => {
    if (!rows) return null
    const total = rows.length
    const active30d = rows.filter(r => { const d = daysSince(r.last_login); return d !== null && d <= 30 }).length
    const newThisWeek = rows.filter(r => { const d = daysSince(r.created_at); return d !== null && d <= 7 }).length
    const onboarded = rows.filter(r => r.onboarding_completed_at).length
    const mrrIdr = rows.reduce((sum, r) => sum + orgMrrIdr(r), 0)
    const paying = rows.filter(r => orgMrrIdr(r) > 0).length
    const trialing = rows.filter(r => r.subscription_status === 'trialing').length
    const pastDue = rows.filter(r => r.subscription_status === 'past_due').length
    const totalUsers = rows.reduce((s, r) => s + Number(r.user_count), 0)
    const totalEmployees = rows.reduce((s, r) => s + Number(r.employee_count), 0)
    return { total, active30d, newThisWeek, onboarded, mrrIdr, paying, trialing, pastDue, totalUsers, totalEmployees }
  }, [rows])

  const visible = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    let out = rows.filter(r => {
      if (q) {
        const hay = `${r.name} ${r.display_name ?? ''} ${r.owner_name ?? ''} ${r.owner_email ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      switch (statusFilter) {
        case 'paid': return r.subscription_status === 'active'
        case 'trial': return r.subscription_status === 'trialing'
        case 'past_due': return r.subscription_status === 'past_due'
        case 'free': return r.plan_tier === 'free'
        default: return true
      }
    })
    const dir = sortDir === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * a.name.localeCompare(b.name)
        case 'employees': return dir * (Number(a.employee_count) - Number(b.employee_count))
        case 'mrr': return dir * (orgMrrIdr(a) - orgMrrIdr(b))
        case 'last_login': return dir * ((new Date(a.last_login ?? 0).getTime()) - (new Date(b.last_login ?? 0).getTime()))
        case 'created':
        default: return dir * ((new Date(a.created_at).getTime()) - (new Date(b.created_at).getTime()))
      }
    })
    return out
  }, [rows, search, statusFilter, sortKey, sortDir])

  // Signups per month over the last 12 months, derived from the loaded rows —
  // no extra query needed.
  const signupBuckets = useMemo(() => {
    if (!rows) return []
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - k), 1)
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'short' }), count: 0 }
    })
    const idx = new Map(months.map((m, i) => [m.key, i]))
    for (const r of rows) {
      const d = new Date(r.created_at)
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (i !== undefined) months[i].count++
    }
    return months
  }, [rows])

  // Health/at-risk segments, all derived client-side from the rows.
  const health = useMemo(() => {
    if (!rows) return null
    const docs = (r: OrgRow) => Number(r.contract_count) + Number(r.sop_count) + Number(r.nda_count) + Number(r.form_count)
    return {
      dormant: rows.filter(r => { const d = daysSince(r.last_activity ?? r.last_login); return d !== null && d > 30 }),
      empty: rows.filter(r => Number(r.employee_count) === 0 && docs(r) === 0),
      incomplete: rows.filter(r => !r.onboarding_completed_at),
      ownerless: rows.filter(r => !r.owner_email),
    }
  }, [rows])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  function openOrg(orgId: string) {
    setSelectedOrgId(orgId)
    setDetail(null)
    supabase.rpc('admin_org_detail', { p_org_id: orgId }).then(({ data }) => {
      if (data) setDetail(data as unknown as OrgDetail)
    })
  }

  // Defense in depth — the nav entry is already hidden and the RPC re-checks the
  // bit, but a hand-typed /dashboard/admin shouldn't render for a normal user.
  // Placed after all hooks so hook order stays stable across renders.
  if (!user.is_platform_admin) return <Navigate to="/dashboard" replace />

  return (
    <div className="px-6 py-8 md:px-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Founder Console</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Platform-wide view of every account. Visible only to you.
          </p>
        </div>
        {rows && (
          <span className="text-sm tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
            {rows.length} account{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', backgroundColor: 'rgba(239,68,68,0.08)' }}>
          Couldn’t load admin data: {error}
        </div>
      )}

      {/* Pulse row */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Accounts" value={kpis ? String(kpis.total) : '—'} sub={kpis ? `${kpis.newThisWeek} new this week` : ''} />
        <KpiCard label="Active (30d)" value={kpis ? String(kpis.active30d) : '—'} sub={kpis ? `of ${kpis.total} signed in` : ''} />
        <KpiCard label="MRR" value={kpis ? formatIdr(kpis.mrrIdr) : '—'} sub={kpis ? `${kpis.paying} paying` : ''} />
        <KpiCard label="Employees" value={kpis ? kpis.totalEmployees.toLocaleString('en-US') : '—'} sub={kpis ? `${kpis.totalUsers} users` : ''} />
        <KpiCard label="Activation" value={kpis ? `${kpis.total ? Math.round((kpis.onboarded / kpis.total) * 100) : 0}%` : '—'} sub={kpis ? `${kpis.onboarded} onboarded` : ''} />
        <KpiCard label="AI spend" value={aiUsage ? usd(aiUsage.total.cost_usd) : '—'} sub={aiUsage ? `${aiUsage.total.calls} calls · 30d` : 'last 30 days'} />
      </div>

      {/* Growth — signups per month, derived from the loaded rows */}
      <div className="mb-8 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>Signups · last 12 months</div>
        <div style={{ width: '100%', height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={signupBuckets} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'var(--color-bg-tertiary)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }} />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or owner…"
          className="rounded-lg border px-3 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)', minWidth: '14rem' }}
        />
        <div className="flex items-center gap-1">
          {(['all', 'paid', 'trial', 'past_due', 'free'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className="rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors"
              style={statusFilter === f
                ? { backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }
                : { color: 'var(--color-text-tertiary)' }}>
              {f === 'past_due' ? 'past due' : f}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
          {visible.length} shown
        </span>
      </div>

      {/* Accounts table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <Th onClick={() => toggleSort('name')} active={sortKey === 'name'} dir={sortDir}>Account</Th>
              <Th>Status</Th>
              <Th right onClick={() => toggleSort('mrr')} active={sortKey === 'mrr'} dir={sortDir}>MRR</Th>
              <Th right onClick={() => toggleSort('employees')} active={sortKey === 'employees'} dir={sortDir}>Emp</Th>
              <Th right>Seats</Th>
              <Th right>Docs</Th>
              <Th onClick={() => toggleSort('last_login')} active={sortKey === 'last_login'} dir={sortDir}>Last login</Th>
              <Th>Activity</Th>
              <Th onClick={() => toggleSort('created')} active={sortKey === 'created'} dir={sortDir}>Signed up</Th>
              <Th>Stripe</Th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</td></tr>
            )}
            {rows && visible.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No accounts match.</td></tr>
            )}
            {visible.map(r => {
              const badge = statusBadge(r)
              const dunning = r.subscription_status === 'past_due' ? daysSince(r.past_due_since) : null
              const docs = Number(r.contract_count) + Number(r.sop_count) + Number(r.nda_count) + Number(r.form_count)
              const seats = r.subscription_quantity
              const overSeated = seats !== null && Number(r.employee_count) > seats
              return (
                <tr key={r.org_id} onClick={() => openOrg(r.org_id)} className="cursor-pointer border-t transition-colors hover:bg-[var(--color-bg-secondary)]" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium" style={{ color: 'var(--color-text)' }}>{r.display_name || r.name}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {r.owner_email || r.owner_name || '—'}
                      {!r.onboarding_completed_at && <span className="ml-1.5" style={{ color: '#b45309' }}>· setup incomplete</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: badge.color, backgroundColor: badge.bg }}>
                      {badge.label}
                    </span>
                    {dunning !== null && (
                      <span className="ml-1.5 text-xs font-semibold"
                        style={{ color: dunning >= 14 ? '#b91c1c' : dunning >= 7 ? '#b45309' : '#a16207' }}>
                        d{dunning}
                      </span>
                    )}
                    {r.cancel_at_period_end && (
                      <span className="ml-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>canceling</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {orgMrrIdr(r) > 0 ? formatIdr(orgMrrIdr(r)) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{Number(r.employee_count)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: overSeated ? '#b45309' : 'var(--color-text-tertiary)' }}>
                    {seats ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{docs}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{relativeTime(r.last_login)}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{relativeTime(r.last_activity)}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-tertiary)' }}>{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5">
                    {r.stripe_customer_id ? (
                      <a href={`https://dashboard.stripe.com/customers/${r.stripe_customer_id}`}
                        target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                        open ↗
                      </a>
                    ) : <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* AI usage panel (Phase 2) */}
      <div className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>AI usage</h2>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>last 30 days · cost billed by OpenRouter</span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Spend (30d)" value={aiUsage ? usd(aiUsage.total.cost_usd) : '—'} sub={aiUsage ? `${aiUsage.total.calls} calls` : ''} />
          <KpiCard label="Tokens (30d)" value={aiUsage ? compact(aiUsage.total.total_tokens) : '—'} sub={aiUsage ? `${compact(aiUsage.total.prompt_tokens)} in · ${compact(aiUsage.total.completion_tokens)} out` : ''} />
          <KpiCard label="OpenRouter balance" value={accountMetrics?.available ? usd(accountMetrics.balance) : '—'} sub="account-wide" muted={!accountMetrics?.available} />
          <KpiCard label="All-time spend" value={accountMetrics?.available ? usd(accountMetrics.total_usage) : '—'} sub="incl. Fireflies worker" muted={!accountMetrics?.available} />
        </div>

        {aiUsage && aiUsage.by_day.length > 0 && (
          <div className="mb-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>Spend per day (USD)</div>
            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={aiUsage.by_day} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="day" minTickGap={24} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} />
                  <YAxis width={40} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }} formatter={(value) => usd(Number(value))} />
                  <Area type="monotone" dataKey="cost_usd" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <BreakdownList title="By function" items={(aiUsage?.by_function ?? []).map(f => ({ key: f.function_name, label: f.function_name, cost: f.cost_usd, sub: `${f.calls} calls` }))} />
          <BreakdownList title="By model" items={(aiUsage?.by_model ?? []).map(m => ({ key: m.model, label: m.model, cost: m.cost_usd, sub: `${compact(m.total_tokens)} tok` }))} />
          <BreakdownList title="Top orgs by spend" items={(aiUsage?.by_org ?? []).map(o => ({ key: o.org_id ?? 'none', label: o.org_name ?? '(unattributed)', cost: o.cost_usd, sub: `${o.calls} calls` }))} />
        </div>

        {aiUsage && aiUsage.total.calls === 0 && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            No AI calls logged in the last 30 days yet — per-call rows accrue once the instrumented functions are deployed. Account-wide history is in the OpenRouter totals above.
          </p>
        )}
      </div>

      {/* Health & risk — all derived from the loaded rows */}
      {health && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Health &amp; risk</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HealthList title="Dormant (30d+)" hint="No activity in 30 days" orgs={health.dormant} onOpen={openOrg} />
            <HealthList title="Empty accounts" hint="0 employees & 0 docs" orgs={health.empty} onOpen={openOrg} />
            <HealthList title="Setup incomplete" hint="Onboarding not finished" orgs={health.incomplete} onOpen={openOrg} />
            <HealthList title="Ownerless" hint="Owner-claim likely pending" orgs={health.ownerless} onOpen={openOrg} />
          </div>
        </div>
      )}

      {selectedOrgId && (
        <OrgDetailDrawer detail={detail} onClose={() => { setSelectedOrgId(null); setDetail(null) }} />
      )}
    </div>
  )
}

function HealthList({ title, hint, orgs, onOpen }: { title: string; hint: string; orgs: OrgRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{orgs.length}</span>
      </div>
      <div className="mb-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</div>
      {orgs.length === 0 ? (
        <div className="py-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>None</div>
      ) : (
        <ul className="space-y-1">
          {orgs.slice(0, 6).map(o => (
            <li key={o.org_id}>
              <button onClick={() => onOpen(o.org_id)} className="block max-w-full truncate text-left text-sm hover:underline" style={{ color: 'var(--color-text-secondary)' }}>
                {o.display_name || o.name}
              </button>
            </li>
          ))}
          {orgs.length > 6 && <li className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>+{orgs.length - 6} more</li>}
        </ul>
      )}
    </div>
  )
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</div>
      {children}
    </div>
  )
}

function DrawerRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{k}</span>
      <span className="text-sm tabular-nums" style={{ color: 'var(--color-text)' }}>{v}</span>
    </div>
  )
}

function OrgDetailDrawer({ detail, onClose }: { detail: OrgDetail | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const org = detail?.org
  const mrr = org && org.plan_tier === 'pro' && org.subscription_status && PAYING_STATUSES.has(org.subscription_status)
    ? formatIdr(calculateProMonthlyIdr(org.subscription_quantity ?? 0))
    : '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose} aria-hidden="true" />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-l p-6 shadow-xl" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-md p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-tertiary)' }} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {!detail ? (
          <div className="pt-10 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            <h2 className="pr-8 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{org?.display_name || org?.name}</h2>
            <div className="mt-1 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{org?.company_email || '—'}</div>

            {detail.pending_claim && (
              <div className="mt-4 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: '#b45309', color: '#b45309', backgroundColor: 'rgba(245,158,11,0.08)' }}>
                Owner-claim pending → {detail.pending_claim.owner_email} (expires {fmtDate(detail.pending_claim.expires_at)})
              </div>
            )}

            <DrawerSection title="Billing">
              <DrawerRow k="Plan" v={org?.plan_tier === 'pro' ? 'Pro' : 'Free'} />
              <DrawerRow k="Status" v={org?.subscription_status || '—'} />
              <DrawerRow k="MRR" v={mrr} />
              <DrawerRow k="Employees billed" v={org?.subscription_quantity != null ? String(org.subscription_quantity) : '—'} />
              <DrawerRow k="Renews" v={fmtDate(org?.current_period_end ?? null)} />
              {org?.cancel_at_period_end && <DrawerRow k="Canceling" v="at period end" />}
              {org?.stripe_customer_id && (
                <DrawerRow k="Stripe" v={<a href={`https://dashboard.stripe.com/customers/${org.stripe_customer_id}`} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-primary)' }}>open ↗</a>} />
              )}
            </DrawerSection>

            <DrawerSection title="Content">
              <div className="grid grid-cols-2 gap-x-4">
                <DrawerRow k="Employees" v={String(detail.counts.employees)} />
                <DrawerRow k="Contracts" v={String(detail.counts.contracts)} />
                <DrawerRow k="SOPs" v={String(detail.counts.sops)} />
                <DrawerRow k="NDAs" v={String(detail.counts.ndas)} />
                <DrawerRow k="Forms" v={String(detail.counts.forms)} />
                <DrawerRow k="Letters" v={String(detail.counts.letters)} />
                <DrawerRow k="Job descriptions" v={String(detail.counts.job_descriptions)} />
              </div>
            </DrawerSection>

            <DrawerSection title="AI spend (30d)">
              <DrawerRow k="Cost" v={usd(detail.ai_30d.cost_usd)} />
              <DrawerRow k="Calls" v={String(detail.ai_30d.calls)} />
              <DrawerRow k="Tokens" v={compact(detail.ai_30d.total_tokens)} />
            </DrawerSection>

            <DrawerSection title={`Users (${detail.users.length})`}>
              <ul className="space-y-2">
                {detail.users.map(u => (
                  <li key={u.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm" style={{ color: 'var(--color-text)' }}>{u.name} <span style={{ color: 'var(--color-text-tertiary)' }}>· {u.role}</span></span>
                      <span className="block truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{u.email}</span>
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{relativeTime(u.last_sign_in_at)}</span>
                  </li>
                ))}
              </ul>
            </DrawerSection>

            <div className="mt-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Signed up {fmtDate(org?.created_at ?? null)}</div>
          </>
        )}
      </div>
    </div>
  )
}

function BreakdownList({ title, items }: { title: string; items: { key: string; label: string; cost: number; sub?: string }[] }) {
  const max = items.reduce((m, i) => Math.max(m, i.cost), 0) || 1
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</div>
      {items.length === 0 ? (
        <div className="py-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No data yet</div>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 8).map(it => (
            <li key={it.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm" style={{ color: 'var(--color-text)' }}>{it.label}</span>
                <span className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{usd(it.cost)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (it.cost / max) * 100)}%`, backgroundColor: 'var(--color-primary)' }} />
              </div>
              {it.sub && <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{it.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{
      borderColor: 'var(--color-border)',
      backgroundColor: 'var(--color-bg-secondary)',
      opacity: muted ? 0.6 : 1,
    }}>
      <div className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </div>
  )
}

function Th({ children, right, onClick, active, dir }: {
  children?: React.ReactNode
  right?: boolean
  onClick?: () => void
  active?: boolean
  dir?: 'asc' | 'desc'
}) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${right ? 'text-right' : 'text-left'} ${onClick ? 'cursor-pointer select-none' : ''}`}
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      {children}
      {active && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}
