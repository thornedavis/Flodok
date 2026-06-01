import { forwardRef } from 'react'

// Shared trigger button for the "Actions" dropdown menus across the app
// (Performance, Hiring, Recruitment, Employees, …). One unified style: a
// small, discreet pill with a solid primary background and white text.
//
// This is only the trigger — each call site keeps its own menu/popover so the
// items and positioning logic stay local. forwardRef lets callers attach a ref
// for portal-positioned menus.

interface ActionsMenuButtonProps {
  label: string
  open: boolean
  onClick: () => void
  disabled?: boolean
  /** Tooltip — used e.g. to explain why the button is disabled. */
  title?: string
}

export const ActionsMenuButton = forwardRef<HTMLButtonElement, ActionsMenuButtonProps>(
  function ActionsMenuButton({ label, open, onClick, disabled, title }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    )
  },
)
