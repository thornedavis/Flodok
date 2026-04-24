export function currentPeriodMonth(d: Date = new Date()): string {
  const jakartaNow = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const y = jakartaNow.getFullYear()
  const m = String(jakartaNow.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function formatIdr(value: number | null | undefined, lang: 'en' | 'id' = 'en'): string {
  if (value == null) return '—'
  const locale = lang === 'id' ? 'id-ID' : 'en-US'
  return `Rp ${Math.round(value).toLocaleString(locale)}`
}

export function creditToIdr(credits: number, allowanceIdr: number, divisor: number): number {
  if (divisor <= 0 || allowanceIdr <= 0) return 0
  return Math.round((credits * allowanceIdr) / divisor)
}

export function idrToCredits(idr: number, allowanceIdr: number, divisor: number): number {
  if (allowanceIdr <= 0 || divisor <= 0) return 0
  return Math.round((idr * divisor) / allowanceIdr)
}

export function formatIdrDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Smooth HSL interpolation from red (0) → amber (0.5) → green (1.0).
// Used for the allowance ring so the color gradually shifts from "healthy"
// to "warning" to "problem" as the employee's allowance gets docked.
export function allowanceGradientColor(pct: number): string {
  const p = Math.max(0, Math.min(1, pct))
  let h: number, s: number, l: number
  if (p < 0.5) {
    const t = p / 0.5
    h = lerp(0, 35, t)      // red hue → amber hue
    s = lerp(75, 90, t)
    l = lerp(50, 50, t)
  } else {
    const t = (p - 0.5) / 0.5
    h = lerp(35, 142, t)    // amber hue → green hue
    s = lerp(90, 55, t)
    l = lerp(50, 45, t)
  }
  return `hsl(${h}, ${s}%, ${l}%)`
}
