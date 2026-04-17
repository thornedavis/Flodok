import { useEffect, useRef, useState } from 'react'
import { useLang } from '../contexts/LanguageContext'

interface DepartmentsMultiSelectProps {
  /** Currently selected departments. */
  value: string[]
  onChange: (next: string[]) => void
  /** All departments known to the org (for suggestions). */
  availableDepartments: string[]
  disabled?: boolean
}

export function DepartmentsMultiSelect({ value, onChange, availableDepartments, disabled }: DepartmentsMultiSelectProps) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const selectedSet = new Set(value.map(v => v.toLowerCase()))
  const trimmedSearch = search.trim()

  const suggestions = availableDepartments.filter(d => {
    if (selectedSet.has(d.toLowerCase())) return false
    if (!trimmedSearch) return true
    return d.toLowerCase().includes(trimmedSearch.toLowerCase())
  })

  const canCreateNew =
    trimmedSearch.length > 0 &&
    !selectedSet.has(trimmedSearch.toLowerCase()) &&
    !availableDepartments.some(d => d.toLowerCase() === trimmedSearch.toLowerCase())

  function addDepartment(dept: string) {
    const normalized = dept.trim()
    if (!normalized) return
    if (selectedSet.has(normalized.toLowerCase())) return
    onChange([...value, normalized])
    setSearch('')
  }

  function removeDepartment(dept: string) {
    onChange(value.filter(d => d !== dept))
  }

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      <div
        className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg)',
        }}
        onClick={() => !disabled && setOpen(true)}
      >
        {value.map(dept => (
          <span
            key={dept}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            {dept}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeDepartment(dept) }}
                className="rounded-full p-0.5 transition-colors hover:opacity-70"
                aria-label={`Remove ${dept}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </span>
        ))}

        {!disabled && (
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter' && trimmedSearch) {
                e.preventDefault()
                addDepartment(trimmedSearch)
              }
              if (e.key === 'Backspace' && !search && value.length > 0) {
                removeDepartment(value[value.length - 1])
              }
            }}
            placeholder={value.length === 0 ? t.selectDepartment : ''}
            className="min-w-[120px] flex-1 bg-transparent py-1 text-sm"
            style={{ color: 'var(--color-text)' }}
          />
        )}
      </div>

      {open && !disabled && (suggestions.length > 0 || canCreateNew) && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <div className="max-h-48 overflow-y-auto py-1">
            {suggestions.map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => addDepartment(dept)}
                className="flex w-full items-center px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--color-text)' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                    color: 'var(--color-primary)',
                  }}
                >
                  {dept}
                </span>
              </button>
            ))}
          </div>
          {canCreateNew && (
            <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={() => addDepartment(trimmedSearch)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--color-primary)' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t.createDepartment} "{trimmedSearch}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
