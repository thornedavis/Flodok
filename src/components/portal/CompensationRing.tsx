import type { ReactNode } from 'react'
import { getAvatarGradient } from '../../lib/avatar'

type Segment = {
  key: string
  valueIdr: number
  color: string
  icon: ReactNode
}

type RingProps = {
  segments: Segment[]
  photoUrl: string | null
  employeeId: string
  size?: number
}

const STROKE = 28
const VIEW = 240
const CENTER = VIEW / 2
const RADIUS = CENTER - STROKE / 2 - 4
const ICON_SIZE = 22
// Angular width reserved for a segment that has no value — just enough room
// for its icon with a little padding on each side. Segments with value take
// proportional space beyond this.
const EMPTY_SLOT_DEG = 10
// Rounded caps at this stroke+radius extend ~7° past the arc endpoint, so the
// gap needs to be larger than that by a few degrees to give a clean visible
// break between adjacent colored arcs.
const GAP_DEG = 18
const ICON_INSET_DEG = 8
const START_ANGLE = 0      // top of the ring; segments flow clockwise

function polarToCartesian(cx: number, cy: number, r: number, degFromTop: number) {
  const rad = ((degFromTop - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (endDeg <= startDeg) return ''
  const start = polarToCartesian(cx, cy, r, startDeg)
  const end = polarToCartesian(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function ArcIcon({ angleDeg, color, children }: { angleDeg: number; color: string; children: ReactNode }) {
  const pos = polarToCartesian(CENTER, CENTER, RADIUS, angleDeg)
  const scale = ICON_SIZE / 24
  const offset = (24 * scale) / 2
  return (
    <g transform={`translate(${pos.x - offset}, ${pos.y - offset}) scale(${scale})`}>
      <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </g>
  )
}

export function CompensationRing({ segments, photoUrl, employeeId, size = 300 }: RingProps) {
  const presentTotal = segments.reduce((s, seg) => s + Math.max(0, seg.valueIdr), 0)
  const emptyCount = segments.filter(s => s.valueIdr <= 0).length

  // Empty slots take a fixed small width (just enough for their icon). The
  // rest of the circle, minus gaps, is split proportionally between the
  // present segments. When everything is zero we spread icon-only placeholders
  // evenly so the empty state still has a visible layout.
  const totalGapDeg = segments.length * GAP_DEG
  const totalEmptyDeg = emptyCount * EMPTY_SLOT_DEG
  const arcBudget = Math.max(0, 360 - totalGapDeg - totalEmptyDeg)

  const slots: Array<{ seg: Segment; isArc: boolean; start: number; end: number }> = []
  let cursor = START_ANGLE
  if (presentTotal > 0) {
    for (const seg of segments) {
      const isArc = seg.valueIdr > 0
      const width = isArc
        ? (seg.valueIdr / presentTotal) * arcBudget
        : EMPTY_SLOT_DEG
      slots.push({ seg, isArc, start: cursor, end: cursor + width })
      cursor += width + GAP_DEG
    }
  } else {
    // All empty — distribute icon placeholders evenly.
    const slotWidth = 360 / segments.length
    segments.forEach((seg, i) => {
      const start = START_ANGLE + i * slotWidth
      slots.push({ seg, isArc: false, start, end: start + slotWidth - GAP_DEG })
    })
  }

  // Avatar sizing — inner edge of arc minus a small gap.
  const innerRadiusPx = (RADIUS - STROKE / 2) * (size / VIEW) - 8
  const avatarSize = innerRadiusPx * 2
  const avatarOffset = (size - avatarSize) / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={size}
        height={size}
        className="absolute inset-0"
        style={{ overflow: 'visible' }}
      >
        {/* Full dim background ring — always rendered so the silhouette stays
            complete even when segments don't tile the whole circle. Arcs with
            values overlay this; gaps between arcs show through. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          stroke="var(--color-border)"
          strokeWidth={STROKE}
          fill="none"
          opacity={0.5}
        />

        {slots.map(slot => (
          <g key={slot.seg.key}>
            {slot.isArc && (
              <path
                d={arcPath(CENTER, CENTER, RADIUS, slot.start, slot.end)}
                stroke={slot.seg.color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
              />
            )}
            <ArcIcon
              angleDeg={slot.isArc
                ? slot.start + ICON_INSET_DEG
                : (slot.start + slot.end) / 2}
              color={slot.isArc ? 'var(--color-bg)' : 'var(--color-text-tertiary)'}
            >
              {slot.seg.icon}
            </ArcIcon>
          </g>
        ))}
      </svg>

      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          top: avatarOffset,
          left: avatarOffset,
          width: avatarSize,
          height: avatarSize,
          background: photoUrl ? 'transparent' : getAvatarGradient(employeeId),
        }}
      >
        {photoUrl && (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
    </div>
  )
}

// Reusable icon paths for the standard three compensation layers.
export function ShieldPath() {
  return <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
}
export function WalletPath() {
  return (
    <>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </>
  )
}
export function CoinPath() {
  return (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v12M9 9h6M9 15h6" />
    </>
  )
}
