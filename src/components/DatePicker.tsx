import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../contexts/LanguageContext'

interface DatePickerProps {
  /** ISO date string YYYY-MM-DD, or '' for empty. */
  value: string
  onChange: (next: string) => void
  /** Earliest selectable year. Default: current year - 100. */
  minYear?: number
  /** Latest selectable year. Default: current year + 10. */
  maxYear?: number
  placeholder?: string
  disabled?: boolean
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function parseISO(s: string): { y: number; m: number; d: number } | null {
  if (!s) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function formatDisplay(s: string): string {
  const parts = parseISO(s)
  if (!parts) return ''
  const date = new Date(parts.y, parts.m - 1, parts.d)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysInMonth(year: number, month: number): number {
  // month is 1-12. JS Date with day=0 returns last day of previous month.
  return new Date(year, month, 0).getDate()
}

/** Mon=0 ... Sun=6 — week starts on Monday since this app's audience is Indonesia/AU/etc. */
function firstDayOffset(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay() // 0=Sun ... 6=Sat
  return (jsDay + 6) % 7
}

export function DatePicker({ value, onChange, minYear, maxYear, placeholder, disabled }: DatePickerProps) {
  const { t } = useLang()
  const today = new Date()
  const fallbackYear = today.getFullYear()
  const lo = minYear ?? fallbackYear - 100
  const hi = maxYear ?? fallbackYear + 10

  const parsed = parseISO(value)
  const initialView = parsed
    ? { y: parsed.y, m: parsed.m }
    : { y: today.getFullYear(), m: today.getMonth() + 1 }

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(initialView.y)
  const [viewMonth, setViewMonth] = useState(initialView.m)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the popover view in sync if the value changes externally.
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.y)
      setViewMonth(parsed.m)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Close on escape.
  useEffect(() => {
    if (!open) return
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open])

  const monthNames = useMemo(() => ([
    t.monthJan, t.monthFeb, t.monthMar, t.monthApr, t.monthMay, t.monthJun,
    t.monthJul, t.monthAug, t.monthSep, t.monthOct, t.monthNov, t.monthDec,
  ]), [t])

  const weekdayShort = useMemo(() => ([
    t.weekdayMon, t.weekdayTue, t.weekdayWed, t.weekdayThu, t.weekdayFri, t.weekdaySat, t.weekdaySun,
  ]), [t])

  const years: number[] = []
  for (let y = hi; y >= lo; y--) years.push(y)

  const totalDays = daysInMonth(viewYear, viewMonth)
  const offset = firstDayOffset(viewYear, viewMonth)
  const cells: (number | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  function selectDay(d: number) {
    onChange(`${viewYear}-${pad2(viewMonth)}-${pad2(d)}`)
    setOpen(false)
  }

  function clear() {
    onChange('')
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    while (m < 1) { m += 12; y -= 1 }
    while (m > 12) { m -= 12; y += 1 }
    if (y < lo) { y = lo; m = 1 }
    if (y > hi) { y = hi; m = 12 }
    setViewMonth(m)
    setViewYear(y)
  }

  const display = formatDisplay(value)
  const selected = parsed
  const todayY = today.getFullYear()
  const todayM = today.getMonth() + 1
  const todayD = today.getDate()

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
        style={inputStyle}
      >
        <span style={{ color: display ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
          {display || placeholder || t.datePickerPlaceholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border p-3 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {/* Month/year quick-jump row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: 'var(--color-text-secondary)' }}
              aria-label={t.datePickerPrevMonth}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <select
              value={viewMonth}
              onChange={e => setViewMonth(Number(e.target.value))}
              className="flex-1 appearance-none rounded-md border px-2 py-1 text-sm"
              style={inputStyle}
            >
              {monthNames.map((name, i) => (
                <option key={i} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={viewYear}
              onChange={e => setViewYear(Number(e.target.value))}
              className="appearance-none rounded-md border px-2 py-1 text-sm"
              style={inputStyle}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: 'var(--color-text-secondary)' }}
              aria-label={t.datePickerNextMonth}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Weekday header */}
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {weekdayShort.map((w, i) => <div key={i}>{w}</div>)}
          </div>

          {/* Day grid */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />
              const isSelected = !!selected && selected.y === viewYear && selected.m === viewMonth && selected.d === d
              const isToday = todayY === viewYear && todayM === viewMonth && todayD === d
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(d)}
                  className="aspect-square rounded-md text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  style={{
                    backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--color-text)',
                    fontWeight: isToday && !isSelected ? 600 : 400,
                    outline: isToday && !isSelected ? `1px solid var(--color-border-strong)` : 'none',
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              onClick={() => {
                const y = todayY
                const m = todayM
                if (y >= lo && y <= hi) {
                  setViewYear(y)
                  setViewMonth(m)
                }
              }}
              className="text-xs"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.datePickerToday}
            </button>
            {value && (
              <button
                type="button"
                onClick={clear}
                className="text-xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t.datePickerClear}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
