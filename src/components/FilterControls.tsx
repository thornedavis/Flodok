// Shared filter primitives for the dashboard list pages (Spotlight, SOPs,
// Contracts, Employees). Goal: one consistent filter bar across all list
// views, no right-side sidebar, mobile-friendly because everything stays
// in the page header.
//
// Three primitives:
//   - FilterPill         single-select pill, optional count badge
//   - MultiSelectDropdown popover with checkboxes for multi-select filters
//   - FilterSearchInput  inline search box with leading magnifying glass

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ─── FilterPill ─────────────────────────────────────────

export function FilterPill({ active, onClick, count, children }: {
  active: boolean
  onClick: () => void
  count?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
      }}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          style={{
            backgroundColor: active
              ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)'
              : 'var(--color-bg-tertiary)',
            color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ─── MultiSelectDropdown ────────────────────────────────

export interface MultiSelectOption {
  id: string
  label: string
  count?: number
}

export function MultiSelectDropdown({
  label,
  value,
  onChange,
  options,
  emptyText = 'No options',
  searchPlaceholder,
}: {
  label: string
  value: string[]
  onChange: (next: string[]) => void
  options: MultiSelectOption[]
  emptyText?: string
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<'below' | 'above'>('below')
  const selected = new Set(value)

  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const estHeight = Math.min(280, Math.max(120, options.length * 32 + 60))
    const spaceBelow = window.innerHeight - rect.bottom
    setPlacement(spaceBelow < estHeight && rect.top > spaceBelow ? 'above' : 'below')
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter(v => v !== id) : [...value, id])
  }

  function clear() {
    onChange([])
  }

  const trimmedSearch = search.trim().toLowerCase()
  const filtered = trimmedSearch
    ? options.filter(o => o.label.toLowerCase().includes(trimmedSearch))
    : options

  const active = value.length > 0

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
        style={{
          borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
          color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
          backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        {active && (
          <span
            className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }}
          >
            {value.length}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute right-0 z-40 w-[240px] overflow-hidden rounded-lg border shadow-lg ${
            placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
          }`}
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {options.length > 6 && (
            <div className="border-b p-2" style={{ borderColor: 'var(--color-border)' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder || 'Search…'}
                className="w-full rounded-md border bg-transparent px-2 py-1 text-xs"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                autoFocus
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {emptyText}
              </p>
            ) : filtered.map(opt => {
              const checked = selected.has(opt.id)
              return (
                <button
                  key={opt.id}
                  role="option"
                  aria-selected={checked}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                  style={{ color: 'var(--color-text)' }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    style={{
                      borderColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: checked ? 'var(--color-primary)' : 'transparent',
                    }}
                  >
                    {checked && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.count !== undefined && (
                    <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
                      {opt.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {active && (
            <div className="border-t p-1.5" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={clear}
                className="w-full rounded-md px-2 py-1 text-left text-xs"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FilterSearchInput ──────────────────────────────────

export function FilterSearchInput({ value, onChange, placeholder, className = '' }: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-2.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border py-1 pl-8 pr-3 text-xs outline-none transition-colors focus:border-[var(--color-border-strong)]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      />
    </div>
  )
}
