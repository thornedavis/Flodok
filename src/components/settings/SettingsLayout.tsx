// Shared layout primitives for the Settings tabs. Every tab is built from
// these so headings, cards, toggles and spacing stay identical across
// Account / Integrations / Payroll / Badges / Approvals / Attendance / Billing.
//
// The design language ("Option A — setting cards"): a section is a heading +
// one-line description, and each individual setting lives in its own bordered
// card (12px radius) with the label + help on the left and the control on the
// right (or below, for inputs). One Toggle everywhere — no hand-rolled
// switches or raw checkboxes.

import type { ReactNode } from 'react'
import { Toggle } from '../Toggle'

// A titled group of settings. `action` renders on the right of the heading
// (e.g. an "Invite" or "New" button). `divider` draws a top rule + padding so
// stacked sections read as distinct without extra wrappers at the call site.
export function SettingsSection({
  title,
  description,
  action,
  divider = false,
  children,
}: {
  title?: string
  description?: string
  action?: ReactNode
  divider?: boolean
  children: ReactNode
}) {
  return (
    <section className={divider ? 'border-t pt-10' : undefined} style={divider ? { borderColor: 'var(--color-border)' } : undefined}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

// The base bordered card. `dimmed` fades + ignores pointer events for controls
// that depend on a feature being enabled (e.g. auto-clock-out when attendance
// is off). 12px radius, responsive padding — the single card spec.
export function SettingCard({
  dimmed = false,
  className = '',
  children,
}: {
  dimmed?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-xl border p-4 md:p-5 ${className}`}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {children}
    </div>
  )
}

// A card whose whole job is a single on/off setting: label + help on the left,
// the shared Toggle on the right.
export function ToggleRow({
  label,
  help,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  help?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <SettingCard>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</p>
          {help && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{help}</p>}
        </div>
        <Toggle checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </SettingCard>
  )
}

// A card for an input / select / any control: label + optional help stacked,
// then the control below. `dimmed` for feature-gated fields.
export function FieldCard({
  label,
  help,
  htmlFor,
  dimmed = false,
  children,
}: {
  label: string
  help?: string
  htmlFor?: string
  dimmed?: boolean
  children: ReactNode
}) {
  return (
    <SettingCard dimmed={dimmed}>
      <label htmlFor={htmlFor} className="block text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</label>
      {help && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{help}</p>}
      <div className="mt-3">{children}</div>
    </SettingCard>
  )
}

// Standard vertical rhythm between the cards inside a section.
export function SettingStack({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
