import { useState, useRef, useEffect } from 'react'

export function DepartmentSelect({ value, onChange, departments }: {
  value: string
  onChange: (value: string) => void
  departments: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newDept, setNewDept] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const newDeptRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  // Focus new dept input when creating
  useEffect(() => {
    if (creating && newDeptRef.current) newDeptRef.current.focus()
  }, [creating])

  const filtered = search
    ? departments.filter(d => d.toLowerCase().includes(search.toLowerCase()))
    : departments

  function handleSelect(dept: string) {
    onChange(dept)
    setOpen(false)
    setSearch('')
  }

  function handleClear() {
    onChange('')
    setOpen(false)
    setSearch('')
  }

  function handleCreate() {
    const trimmed = newDept.trim()
    if (!trimmed) return
    // Check for case-insensitive duplicate
    const existing = departments.find(d => d.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      onChange(existing)
    } else {
      onChange(trimmed)
    }
    setNewDept('')
    setCreating(false)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm text-left"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
        }}
      >
        {value ? (
          <span className="flex items-center gap-2">
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                color: 'var(--color-primary)',
              }}
            >
              {value}
            </span>
          </span>
        ) : (
          <span>Select department...</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {/* Search */}
          {departments.length > 3 && (
            <div className="border-b p-2" style={{ borderColor: 'var(--color-border)' }}>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search departments..."
                className="w-full rounded-md border px-2.5 py-1.5 text-sm outline-none"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto">
            {/* None option */}
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="flex w-full items-center px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                Clear department
              </button>
            )}

            {/* Existing departments */}
            {filtered.map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => handleSelect(dept)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm transition-colors"
                style={{
                  color: 'var(--color-text)',
                  backgroundColor: dept === value ? 'var(--color-bg-tertiary)' : 'transparent',
                }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => {
                  e.currentTarget.style.backgroundColor = dept === value ? 'var(--color-bg-tertiary)' : 'transparent'
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    {dept}
                  </span>
                </span>
                {dept === value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}

            {filtered.length === 0 && search && (
              <div className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                No departments match "{search}"
              </div>
            )}
          </div>

          {/* Create new */}
          <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
            {creating ? (
              <div className="flex items-center gap-2 p-2">
                <input
                  ref={newDeptRef}
                  type="text"
                  value={newDept}
                  onChange={e => setNewDept(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
                    if (e.key === 'Escape') { setCreating(false); setNewDept('') }
                  }}
                  placeholder="Department name"
                  className="flex-1 rounded-md border px-2.5 py-1.5 text-sm outline-none"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors"
                style={{ color: 'var(--color-primary)' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create new department
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
