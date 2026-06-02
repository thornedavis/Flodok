import { useRef, useState } from 'react'

export function InfoTooltip({ text, iconBg = 'var(--color-bg-tertiary)' }: { text: string; iconBg?: string }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const handleEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 })
    }
    setShow(true)
  }

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ backgroundColor: iconBg, color: 'var(--color-text-tertiary)' }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        i
      </button>
      {show && (
        <div
          className="fixed z-50 w-64 -translate-x-1/2 rounded-lg border p-3 text-xs leading-relaxed shadow-lg"
          // The popover is frequently rendered inside `<label>` elements
          // that carry `uppercase tracking-wider font-medium` for the
          // field caption. CSS inheritance applies even across fixed
          // positioning, so the tooltip body would render shouty unless
          // we reset those text properties here.
          style={{
            top: pos.top,
            left: pos.left,
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
            textTransform: 'none',
            letterSpacing: 'normal',
            fontWeight: 400,
          }}
        >
          {text}
        </div>
      )}
    </span>
  )
}
