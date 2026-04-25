import { useState, type ReactNode } from 'react'
import { InfoTooltip } from '../InfoTooltip'

export function StatRow({
  icon,
  label,
  info,
  value,
  accent,
  actions,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode
  label: string
  info?: string
  value: ReactNode
  accent?: string
  actions?: ReactNode
  children?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const expandable = !!children

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={() => expandable && setOpen(o => !o)}
        onKeyDown={e => {
          if (expandable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen(o => !o)
          }
        }}
        className={`flex w-full items-center gap-3 px-4 py-2.5 ${expandable ? 'cursor-pointer' : ''}`}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg [&_svg]:h-[20px] [&_svg]:w-[20px]"
          style={{ backgroundColor: accent || 'var(--color-bg-tertiary)', color: 'rgba(255, 255, 255, 0.9)' }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {label}
            {info && (
              <span onClick={e => e.stopPropagation()}>
                <InfoTooltip text={info} />
              </span>
            )}
          </p>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{value}</p>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
        {expandable && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: 'var(--color-text-tertiary)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </div>
      {open && children && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
