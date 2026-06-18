import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

// Shared action button for the document-editor top bars. Three variants map
// to the toolbar hierarchy:
//   primary → the commit action (Publish / Issue / Activate & sign), blue
//   save    → the high-contrast "Save draft" anchor. It inverts with the
//             theme (black-on-white in light, white-on-black in dark) by
//             pointing at the text/bg tokens, so it reads as the most-used
//             action without competing with the blue primary.
//   ghost   → quiet bordered secondary (e.g. Archive).
// `loading` swaps in a spinner; pass the saving-state label as children.

type ToolbarButtonVariant = 'primary' | 'save' | 'ghost'

const VARIANT_CLASS: Record<ToolbarButtonVariant, string> = {
  primary: '',
  save: '',
  ghost: 'border',
}

const VARIANT_STYLE: Record<ToolbarButtonVariant, CSSProperties> = {
  primary: { backgroundColor: 'var(--color-primary)', color: '#fff' },
  save: { backgroundColor: 'var(--color-text)', color: 'var(--color-bg)' },
  ghost: { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' },
}

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ToolbarButtonVariant
  loading?: boolean
  children: ReactNode
}

export function ToolbarButton({
  variant = 'ghost',
  loading = false,
  children,
  className = '',
  type = 'button',
  ...rest
}: ToolbarButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      style={VARIANT_STYLE[variant]}
      {...rest}
    >
      {loading && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {children}
    </button>
  )
}
