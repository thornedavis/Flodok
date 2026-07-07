// Generic single-select picker with built-in search.
//
// The searchable combobox first grown for the "Employee" field on document
// edit pages, lifted out so any list can reuse it (tasks, employees, …). With
// more than a handful of options a native <select> becomes a scroll-then-squint
// exercise; this shows a search input + a short scrollable list (capped to a
// few rows) so you type to filter and pick. The list is rendered in the order
// `items` arrives, so callers can float the most-likely rows to the top.
//
// API mirrors a controlled input: pass `value` (item id | null) and `onChange`.
// Per-item behaviour is injected: `getKey`, `getSearchText` (what search matches
// against), `getSelectedLabel` (the trigger text) and `renderOption`.

import { useEffect, useMemo, useRef, useState } from 'react'

export function SearchSelect<T>({
  value,
  onChange,
  items,
  getKey,
  getSearchText,
  getSelectedLabel,
  renderOption,
  placeholder,
  emptyLabel,
  noMatchLabel,
  disabled,
  invalid,
  extraOption,
}: {
  value: string | null
  onChange: (next: string | null) => void
  items: T[]
  getKey: (item: T) => string
  /** Lower-cased and matched with `includes` against the trimmed query. */
  getSearchText: (item: T) => string
  /** Trigger text when this item is the selection. */
  getSelectedLabel: (item: T) => string
  renderOption: (item: T) => React.ReactNode
  placeholder: string
  // Label for the "no selection" state — both the trigger when nothing is
  // picked and the clear option at the top of the list.
  emptyLabel: string
  // Shown when the query filters every item away.
  noMatchLabel: string
  disabled?: boolean
  // When true, the trigger shows a red border — used to flag a
  // required-but-empty field.
  invalid?: boolean
  // Opt-in synthetic option below the clear row, always visible (not filtered
  // by search). Its value is a sentinel that never matches a real item id.
  extraOption?: { value: string; label: string }
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // Opening clears the stale query and focuses the input. Handled here rather
  // than in an effect so we never setState synchronously inside an effect body.
  function toggleOpen() {
    if (disabled) return
    const next = !open
    setOpen(next)
    if (next) {
      setQuery('')
      // autoFocus prop is unreliable when the input mounts inside a
      // conditionally-rendered popover, so focus via ref on the next tick.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => getSearchText(i).toLowerCase().includes(q))
  }, [items, query, getSearchText])

  const isExtra = extraOption != null && value === extraOption.value
  const selected = !isExtra && value ? items.find(i => getKey(i) === value) ?? null : null
  const triggerLabel = isExtra
    ? extraOption!.label
    : selected
      ? getSelectedLabel(selected)
      : emptyLabel
  const hasSelection = isExtra || selected != null

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: invalid ? 'color-mix(in srgb, var(--color-danger) 50%, transparent)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: hasSelection ? 'var(--color-text)' : 'var(--color-text-tertiary)',
        }}
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border shadow-lg"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
          }}
        >
          <div className="border-b p-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="relative">
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Scrollable list — height cap shows ~3 rows + the clear
              option, then scrolls for the rest. */}
          <div className="max-h-[140px] overflow-y-auto py-1">
            {/* Clear option — always visible at the top. */}
            <OptionRow selected={value === null} onClick={() => pick(null)} muted>
              {emptyLabel}
            </OptionRow>

            {extraOption && (
              <OptionRow
                selected={value === extraOption.value}
                onClick={() => pick(extraOption.value)}
                muted
              >
                {extraOption.label}
              </OptionRow>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {noMatchLabel}
              </p>
            ) : (
              filtered.map(item => {
                const id = getKey(item)
                return (
                  <OptionRow key={id} selected={value === id} onClick={() => pick(id)}>
                    {renderOption(item)}
                  </OptionRow>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OptionRow({
  selected,
  onClick,
  muted,
  children,
}: {
  selected: boolean
  onClick: () => void
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
      style={{
        color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
      }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { if (!selected) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  )
}
