import { useMemo, useState } from 'react'
import {
  PRO_BRACKETS,
  PRO_MIN_SEATS,
  calculateProMonthlyIdr,
  calculateProAnnualMonthlyEquivalent,
  formatIdr,
} from '../lib/pricing'

const SLIDER_MIN = PRO_MIN_SEATS
const SLIDER_MAX = 100

type Props = {
  /** Show annual savings line. */
  showAnnualToggle?: boolean
  /** Compact variant — used in landing-page hero context. */
  compact?: boolean
}

export function PricingCalculator({ showAnnualToggle = true, compact = false }: Props) {
  const [seats, setSeats] = useState(10)
  const [annual, setAnnual] = useState(false)

  const monthly = useMemo(() => calculateProMonthlyIdr(seats), [seats])
  const annualPerMonth = useMemo(() => calculateProAnnualMonthlyEquivalent(seats), [seats])
  const displayed = annual ? annualPerMonth : monthly

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
      <div className="flex items-start justify-between gap-4">
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
              {formatIdr(displayed)}
            </span>
            <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              / month
            </span>
          </div>
          {annual && (
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Billed annually · saves {formatIdr((monthly - annualPerMonth) * 12)} / year
            </div>
          )}
        </div>

        {showAnnualToggle && (
          <div
            className="inline-flex items-center gap-1 rounded-full border p-1"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: !annual ? 'var(--color-bg)' : 'transparent',
                color: !annual ? 'var(--color-text)' : 'var(--color-text-secondary)',
                boxShadow: !annual ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: annual ? 'var(--color-bg)' : 'transparent',
                color: annual ? 'var(--color-text)' : 'var(--color-text-secondary)',
                boxShadow: annual ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              Annual
              <span
                className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                style={{
                  backgroundColor: 'var(--color-diff-add)',
                  color: 'var(--color-success)',
                }}
              >
                −20%
              </span>
            </button>
          </div>
        )}
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
        <div
          className="mt-5 rounded-xl border"
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
  )
}
