// Inline picker for choosing a badge illustration. Renders the built-in
// library as a scrollable grid grouped by category. The selected entry is
// highlighted in place.

import { BADGE_CATEGORIES, BADGE_LIBRARY } from '../lib/badgeLibrary'
import { BadgeGlyph } from './BadgeGlyph'

export function BadgePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const grouped = BADGE_CATEGORIES.map(cat => ({
    ...cat,
    items: BADGE_LIBRARY.filter(b => b.category === cat.id),
  })).filter(g => g.items.length > 0)

  if (grouped.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-4 text-center text-xs"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
      >
        No illustrations yet. Drop SVGs into <code>public/badges/</code> and add them to{' '}
        <code>BADGE_LIBRARY</code>.
      </div>
    )
  }

  return (
    <div
      className="overflow-y-auto rounded-lg border p-3"
      style={{
        maxHeight: '14rem',
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div className="space-y-4">
        {grouped.map(group => (
          <CategorySection
            key={group.id}
            label={group.label}
            items={group.items.map(b => b.key)}
            labels={Object.fromEntries(group.items.map(b => [b.key, b.label]))}
            selected={value}
            onSelect={onChange}
            showHeading={grouped.length > 1}
          />
        ))}
      </div>
    </div>
  )
}

function CategorySection({
  label,
  items,
  labels,
  selected,
  onSelect,
  showHeading,
}: {
  label: string
  items: string[]
  labels: Record<string, string>
  selected: string
  onSelect: (key: string) => void
  showHeading: boolean
}) {
  return (
    <section>
      {showHeading && (
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          {label}
        </h4>
      )}
      <div className="grid grid-cols-4 gap-2">
        {items.map(key => {
          const isSelected = selected === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              title={labels[key]}
              className="flex aspect-square items-center justify-center rounded-lg border transition-all"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                outline: isSelected ? '2px solid var(--color-primary)' : 'none',
                outlineOffset: '-1px',
              }}
            >
              <BadgeGlyph icon={key} size={48} />
            </button>
          )
        })}
      </div>
    </section>
  )
}
