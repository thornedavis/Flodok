// Three-state illustration that explains how a clock-in's location confidence
// is judged. Each panel shows the office geofence (dashed ring) with the office
// pin at its centre, and the employee's reported position as a "±accuracy"
// circle placed to yield On-site / Unclear / Off-site:
//   On-site      — the accuracy circle sits fully inside the fence.
//   Unclear      — the accuracy circle straddles the fence edge.
//   Off-site     — the accuracy circle sits fully outside the fence.
// Colours are the app theme vars (var(--color-*)), NOT the CDS tokens.

import type { Translations } from '../../lib/translations'

export function ConfidenceLegend({ t }: { t: Translations }) {
  return (
    <div>
      <svg
        viewBox="0 0 680 300"
        role="img"
        aria-label={t.attendanceConfidenceHelp}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* On-site — accuracy circle fully inside the fence */}
        <Panel
          x={0}
          state="onsite"
          fence="var(--color-success)"
          accuracyCx={130}
          accuracyCy={130}
          accuracyR={30}
          label={t.attendanceConfidenceOnSite}
          hint={t.attendanceLegendOnSiteHint}
          t={t}
        />
        {/* Unclear — accuracy circle straddles the fence edge */}
        <Panel
          x={226}
          state="unclear"
          fence="var(--color-warning)"
          accuracyCx={160}
          accuracyCy={135}
          accuracyR={44}
          label={t.attendanceConfidenceUnclear}
          hint={t.attendanceLegendUnclearHint}
          t={t}
        />
        {/* Off-site — accuracy circle fully outside the fence */}
        <Panel
          x={452}
          state="offsite"
          fence="var(--color-danger)"
          accuracyCx={185}
          accuracyCy={95}
          accuracyR={26}
          label={t.attendanceConfidenceOffSite}
          hint={t.attendanceLegendOffSiteHint}
          t={t}
        />
      </svg>

      {/* Shared key line */}
      <div
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
            <line x1="1" y1="6" x2="17" y2="6" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
          {t.attendanceLegendGeofence}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
            <path
              d="M6 0.5C2.96 0.5 0.5 2.96 0.5 6c0 4 5.5 7.5 5.5 7.5S11.5 10 11.5 6C11.5 2.96 9.04 0.5 6 0.5Z"
              fill="var(--color-primary)"
            />
            <circle cx="6" cy="6" r="2" fill="var(--color-bg-secondary)" />
          </svg>
          {t.attendanceLegendOffice}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="color-mix(in srgb, var(--color-text-tertiary) 22%, transparent)"
              stroke="var(--color-text-tertiary)"
              strokeWidth="1"
            />
            <circle cx="8" cy="8" r="1.5" fill="var(--color-text-tertiary)" />
          </svg>
          {t.attendanceLegendReported}
        </span>
      </div>
    </div>
  )
}

// ─── One state panel ────────────────────────────────────────────────────────

type PanelProps = {
  x: number
  state: 'onsite' | 'unclear' | 'offsite'
  fence: string
  accuracyCx: number
  accuracyCy: number
  accuracyR: number
  label: string
  hint: string
  t: Translations
}

function Panel({ x, fence, accuracyCx, accuracyCy, accuracyR, label, hint }: PanelProps) {
  // Fence: a dashed ring centred on the office pin at (110, 120), radius 62.
  const fenceCx = 110
  const fenceCy = 120
  const fenceR = 62
  return (
    <g transform={`translate(${x}, 0)`}>
      {/* Card background */}
      <rect
        x={8}
        y={8}
        width={212}
        height={228}
        rx={14}
        fill="var(--color-bg-secondary)"
        stroke="var(--color-border)"
        strokeWidth={1}
      />

      {/* Geofence dashed ring */}
      <circle
        cx={fenceCx}
        cy={fenceCy}
        r={fenceR}
        fill="color-mix(in srgb, var(--color-primary) 5%, transparent)"
        stroke="var(--color-border)"
        strokeWidth={1.5}
        strokeDasharray="5 5"
      />

      {/* Reported position ± accuracy circle (tinted by state colour) */}
      <circle
        cx={accuracyCx}
        cy={accuracyCy}
        r={accuracyR}
        fill={`color-mix(in srgb, ${fence} 16%, transparent)`}
        stroke={fence}
        strokeWidth={1.5}
      />
      <circle cx={accuracyCx} cy={accuracyCy} r={3} fill={fence} />

      {/* Office pin at fence centre */}
      <g transform={`translate(${fenceCx}, ${fenceCy})`}>
        <path
          d="M0 -16C-6.6 -16 -12 -10.6 -12 -4c0 8.8 12 20 12 20S12 4.8 12 -4C12 -10.6 6.6 -16 0 -16Z"
          fill="var(--color-primary)"
        />
        <circle cx={0} cy={-4} r={4.2} fill="var(--color-bg-secondary)" />
      </g>

      {/* State label pill */}
      <g transform="translate(20, 200)">
        <rect
          x={0}
          y={0}
          width={LABEL_WIDTHS(label)}
          height={22}
          rx={11}
          fill={`color-mix(in srgb, ${fence} 14%, transparent)`}
        />
        <text
          x={12}
          y={15}
          fontSize={12}
          fontWeight={600}
          fill={fence}
          style={{ fontFamily: 'inherit' }}
        >
          {label}
        </text>
      </g>

      {/* Hint text (wraps to two lines within the card) */}
      <WrappedHint text={hint} />
    </g>
  )
}

// Rough pill width from label length so the pill hugs the text without a
// measuring pass — labels are short ("On-site", "Unclear", "Off-site").
function LABEL_WIDTHS(label: string): number {
  return Math.max(58, 24 + label.length * 7)
}

// Two-line hint under the pill. SVG has no text wrapping, so split on spaces
// into up to two balanced lines.
function WrappedHint({ text }: { text: string }) {
  const words = text.split(' ')
  const mid = Math.ceil(words.length / 2)
  const line1 = words.slice(0, mid).join(' ')
  const line2 = words.slice(mid).join(' ')
  return (
    <text
      x={20}
      fontSize={11}
      fill="var(--color-text-tertiary)"
      style={{ fontFamily: 'inherit' }}
    >
      <tspan x={20} y={244}>{line1}</tspan>
      {line2 && <tspan x={20} y={258}>{line2}</tspan>}
    </text>
  )
}
