type Segment = {
  key: string
  valueIdr: number
  color: string
}

// A slim horizontal stacked bar showing how the monthly payout breaks down into
// its parts (base / allowance / positive adjustments). Replaces the segmented
// CompensationRing: a straight parts-of-a-whole bar reads magnitudes far more
// legibly than proportional arcs around a circle.
//
// Slices are sized by their share of the visible total; zero-value segments are
// dropped, and a 2px page-bg gutter between slices reads as a clean break. When
// everything is zero (no contract yet) the track shows as a single dim pill.
export function CompositionBar({
  segments,
  ariaLabel,
  height = 14,
}: {
  segments: Segment[]
  ariaLabel?: string
  height?: number
}) {
  const visible = segments.filter(s => s.valueIdr > 0)
  const total = visible.reduce((sum, s) => sum + s.valueIdr, 0)

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex w-full overflow-hidden rounded-full"
      style={{ height, backgroundColor: 'var(--color-bg-tertiary)' }}
    >
      {total > 0 &&
        visible.map((seg, i) => (
          <div
            key={seg.key}
            className="h-full"
            style={{
              width: `${(seg.valueIdr / total) * 100}%`,
              minWidth: 2,
              flexShrink: 0,
              backgroundColor: seg.color,
              borderLeft: i === 0 ? undefined : '2px solid var(--color-bg)',
            }}
          />
        ))}
    </div>
  )
}
