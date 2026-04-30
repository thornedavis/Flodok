// Curated set of cursive/handwritten Google Fonts used as typed-signature
// styles across the app. Both the employee portal and the dashboard
// employer-signing flow draw from this list, so the same four options are
// always offered. Adding a new font here makes it available everywhere
// without hunting down render sites.

export type SignatureFont = {
  name: string  // Exact Google Fonts family name; used both as font-family and lookup key.
  label: string // Short human-readable label shown beneath the preview.
}

export const SIGNATURE_FONTS: SignatureFont[] = [
  { name: 'Dancing Script', label: 'Classic' },
  { name: 'Great Vibes', label: 'Elegant' },
  { name: 'Caveat', label: 'Casual' },
  { name: 'Homemade Apple', label: 'Handwritten' },
]

// Returns the Google Fonts CSS link href for loading every signature font in
// one request. Idempotent — the consumer should guard against duplicate
// <link> insertion if it injects this into the document head.
export function signatureFontsHref(): string {
  return `https://fonts.googleapis.com/css2?family=${SIGNATURE_FONTS.map(f => f.name.replace(/ /g, '+')).join('&family=')}&display=swap`
}

// Inserts the stylesheet link once. Safe to call from any module that needs
// signature fonts available in its UI; subsequent calls are no-ops.
export function ensureSignatureFontsLoaded(): void {
  if (typeof document === 'undefined') return
  const href = signatureFontsHref()
  if (document.head.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}
