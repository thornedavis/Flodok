// Skeleton loaders — grey, gently-pulsing placeholders shown while
// content is still loading. Sized to roughly match the real content so
// the layout doesn't jump when data arrives.
//
// `Skeleton` is the primitive box; the composed helpers below mirror the
// document card / table layouts used across the dashboard.

import type { CSSProperties } from 'react'

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded ${className}`}
      style={{ backgroundColor: 'var(--color-bg-tertiary)', ...style }}
    />
  )
}

// Grid of simple bordered cards (title bar + meta line). Matches the
// `grid gap-4 sm:grid-cols-2 xl:grid-cols-3` p-5 card layout used by the
// SOPs and Contracts listings.
export function DocumentCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border p-5"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          <Skeleton className="h-3.5 w-2/3" />
          <div className="mt-4 flex items-center gap-2">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-2.5 w-8" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}
