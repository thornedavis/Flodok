// Pricing model: graduated per-seat brackets, IDR.
// Pro plan only — Free plan is flat (Rp 0, capped at FREE_EMPLOYEE_LIMIT).
//
// IMPORTANT — Stripe currency unit gotcha:
// IDR is *not* a zero-decimal currency in Stripe's API (despite Indonesian
// rupiah having no real-world subunits). Stripe treats it as 2-decimal, so
// every amount sent to Stripe must be multiplied by 100. The values below are
// in display rupiah; when (re)creating the Price object in Stripe, multiply
// each pricePerSeat by 100 (e.g. Rp 100.000 → unit_amount=10_000_000).

export const FREE_EMPLOYEE_LIMIT = 2
export const FREE_DOCS_PER_EMPLOYEE = 1 // 1 contract + 1 SOP per employee

export const PRO_MIN_SEATS = 3

export type Bracket = {
  upTo: number | null // null = unbounded top tier
  pricePerSeat: number // IDR per seat per month
}

// Graduated brackets — each seat is priced based on which bracket it falls in,
// like income-tax brackets. Seats 1–15 always cost Rp 100k each, seats 16–40
// always cost Rp 70k each, seats 41+ always cost Rp 50k each, regardless of
// total team size.
export const PRO_BRACKETS: Bracket[] = [
  { upTo: 15, pricePerSeat: 100_000 },
  { upTo: 40, pricePerSeat: 70_000 },
  { upTo: null, pricePerSeat: 50_000 },
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

// Comma thousand-separators (en-US format) for clarity. Indonesian convention
// uses '.' as the thousand-separator (Rp 500.000 = five hundred thousand) but
// it reads as "five hundred point zero zero zero" to users who think in
// Western decimal notation. We standardize on commas across the pricing
// surfaces to match Stripe Checkout and avoid that ambiguity.
export function formatIdr(amount: number): string {
  return `Rp ${amount.toLocaleString('en-US')}`
}

// Annual price = monthly × 12 × 0.8 (20% discount), rounded to nearest 1.000.
export function calculateProAnnualMonthlyEquivalent(seats: number): number {
  const monthly = calculateProMonthlyIdr(seats)
  return Math.round((monthly * 0.8) / 1000) * 1000
}

// Single source of truth for the public-facing tier feature lists. Used by
// the Landing page Pro/Free cards AND the dedicated Pricing page Pro/Free
// cards. If you add a feature, add it here, not in the page files.
//
// Rule: only list features that actually ship. Don't add aspirational
// integrations (e.g. Slack, Google SSO) until they exist.
export const FREE_FEATURES: readonly string[] = [
  `Up to ${FREE_EMPLOYEE_LIMIT} employees`,
  '1 SOP and 1 contract per employee',
  'Public employee portal',
  'Bahasa & English UI · in-app translation',
  'Email support',
]

export const PRO_FEATURES: readonly string[] = [
  'Everything in Free, plus:',
  'Unlimited SOPs & contracts',
  'AI drafting & translation, included',
  'E-signatures on contracts',
  'Performance reviews, 1:1s, awards',
  'Fireflies & Asana integrations',
  'Priority WhatsApp support',
]
