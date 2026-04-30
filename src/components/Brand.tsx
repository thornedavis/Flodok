// Theme-aware brand lockup: imagemark on the left, wordmark on the right.
// Both variants render and CSS toggles visibility based on the `.dark`
// class on the html root, so there's no JS flicker on first paint.

const WORDMARK_FOR_LIGHT = '/flodok-wordmark-dark.svg'   // black ink, used in light theme
const WORDMARK_FOR_DARK = '/flodok-wordmark-light.svg'   // white ink, used in dark theme
const IMAGEMARK_FOR_LIGHT = '/flodok-imagemark-dark.svg'
const IMAGEMARK_FOR_DARK = '/flodok-imagemark-light.svg'

function ThemedImg({
  light,
  dark,
  height,
  alt,
}: {
  light: string
  dark: string
  height: number
  alt: string
}) {
  // No `display` in inline style — let the .brand-for-light / .brand-for-dark
  // CSS rules in index.css decide which one shows.
  return (
    <>
      <img
        src={light}
        alt={alt}
        height={height}
        style={{ height, width: 'auto' }}
        className="brand-for-light"
        draggable={false}
      />
      <img
        src={dark}
        alt={alt}
        aria-hidden="true"
        height={height}
        style={{ height, width: 'auto' }}
        className="brand-for-dark"
        draggable={false}
      />
    </>
  )
}

export function Wordmark({
  height = 18,
  imagemarkHeight,
  className,
}: {
  /** Height of the wordmark text. */
  height?: number
  /** Height of the imagemark. Defaults to ~1.7× the wordmark for visual weight. */
  imagemarkHeight?: number
  className?: string
}) {
  const imgHeight = imagemarkHeight ?? Math.round(height * 1.7)
  const gap = Math.max(4, Math.round(height * 0.4))
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap }}
      aria-label="Flodok"
    >
      <ThemedImg light={IMAGEMARK_FOR_LIGHT} dark={IMAGEMARK_FOR_DARK} height={imgHeight} alt="" />
      <ThemedImg light={WORDMARK_FOR_LIGHT} dark={WORDMARK_FOR_DARK} height={height} alt="Flodok" />
    </span>
  )
}

export function Imagemark({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center' }}
      aria-label="Flodok"
    >
      <ThemedImg light={IMAGEMARK_FOR_LIGHT} dark={IMAGEMARK_FOR_DARK} height={size} alt="Flodok" />
    </span>
  )
}

// Always-white lockup for surfaces with a fixed dark background
// (e.g. the AuthLayout marketing panel) — does not respond to theme.
export function WordmarkOnDark({
  height = 18,
  imagemarkHeight,
  className,
}: {
  height?: number
  imagemarkHeight?: number
  className?: string
}) {
  const imgHeight = imagemarkHeight ?? Math.round(height * 1.7)
  const gap = Math.max(4, Math.round(height * 0.4))
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap }}
      aria-label="Flodok"
    >
      <img
        src={IMAGEMARK_FOR_DARK}
        alt=""
        aria-hidden="true"
        height={imgHeight}
        style={{ height: imgHeight, width: 'auto' }}
        draggable={false}
      />
      <img
        src={WORDMARK_FOR_DARK}
        alt="Flodok"
        height={height}
        style={{ height, width: 'auto' }}
        draggable={false}
      />
    </span>
  )
}
