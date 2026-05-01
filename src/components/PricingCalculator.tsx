import { useMemo, useState } from 'react'
import {
  PRO_BRACKETS,
  PRO_MIN_SEATS,
  calculateProMonthlyIdr,
  formatIdr,
} from '../lib/pricing'

const SLIDER_MIN = PRO_MIN_SEATS
const SLIDER_MAX = 100

type Props = {
  /** Compact variant — used in landing-page hero context. */
  compact?: boolean
}

export function PricingCalculator({ compact = false }: Props = {}) {
  const [seats, setSeats] = useState(10)
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  const monthly = useMemo(() => calculateProMonthlyIdr(seats), [seats])

  const bracketRows = useMemo(() => {
    const rows: { range: string; seats: number; rate: number; subtotal: number }[] = []
    let remaining = seats
    let prevCap = 0
    for (const bracket of PRO_BRACKETS) {
      const cap = bracket.upTo ?? Infinity
      const tierWidth = cap - prevCap
      const seatsInTier = Math.min(remaining, tierWidth)
      const rangeLabel =
        bracket.upTo === null
          ? `Seats ${prevCap + 1}+`
          : `Seats ${prevCap + 1}–${bracket.upTo}`
      rows.push({
        range: rangeLabel,
        seats: Math.max(seatsInTier, 0),
        rate: bracket.pricePerSeat,
        subtotal: Math.max(seatsInTier, 0) * bracket.pricePerSeat,
      })
      remaining -= seatsInTier
      if (remaining <= 0) break
      prevCap = cap
    }
    return rows
  }, [seats])

  const sliderValue = Math.min(seats, SLIDER_MAX)
  const showCapHint = seats >= SLIDER_MAX

  return (
    <div
      className="rounded-2xl border"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        padding: compact ? '1.25rem' : '1.75rem',
      }}
    >
      <div>
        <div
          className="mb-1 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Pro plan estimate
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={compact ? 'text-3xl font-semibold tracking-tight' : 'text-4xl font-semibold tracking-tight'}
            style={{ color: 'var(--color-text)' }}
          >
            {formatIdr(monthly)}
          </span>
          <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            / month
          </span>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-end justify-between">
          <label
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text-tertiary)' }}
            htmlFor="pricing-seat-count"
          >
            Employees
          </label>
          <div className="flex items-center gap-2">
            <input
              id="pricing-seat-count"
              type="number"
              min={SLIDER_MIN}
              value={seats}
              onChange={e => {
                const n = Number.parseInt(e.target.value, 10)
                if (Number.isFinite(n)) setSeats(Math.max(SLIDER_MIN, n))
              }}
              className="w-20 rounded-lg border px-2 py-1 text-right text-sm font-semibold"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {seats === 1 ? 'employee' : 'employees'}
            </span>
          </div>
        </div>

        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          value={sliderValue}
          onChange={e => setSeats(Number.parseInt(e.target.value, 10))}
          className="pricing-calculator-slider w-full"
          style={{ accentColor: 'var(--color-primary)' }}
        />
        <div
          className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <span>{SLIDER_MIN} min</span>
          <span>{SLIDER_MAX}+</span>
        </div>
        {showCapHint && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Larger team? Type the exact number above — graduated rates keep applying past 100.
          </p>
        )}
      </div>

      {!compact && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setBreakdownOpen(o => !o)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: breakdownOpen ? 'var(--color-bg-secondary)' : 'transparent',
            }}
            aria-expanded={breakdownOpen}
            aria-controls="pricing-breakdown"
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = breakdownOpen ? 'var(--color-bg-secondary)' : 'transparent' }}
          >
            <span>{breakdownOpen ? 'Hide breakdown' : 'See per-bracket breakdown'}</span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                transform: breakdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {breakdownOpen && (
            <div
              id="pricing-breakdown"
              className="mt-3 overflow-hidden rounded-xl border"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <th className="px-4 py-2.5">Bracket</th>
                    <th className="px-4 py-2.5 text-right">Seats</th>
                    <th className="px-4 py-2.5 text-right">Rate</th>
                    <th className="px-4 py-2.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {bracketRows.map(row => {
                    const dim = row.seats === 0
                    return (
                      <tr
                        key={row.range}
                        style={{
                          borderTop: '1px solid var(--color-border)',
                          opacity: dim ? 0.45 : 1,
                        }}
                      >
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text)' }}>
                          {row.range}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                          {row.seats}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                          {formatIdr(row.rate)}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right font-semibold tabular-nums"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {formatIdr(row.subtotal)}
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                    <td
                      colSpan={3}
                      className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      Total / month
                    </td>
                    <td
                      className="px-4 py-2.5 text-right font-semibold tabular-nums"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {formatIdr(monthly)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
