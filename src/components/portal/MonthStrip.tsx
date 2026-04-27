import { useEffect, useMemo, useRef } from 'react'

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

function formatMonthLabel(monthIso: string, lang: 'en' | 'id', includeYear: boolean): string {
  const date = new Date(monthIso + 'T00:00:00')
  const fmt = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    month: 'long',
    year: includeYear ? 'numeric' : undefined,
  })
  return fmt.format(date)
}

export function MonthStrip({ selectedMonth, earliestMonth, currentMonth, onSelect, lang }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const programmaticScrollRef = useRef(false)
  const scrollTimerRef = useRef<number | null>(null)

  const months = useMemo(() => buildMonthList(earliestMonth, currentMonth), [earliestMonth, currentMonth])
  const currentYear = currentMonth.slice(0, 4)

  // Center the selected item when it changes (or on mount).
  useEffect(() => {
    const el = itemRefs.current[selectedMonth]
    const container = containerRef.current
    if (!el || !container) return
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2
    programmaticScrollRef.current = true
    container.scrollTo({ left: target, behavior: 'smooth' })
    // Clear the programmatic flag after the smooth-scroll has time to settle.
    window.setTimeout(() => { programmaticScrollRef.current = false }, 400)
  }, [selectedMonth])

  // After user scroll settles, snap selection to whichever month is closest to center.
  function handleScroll() {
    if (programmaticScrollRef.current) return
    if (scrollTimerRef.current != null) window.clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = window.setTimeout(() => {
      const container = containerRef.current
      if (!container) return
      const center = container.scrollLeft + container.clientWidth / 2
      let closest: { month: string; dist: number } | null = null
      for (const month of months) {
        const el = itemRefs.current[month]
        if (!el) continue
        const itemCenter = el.offsetLeft + el.offsetWidth / 2
        const dist = Math.abs(itemCenter - center)
        if (closest == null || dist < closest.dist) closest = { month, dist }
      }
      if (closest && closest.month !== selectedMonth) onSelect(closest.month)
    }, 120)
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="month-strip -mx-4 flex snap-x snap-mandatory gap-8 overflow-x-auto px-[45%] py-3"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`.month-strip::-webkit-scrollbar { display: none; }`}</style>
      {months.map(month => {
        const isSelected = month === selectedMonth
        const showYear = month.slice(0, 4) !== currentYear
        return (
          <button
            key={month}
            ref={el => { itemRefs.current[month] = el }}
            type="button"
            onClick={() => onSelect(month)}
            className="snap-center shrink-0 whitespace-nowrap text-xl font-semibold transition-all duration-200"
            style={{
              color: isSelected ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              opacity: isSelected ? 1 : 0.45,
              transform: isSelected ? 'scale(1)' : 'scale(0.85)',
            }}
          >
            {formatMonthLabel(month, lang, showYear)}
          </button>
        )
      })}
    </div>
  )
}
