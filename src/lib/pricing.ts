// Pricing model: graduated per-seat brackets, IDR.
// Pro plan only — Free plan is flat (Rp 0, capped at FREE_EMPLOYEE_LIMIT).

export const FREE_EMPLOYEE_LIMIT = 2
export const FREE_DOCS_PER_EMPLOYEE = 1 // 1 contract + 1 SOP per employee

export const PRO_MIN_SEATS = 3

export type Bracket = {
  upTo: number | null // null = unbounded top tier
  pricePerSeat: number // IDR per seat per month
}

// Graduated brackets — each seat is priced based on which bracket it falls in,
// like income-tax brackets. Seats 1–15 always cost Rp 80k each, seats 16–40
// always cost Rp 50k each, seats 41+ always cost Rp 30k each, regardless of
// total team size.
export const PRO_BRACKETS: Bracket[] = [
  { upTo: 15, pricePerSeat: 80_000 },
  { upTo: 40, pricePerSeat: 50_000 },
  { upTo: null, pricePerSeat: 30_000 },
]

export function calculateProMonthlyIdr(seats: number): number {
  const billable = Math.max(seats, PRO_MIN_SEATS)
  let total = 0
  let remaining = billable
  let prevCap = 0
  for (const bracket of PRO_BRACKETS) {
    const cap = bracket.upTo ?? Infinity
    const tierWidth = cap - prevCap
    const seatsInTier = Math.min(remaining, tierWidth)
    if (seatsInTier <= 0) break
    total += seatsInTier * bracket.pricePerSeat
    remaining -= seatsInTier
    prevCap = cap
  }
  return total
}

export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`
}

// Annual price = monthly × 12 × 0.8 (20% discount), rounded to nearest 1.000.
export function calculateProAnnualMonthlyEquivalent(seats: number): number {
  const monthly = calculateProMonthlyIdr(seats)
  return Math.round((monthly * 0.8) / 1000) * 1000
}
