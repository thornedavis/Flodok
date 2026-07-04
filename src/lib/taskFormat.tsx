// Small display helpers shared by the task surfaces: format a due time, and
// render / extract http(s) URLs from free text ("URL-aware" task text).

import type { ReactNode } from 'react'

// 'HH:MM' or 'HH:MM:SS' → '2:30 PM'
export function fmtTime(t: string): string {
  const parts = t.split(':')
  let h = parseInt(parts[0] ?? '0', 10)
  const m = parts[1] ?? '00'
  if (Number.isNaN(h)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

// Unique http(s) URLs found in the text, trailing punctuation trimmed.
export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return []
  const found = text.match(/https?:\/\/[^\s]+/g) ?? []
  return [...new Set(found.map(u => u.replace(/[.,;:)\]]+$/, '')))]
}

// Render text with http(s) URLs turned into clickable links (read contexts).
export function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (!/^https?:\/\//.test(part)) return <span key={i}>{part}</span>
    const url = part.replace(/[.,;:)\]]+$/, '')
    const trail = part.slice(url.length)
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>{url}</a>
        {trail}
      </span>
    )
  })
}
