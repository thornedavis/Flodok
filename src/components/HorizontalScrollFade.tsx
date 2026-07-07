import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface HorizontalScrollFadeProps {
  /** Classes applied to the scrollable row itself (e.g. "flex gap-3 pb-2"). `overflow-x-auto` is added automatically. */
  className?: string
  /** Fade width in px. */
  fadeWidth?: number
  children: React.ReactNode
}

/**
 * Wraps a horizontally-scrolling row and paints a soft page-coloured fade at
 * whichever edge still has content beyond it — so the edge items appear to
 * dissolve into the page, cueing that the row continues.
 *
 * The left fade is hidden at the natural start (the first item lines up flush
 * with the container edge) and only appears once the user scrolls right; the
 * right fade shows whenever there's more content to the right. Both toggle on
 * scroll and on resize.
 */
export function HorizontalScrollFade({ className, fadeWidth = 48, children }: HorizontalScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Default to "more on the right" so an overflowing row shows its right fade
  // on first paint without a fade-in; measure() corrects it if it actually fits.
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(maxScroll <= 1 || el.scrollLeft >= maxScroll - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [measure])

  // Re-measure after every render so adding/removing items keeps the fades in
  // sync (setState bails when unchanged, so this can't loop).
  useLayoutEffect(() => { measure() })

  return (
    <div className="relative">
      <div ref={scrollRef} className={`overflow-x-auto ${className ?? ''}`}>
        {children}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 transition-opacity duration-200"
        style={{ width: fadeWidth, opacity: atStart ? 0 : 1, background: 'linear-gradient(to right, var(--color-bg), transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 transition-opacity duration-200"
        style={{ width: fadeWidth, opacity: atEnd ? 0 : 1, background: 'linear-gradient(to left, var(--color-bg), transparent)' }}
      />
    </div>
  )
}
