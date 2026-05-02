import { useLang } from '../../../../contexts/LanguageContext'
import type { Translations } from '../../../../lib/translations'

export const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}
export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

export function FormLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
      {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
    </label>
  )
}

export function Empty({ icon = '📭', title, hint }: { icon?: string; title: string; hint: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mb-2 text-2xl">{icon}</div>
      <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{title}</p>
      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>
    </div>
  )
}

export function Loading() {
  const { t } = useLang()
  return (
    <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
  )
}

export function formatDateLong(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatDateShort(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatMonthYear(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

export function formatIDR(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return 'Rp ' + value.toLocaleString('id-ID')
}

export const DEGREE_VALUES = [
  'elementary', 'junior_high', 'senior_high', 'diploma', 'bachelor', 'master', 'doctorate', 'other',
] as const
export type Degree = typeof DEGREE_VALUES[number]

export function degreeLabel(t: Translations, value: string | null): string | null {
  switch (value) {
    case 'elementary': return t.feDegreeElementary
    case 'junior_high': return t.feDegreeJuniorHigh
    case 'senior_high': return t.feDegreeSeniorHigh
    case 'diploma': return t.feDegreeDiploma
    case 'bachelor': return t.feDegreeBachelor
    case 'master': return t.feDegreeMaster
    case 'doctorate': return t.feDegreeDoctorate
    case 'other': return t.feDegreeOther
    default: return null
  }
}

export const DURATION_TYPE_VALUES = ['day', 'week', 'month', 'year'] as const
export type DurationType = typeof DURATION_TYPE_VALUES[number]

export function durationTypeLabel(t: Translations, value: string | null): string | null {
  switch (value) {
    case 'day': return t.ieDurationDay
    case 'week': return t.ieDurationWeek
    case 'month': return t.ieDurationMonth
    case 'year': return t.ieDurationYear
    default: return null
  }
}

/** Year-only select dropdown — wraps a native select with chevron styling. */
export function YearSelect({
  value, onChange, minYear, maxYear, placeholder,
}: {
  value: number | null
  onChange: (year: number | null) => void
  minYear: number
  maxYear: number
  placeholder?: string
}) {
  const years: number[] = []
  for (let y = maxYear; y >= minYear; y--) years.push(y)
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className="w-full rounded-lg border px-3 py-2 text-sm"
      style={inputStyle}
    >
      <option value="">{placeholder || ''}</option>
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  )
}

/** Compute years/months between two ISO dates (or with present as fallback). */
export function lengthOfService(t: Translations, fromISO: string | null, toISO: string | null): string {
  if (!fromISO) return '—'
  const from = new Date(fromISO + 'T00:00:00')
  const to = toISO ? new Date(toISO + 'T00:00:00') : new Date()
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return '—'
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) return '—'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return t.weLengthMonths(m)
  if (m === 0) return t.weLengthYears(y)
  return t.weLengthYearsMonths(y, m)
}
