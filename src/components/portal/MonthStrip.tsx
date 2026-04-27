import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

type Props = {
  selectedMonth: string
  earliestMonth: string
  currentMonth: string
  onSelect: (month: string) => void
  lang: 'en' | 'id'
}

function buildMonthList(earliest: string, current: string): string[] {
  const out: string[] = []
  const [ey, em] = earliest.split('-').map(Number)
  const [cy, cm] = current.split('-').map(Number)
  let y = ey
  let m = em
  while (y < cy || (y === cy && m <= cm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

function formatMonthLong(monthIso: string, lang: 'en' | 'id'): string {
  const date = new Date(monthIso + 'T00:00:00')
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long' }).format(date)
}

function formatMonthShort(monthIso: string, lang: 'en' | 'id'): string {
  const date = new Date(monthIso + 'T00:00:00')
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'short' }).format(date)
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function MonthStrip({ selectedMonth, earliestMonth, currentMonth, onSelect, lang }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const settleTimerRef = useRef<number | null>(null)
  const programmaticUntilRef = useRef(0)
  const selectedMonthRef = useRef(selectedMonth)
  const onSelectRef = useRef(onSelect)
  const monthsRef = useRef<string[]>([])
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const pickerBtnRef = useRef<HTMLButtonElement | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const months = useMemo(() => buildMonthList(earliestMonth, currentMonth), [earliestMonth, currentMonth])

  // Group months by year for both the inline strip separators and the picker.
  const yearGroups = useMemo(() => {
    const groups: Array<{ year: string; months: string[] }> = []
    for (const m of months) {
      const y = m.slice(0, 4)
      const last = groups[groups.length - 1]
      if (last && last.year === y) last.months.push(m)
      else groups.push({ year: y, months: [m] })
    }
    return groups
  }, [months])
  const showYearLabels = yearGroups.length > 1

  selectedMonthRef.current = selectedMonth
  onSelectRef.current = onSelect
  monthsRef.current = months

  function centerOn(month: string, behavior: ScrollBehavior): boolean {
    const container = containerRef.current
    const el = itemRefs.current[month]
    if (!container || !el || container.clientWidth === 0) return false
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const itemCenterInScrollCoords =
      (eRect.left - cRect.left) + container.scrollLeft + eRect.width / 2
    const target = itemCenterInScrollCoords - container.clientWidth / 2
    if (behavior === 'smooth') programmaticUntilRef.current = Date.now() + 700
    container.scrollTo({ left: Math.max(0, target), behavior })
    return true
  }

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const settle = () => { centerOn(selectedMonthRef.current, 'auto') }
    settle()
    const ro = new ResizeObserver(settle)
    ro.observe(container)
    const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    if (fontsReady) fontsReady.then(() => settle())
    return () => ro.disconnect()
  }, [])

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    centerOn(selectedMonth, 'smooth')
  }, [selectedMonth])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    function onScroll() {
      if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = window.setTimeout(() => {
        if (Date.now() < programmaticUntilRef.current) return
        const c = containerRef.current
        if (!c) return
        const cRect = c.getBoundingClientRect()
        const containerCenter = cRect.left + cRect.width / 2
        let closest: { month: string; dist: number } | null = null
        for (const m of monthsRef.current) {
          const el = itemRefs.current[m]
          if (!el) continue
          const r = el.getBoundingClientRect()
          const itemCenter = r.left + r.width / 2
          const d = Math.abs(itemCenter - containerCenter)
          if (closest == null || d < closest.dist) closest = { month: m, dist: d }
        }
        if (closest && closest.month !== selectedMonthRef.current) onSelectRef.current(closest.month)
      }, 160)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    }
  }, [])

  // Click-outside dismissal for the calendar picker popover.
  useEffect(() => {
    if (!pickerOpen) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (pickerRef.current?.contains(t)) return
      if (pickerBtnRef.current?.contains(t)) return
      setPickerOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [pickerOpen])

  const fadeMask = 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)'

  return (
    <div className="relative -mx-4 mb-2 flex items-center">
      <div
        ref={containerRef}
        className="month-strip relative flex min-w-0 flex-1 snap-x snap-proximity gap-6 overflow-x-auto px-[45%] py-3"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitMaskImage: fadeMask,
          maskImage: fadeMask,
        }}
      >
        <style>{`.month-strip::-webkit-scrollbar { display: none; }`}</style>
        {yearGroups.flatMap(group => {
          const labelNode = showYearLabels ? (
            <div
              key={`year-${group.year}`}
              aria-hidden
              className="pointer-events-none flex shrink-0 items-center whitespace-nowrap text-sm font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {group.year}
            </div>
          ) : null
          const monthNodes = group.months.map(month => {
            const isSelected = month === selectedMonth
            return (
              <button
                key={month}
                ref={el => { itemRefs.current[month] = el }}
                type="button"
                onClick={() => { if (month !== selectedMonth) onSelect(month) }}
                className="snap-center shrink-0 whitespace-nowrap text-xl font-semibold transition-colors duration-200"
                style={{
                  color: isSelected ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                }}
              >
                {formatMonthLong(month, lang)}
              </button>
            )
          })
          return labelNode ? [labelNode, ...monthNodes] : monthNodes
        })}
      </div>

      <button
        ref={pickerBtnRef}
        type="button"
        onClick={() => setPickerOpen(o => !o)}
        aria-label="Pick a month"
        className="ml-1 mr-3 shrink-0 rounded-lg p-2 transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <CalendarIcon />
      </button>

      {pickerOpen && (
        <div
          ref={pickerRef}
          className="absolute right-3 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border p-2 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          {[...yearGroups].reverse().map(group => (
            <div key={group.year} className="mb-2 last:mb-0">
              <div
                className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {group.year}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {group.months.map(m => {
                  const isSelected = m === selectedMonth
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { onSelect(m); setPickerOpen(false) }}
                      className="rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        color: isSelected ? '#fff' : 'var(--color-text-secondary)',
                        backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                      }}
                      onMouseOver={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
                      onMouseOut={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      {formatMonthShort(m, lang)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
