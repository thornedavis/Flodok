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

export function formatIdrDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-US')
}
