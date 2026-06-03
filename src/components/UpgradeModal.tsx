import { useEffect, useState } from 'react'
import { calculateProMonthlyIdr, formatIdr, PRO_BRACKETS, PRO_MIN_SEATS } from '../lib/pricing'
import { startCheckout, updateSeats } from '../lib/billing'
import type { Translations } from '../lib/translations'

// Dual-mode plan modal. Same seat picker UI for both:
//   mode='upgrade' — Free org buying Pro for the first time. CTA → Stripe
//                    Checkout. cancelReturnPath = where Stripe redirects on
//                    cancel.
//   mode='adjust'  — Pro org changing their committed seat count. CTA calls
//                    /billing/update-seats which updates the existing
//                    subscription with proration. minSeats must be set to
//                    max(currentEmployees, PRO_MIN_SEATS) by the caller — the
//                    server enforces this floor too.
export function UpgradeModal({
  t,
  mode = 'upgrade',
  initialSeats,
  minSeats = PRO_MIN_SEATS,
  cancelReturnPath,
  onClose,
  onAdjusted,
}: {
  t: Translations
  mode?: 'upgrade' | 'adjust'
  initialSeats: number
  minSeats?: number
  cancelReturnPath: string
  onClose: () => void
  onAdjusted?: () => void
}) {
  const startingSeats = Math.max(initialSeats, minSeats)
  const [seats, setSeats] = useState<number>(startingSeats)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, busy])

  const total = calculateProMonthlyIdr(seats)
  const breakdown = computeBreakdown(seats)

  async function handleContinue() {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'adjust') {
        await updateSeats(seats)
        onAdjusted?.()
        onClose()
        return
      }
      const url = await startCheckout({
        successUrl: `${window.location.origin}/dashboard/settings?tab=billing&checkout=success`,
        cancelUrl: `${window.location.origin}${cancelReturnPath}`,
        seats,
      })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const title = mode === 'adjust' ? t.adjustModalTitle : t.upgradeModalTitle
  const subtitleTemplate = mode === 'adjust' ? t.adjustModalSubtitle : t.upgradeModalSubtitle
  const subtitle = subtitleTemplate.replace('{min}', String(minSeats))
  const ctaIdle = mode === 'adjust' ? t.adjustModalSave : t.upgradeModalContinue
  const ctaBusy = mode === 'adjust' ? t.adjustModalSaving : t.billingRedirecting

  function bumpSeats(delta: number) {
    setSeats(s => Math.max(minSeats, s + delta))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 transition-colors disabled:opacity-40"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-1 pr-8 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {subtitle}
        </p>

        <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.upgradeModalEmployeesLabel}
        </label>
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => bumpSeats(-1)}
              disabled={seats <= minSeats}
              className="flex h-9 w-9 items-center justify-center rounded-md border text-base font-semibold transition-opacity disabled:opacity-30"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg-secondary)' }}
            >
              −
            </button>
            <input
              type="number"
              min={minSeats}
              value={seats}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isNaN(n)) setSeats(Math.max(minSeats, Math.min(10_000, n)))
              }}
              className="w-24 rounded-md border bg-transparent px-2 py-1.5 text-center text-lg font-semibold outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => bumpSeats(1)}
              className="flex h-9 w-9 items-center justify-center rounded-md border text-base font-semibold transition-opacity"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg-secondary)' }}
            >
              +
            </button>
            <span className="ml-1 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.billingSeats}
            </span>
          </div>
          <input
            type="range"
            min={minSeats}
            max={100}
            value={Math.min(seats, 100)}
            onChange={e => setSeats(parseInt(e.target.value, 10))}
            className="w-full"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>{minSeats} {t.billingSeats}</span>
            <span>100+</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowBreakdown(s => !s)}
          className="mb-3 flex w-full items-center justify-between text-sm transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <span>{t.upgradeModalBreakdown}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showBreakdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showBreakdown && (
          <ul className="mb-4 space-y-1 rounded-md p-3 text-sm" style={{ backgroundColor: 'var(--color-bg)' }}>
            {breakdown.map((b, i) => (
              <li key={i} className="flex justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                <span>{b.label}</span>
                <span>{formatIdr(b.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}

        <div
          className="mb-5 flex items-baseline justify-between border-t pt-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {seats} {t.billingSeats} · {t.billingPlanPro}
          </span>
          <span>
            <span className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
              {formatIdr(total)}
            </span>
            <span className="ml-1 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              / month
            </span>
          </span>
        </div>

        {error && (
          <p className="mb-3 text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {busy ? ctaBusy : ctaIdle}
          </button>
        </div>
      </div>
    </div>
  )
}

function computeBreakdown(seats: number): { label: string; subtotal: number }[] {
  const billable = Math.max(seats, PRO_MIN_SEATS)
  const out: { label: string; subtotal: number }[] = []
  let remaining = billable
  let prevCap = 0
  for (const bracket of PRO_BRACKETS) {
    const cap = bracket.upTo ?? Infinity
    const tierWidth = cap - prevCap
    const seatsInTier = Math.min(remaining, tierWidth)
    if (seatsInTier <= 0) break
    const range = bracket.upTo === null ? `${prevCap + 1}+` : `${prevCap + 1}–${bracket.upTo}`
    out.push({
      label: `Employees ${range} · ${seatsInTier} × ${formatIdr(bracket.pricePerSeat)}`,
      subtotal: seatsInTier * bracket.pricePerSeat,
    })
    remaining -= seatsInTier
    prevCap = cap
  }
  return out
}
