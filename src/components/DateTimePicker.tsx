// Notion-style date + time picker.
//
// Trigger button shows the current value (or placeholder). Clicking opens a
// popover with a month calendar grid and a time input. Outside-click and
// Escape close it. Value flows in/out as a datetime-local string
// ("YYYY-MM-DDTHH:MM") so the parent form's existing serialization works
// unchanged. Empty string means "no value".

import { useEffect, useMemo, useRef, useState } from 'react'

interface Props {
  value: string                       // datetime-local string, "" if unset
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
}

export function DateTimePicker({ value, onChange, placeholder = 'Pick a date…', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentDate = useMemo(() => parseLocalInput(value), [value])
  const [viewYear, setViewYear] = useState(() => (currentDate ?? new Date()).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (currentDate ?? new Date()).getMonth())

  // Reset the visible month when the value jumps (e.g. via Clear or external update).
  useEffect(() => {
    if (currentDate) {
      setViewYear(currentDate.getFullYear())
      setViewMonth(currentDate.getMonth())
    }
  }, [value, currentDate])

  // Outside click + Escape close.
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function selectDay(day: Date) {
    // Preserve the current time component if one is set; otherwise default to
    // the current local hour:minute, rounded forward to a sensible default.
    const base = currentDate ?? defaultStartTime()
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes())
    onChange(toLocalInput(next))
  }

  function setTime(hours: number, minutes: number) {
    const base = currentDate ?? defaultStartTime()
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes)
    onChange(toLocalInput(next))
  }

  function clear() {
    onChange('')
    setOpen(false)
  }

  function nudgeMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  function quickPick(option: 'in1h' | 'tomorrow') {
    const d = new Date()
    if (option === 'in1h') {
      d.setHours(d.getHours() + 1)
      d.setMinutes(0)
    } else {
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
    }
    onChange(toLocalInput(d))
  }

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg)',
          color: currentDate ? 'var(--color-text)' : 'var(--color-text-tertiary)',
        }}
      >
        <span>{currentDate ? formatDisplay(currentDate) : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && !disabled && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[300px] rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {/* Quick presets */}
          <div className="flex gap-2 border-b p-2" style={{ borderColor: 'var(--color-border)' }}>
            <PresetButton onClick={() => quickPick('in1h')}>In 1 hour</PresetButton>
            <PresetButton onClick={() => quickPick('tomorrow')}>Tomorrow 9 am</PresetButton>
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              onClick={() => nudgeMonth(-1)}
              className="rounded-md p-1 hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
              aria-label="Previous month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {monthName(viewMonth)} {viewYear}
            </div>
            <button
              type="button"
              onClick={() => nudgeMonth(1)}
              className="rounded-md p-1 hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
              aria-label="Next month"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Calendar grid */}
          <div className="px-2 pb-2">
            <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[10px] font-medium uppercase" style={{ color: 'var(--color-text-tertiary)' }}>
              {DOW_HEADERS.map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {buildMonthGrid(viewYear, viewMonth).map((day, i) => {
                const isCurrentMonth = day.getMonth() === viewMonth
                const isToday = sameDay(day, new Date())
                const isSelected = currentDate && sameDay(day, currentDate)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectDay(day)}
                    className="flex h-8 items-center justify-center rounded-md text-xs"
                    style={{
                      color: isSelected
                        ? 'white'
                        : isCurrentMonth
                          ? (isToday ? 'var(--color-primary)' : 'var(--color-text)')
                          : 'var(--color-text-tertiary)',
                      backgroundColor: isSelected
                        ? 'var(--color-primary)'
                        : isToday
                          ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                          : 'transparent',
                      fontWeight: isSelected || isToday ? 600 : 400,
                    }}
                    onMouseOver={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { if (!isSelected) e.currentTarget.style.backgroundColor = isToday ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent' }}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time input + footer */}
          <div className="flex items-center justify-between border-t p-2" style={{ borderColor: 'var(--color-border)' }}>
            <TimeInput
              date={currentDate}
              onChange={setTime}
            />
            <button
              type="button"
              onClick={clear}
              className="rounded-md px-2 py-1 text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Time input (12-hour with AM/PM) ────────────────────

function TimeInput({ date, onChange }: { date: Date | null; onChange: (h: number, m: number) => void }) {
  const h24 = date?.getHours() ?? 9
  const minute = date?.getMinutes() ?? 0
  const isPm = h24 >= 12
  const h12 = ((h24 % 12) || 12)

  function setHour12(next: number) {
    if (next < 1) next = 12
    if (next > 12) next = 1
    const next24 = (next % 12) + (isPm ? 12 : 0)
    onChange(next24, minute)
  }

  function setMinuteVal(next: number) {
    if (next < 0) next = 59
    if (next > 59) next = 0
    onChange(h24, next)
  }

  function togglePm() {
    onChange((h24 + 12) % 24, minute)
  }

  return (
    <div className="flex items-center gap-1">
      <NumberInput value={h12} onChange={setHour12} min={1} max={12} aria-label="Hour" />
      <span style={{ color: 'var(--color-text-tertiary)' }}>:</span>
      <NumberInput value={minute} onChange={setMinuteVal} min={0} max={59} aria-label="Minute" pad />
      <button
        type="button"
        onClick={togglePm}
        className="ml-1 rounded-md border px-2 py-0.5 text-xs font-semibold"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text)',
        }}
      >
        {isPm ? 'PM' : 'AM'}
      </button>
    </div>
  )
}

function NumberInput({ value, onChange, min, max, pad, ...rest }: {
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  pad?: boolean
} & React.AriaAttributes) {
  const [draft, setDraft] = useState<string>(format(value, pad))
  // Keep draft synced when value changes externally.
  useEffect(() => { setDraft(format(value, pad)) }, [value, pad])
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={() => {
        const parsed = parseInt(draft, 10)
        if (Number.isFinite(parsed)) {
          const clamped = Math.max(min, Math.min(max, parsed))
          onChange(clamped)
          setDraft(format(clamped, pad))
        } else {
          setDraft(format(value, pad))
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'ArrowUp') { e.preventDefault(); onChange(value + 1) }
        if (e.key === 'ArrowDown') { e.preventDefault(); onChange(value - 1) }
      }}
      className="w-8 rounded-md border bg-transparent px-1 py-0.5 text-center text-sm"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-text)',
      }}
    />
  )
}

function format(n: number, pad?: boolean): string {
  return pad ? String(n).padStart(2, '0') : String(n)
}

// ─── Helpers ────────────────────────────────────────────

const DOW_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function buildMonthGrid(year: number, month: number): Date[] {
  // 6 weeks × 7 days, starting Monday. Days outside the active month are
  // included so the grid stays a stable size.
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7  // Monday=0
  const start = new Date(year, month, 1 - offset)
  const out: Date[] = []
  for (let i = 0; i < 42; i++) {
    out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return out
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function monthName(month: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month]
}

function defaultStartTime(): Date {
  // Default to today at the next half-hour.
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0)
  if (d.getMinutes() === 0) d.setHours(d.getHours() + 1)
  d.setSeconds(0, 0)
  return d
}

function parseLocalInput(s: string): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDisplay(d: Date): string {
  // Match the existing UI's English short style: "29 Apr 2026, 6:56 pm".
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h24 = d.getHours()
  const isPm = h24 >= 12
  const h12 = (h24 % 12) || 12
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${h12}:${minute} ${isPm ? 'pm' : 'am'}`
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-md border px-2 py-1 text-xs font-medium"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      {children}
    </button>
  )
}
