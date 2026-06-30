// Shared analytics primitives — summary stat cards, a "vs last month" trend
// tile, a sparkline, and chart scaffolding (tooltip styling, compact-rupiah
// axis labels, month helpers). Used by both the Payroll and Performance pages
// so their KPI surfaces stay in sync. Each page composes its own charts panel
// from ChartCard + recharts; only the presentation primitives live here.

import { type ReactNode } from 'react'

// One month of org-wide totals (oldest → newest) from the payroll_trend RPC.
export type TrendPoint = {
  period: string
  total_payout_idr: number
  total_bonus_idr: number
  total_deduction_idr: number
}

export const CHART_BLUE = '#3b82f6'
export const CHART_GREEN = '#10b981'
export const CHART_RED = '#ef4444'

export const CHART_TOOLTIP = {
  backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12,
} as const

// Compact rupiah for axis ticks (5,200,000 → "5.2M" / "5,2jt").
export function compactIdr(v: number, lang: 'en' | 'id'): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const units: Array<[number, string]> = lang === 'id'
    ? [[1e9, 'M'], [1e6, 'jt'], [1e3, 'rb']]
    : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [base, suffix] of units) {
    if (abs >= base) {
      const n = abs / base
      return `${sign}${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}${suffix}`
    }
  }
  return `${sign}${abs}`
}

// Shift an ISO first-of-month back n months (for a MonthStrip window).
export function monthsAgo(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number)
  let yy = y
  let mm = m - n
  while (mm < 1) { mm += 12; yy -= 1 }
  return `${yy}-${String(mm).padStart(2, '0')}-01`
}

// Short month label for a first-of-month ISO. Parsed as a local date (not UTC)
// so it never slips to the previous month in negative-offset timezones.
export function monthShort(iso: string, lang: 'en' | 'id'): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { month: 'short' })
}

// Full month + year label (e.g. "June 2026").
export function monthLong(iso: string, lang: 'en' | 'id'): string {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' })
}

export function StatCard({ label, value, hint, emphasis, tone }: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
  tone?: 'danger' | 'success'
}) {
  const valueColor = tone === 'danger' ? 'var(--color-danger)' : tone === 'success' ? 'var(--color-success)' : 'var(--color-text)'
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className={`mt-0.5 tabular-nums ${emphasis ? 'text-lg font-semibold' : 'text-base font-medium'}`} style={{ color: valueColor }}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</div>}
    </div>
  )
}

// "vs last month" tile: % delta of the last two points + a sparkline of the
// whole series. Neutral on purpose (a swing isn't inherently good/bad). Click
// toggles an expandable charts panel owned by the parent.
export function TrendCard({ values, label, newLabel, open, onToggle }: {
  values: number[] | null
  label: string
  newLabel: string
  open: boolean
  onToggle: () => void
}) {
  const series = values ?? []
  const cur = series[series.length - 1]
  const prev = series.length >= 2 ? series[series.length - 2] : undefined

  let delta: ReactNode = '—'
  let deltaColor = 'var(--color-text-tertiary)'
  if (values === null) {
    delta = '…'
  } else if (cur !== undefined && prev !== undefined && prev > 0) {
    const pct = ((cur - prev) / prev) * 100
    const up = pct >= 0
    deltaColor = 'var(--color-text)'
    delta = `${up ? '↑' : '↓'} ${Math.abs(pct).toFixed(Math.abs(pct) < 10 && pct % 1 !== 0 ? 1 : 0)}%`
  } else if (cur !== undefined && prev !== undefined && prev === 0 && cur > 0) {
    deltaColor = 'var(--color-text)'
    delta = newLabel
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="rounded-xl border p-3 text-left transition-colors"
      style={{ borderColor: 'var(--color-border)' }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary, var(--color-bg))' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none', color: 'var(--color-text-tertiary)' }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <span className="text-base font-medium tabular-nums" style={{ color: deltaColor }}>{delta}</span>
        <Sparkline values={series} />
      </div>
    </button>
  )
}

export function Sparkline({ values, color = CHART_BLUE, width = 64, height = 24, pad = 3 }: {
  values: number[]
  color?: string
  width?: number
  height?: number
  pad?: number
}) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  const pts = values.map((v, i): [number, number] => [
    i * stepX,
    pad + (1 - (v - min) / range) * (height - 2 * pad),
  ])
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2} fill={color} />
    </svg>
  )
}

export function ChartCard({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{title}</h3>
        {legend}
      </div>
      <div className="h-48 w-full">{children}</div>
    </div>
  )
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
