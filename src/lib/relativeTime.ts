// Format a timestamp as a short relative-time string ("2h ago", "3d ago")
// using the browser's Intl.RelativeTimeFormat for i18n correctness.

const LOCALE: Record<'en' | 'id', string> = { en: 'en-US', id: 'id-ID' }

const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 31_536_000 },
  { unit: 'month', seconds: 2_592_000 },
  { unit: 'week', seconds: 604_800 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
]

export function formatRelativeTime(input: string | Date, lang: 'en' | 'id' = 'en'): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const absSec = Math.abs(diffSec)

  if (absSec < 30) {
    return lang === 'id' ? 'Baru saja' : 'Just now'
  }

  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto', style: 'short' })
  for (const { unit, seconds } of UNITS) {
    if (absSec >= seconds) {
      return rtf.format(Math.round(diffSec / seconds), unit)
    }
  }
  return rtf.format(diffSec, 'second')
}
