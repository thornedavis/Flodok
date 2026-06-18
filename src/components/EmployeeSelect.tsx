// Single-select employee picker with built-in search.
//
// Replaces the native `<select>` we used for "Employee" on document
// edit pages. With more than a handful of employees that native menu
// becomes a scroll-then-squint exercise; this component shows a
// search input + a short scrollable list (capped to a few rows) so
// you can type to filter and pick.
//
// API mirrors a controlled input: pass `value` (employee id | null)
// and `onChange`. Pass the full employee list with departments — the
// component handles filtering against name + department names.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../contexts/LanguageContext'
import { getEmployeeDepts, primaryDept, type EmpDeptShape } from '../lib/employee'
import type { Employee } from '../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

export function EmployeeSelect({
  value,
  onChange,
  employees,
  disabled,
  emptyLabel,
  invalid,
}: {
  value: string | null
  onChange: (next: string | null) => void
  employees: EmployeeWithDepartments[]
  disabled?: boolean
  // Label for the "no selection" state — both the trigger when nothing is
  // picked and the clear option at the top of the list. Defaults to
  // "No employee linked" (assignment context); a filter passes e.g.
  // "All employees".
  emptyLabel?: string
  // When true, the trigger shows a red border — used by document editors to
  // flag a required-but-empty field (mirrors the missing-field dot).
  invalid?: boolean
}) {
  const { t } = useLang()
  const noneLabel = emptyLabel ?? t.noEmployeeLinked
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

  // Clear the search every time the popover opens so a stale query
  // doesn't hide the user's intended target on the second open.
  useEffect(() => {
    if (open) {
      setQuery('')
      // Autofocus is on the input via ref so the user can start typing
      // immediately. autoFocus prop is unreliable when the input mounts
      // inside a conditionally-rendered popover.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      getEmployeeDepts(e).some(d => d.toLowerCase().includes(q))
    )
  }, [employees, query])

  const selected = value ? employees.find(e => e.id === value) ?? null : null
  const triggerLabel = selected
    ? `${selected.name}${primaryDept(selected) ? ` (${primaryDept(selected)})` : ''}`
    : noneLabel

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: invalid ? 'color-mix(in srgb, var(--color-danger) 50%, transparent)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: selected ? 'var(--color-text)' : 'var(--color-text-tertiary)',
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
                placeholder={t.searchEmployeesPlaceholder}
                className="w-full rounded-md border bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              />
            </div>
          </div>

          {/* Scrollable list — height cap shows ~3 rows + the clear
              option, then scrolls for the rest. */}
          <div className="max-h-[140px] overflow-y-auto py-1">
            {/* Clear option — always visible at the top. */}
            <OptionRow
              selected={value === null}
              onClick={() => pick(null)}
              muted
            >
              {noneLabel}
            </OptionRow>

            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.noEmployeesMatch}
              </p>
            ) : (
              filtered.map(emp => (
                <OptionRow
                  key={emp.id}
                  selected={value === emp.id}
                  onClick={() => pick(emp.id)}
                >
                  <span>{emp.name}</span>
                  {primaryDept(emp) && (
                    <span className="ml-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      ({primaryDept(emp)})
                    </span>
                  )}
                </OptionRow>
              ))
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
