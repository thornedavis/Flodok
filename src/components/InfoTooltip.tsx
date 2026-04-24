import { useRef, useState } from 'react'

export function InfoTooltip({ text }: { text: string }) {
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
        style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        i
      </button>
      {show && (
        <div
          className="fixed z-50 w-64 -translate-x-1/2 rounded-lg border p-3 text-xs shadow-lg"
          style={{ top: pos.top, left: pos.left, backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {text}
        </div>
      )}
    </span>
  )
}
