import { Wordmark } from './Brand'

// Full-screen brand loader: the Flodok lockup over an indeterminate shimmer
// bar. Replaces the bare "Loading…" text on the blank moments — app boot,
// portal load, account setup. The bar animation lives in index.css
// (.loading-bar) and respects prefers-reduced-motion.
export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-7 px-4 text-center"
      style={{ backgroundColor: 'var(--color-bg)' }}
      role="status"
      aria-live="polite"
    >
      <Wordmark height={28} />
      <div className="loading-bar" aria-hidden="true"><span /></div>
      {label ? (
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  )
}
