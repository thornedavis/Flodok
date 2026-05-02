import type { ReactNode } from 'react'

interface SubTab {
  key: string
  label: string
}

interface SectionHeaderProps {
  title: string
  subTabs?: SubTab[]
  activeSubTab?: string
  onSubTabChange?: (key: string) => void
  trailing?: ReactNode
}

export function SectionHeader({
  title,
  subTabs,
  activeSubTab,
  onSubTabChange,
  trailing,
}: SectionHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h1>
        {trailing}
      </div>
      {subTabs && subTabs.length > 0 && (
        <div
          className="mt-4 flex gap-1 overflow-x-auto border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {subTabs.map(t => {
            const active = t.key === activeSubTab
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onSubTabChange?.(t.key)}
                className="relative -mb-px whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}
    </header>
  )
}
