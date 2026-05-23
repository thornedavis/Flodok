import { useEffect, useMemo, useRef, useState } from 'react'

export type AudienceTargetType =
  | 'everyone'
  | 'employee'
  | 'department'
  | 'branch'
  | 'job_position'
  | 'job_level'
  | 'employee_class'

export interface AudienceTarget {
  type: AudienceTargetType
  id: string | null
  label: string
}

export interface AudienceEmployee {
  id: string
  name: string
  branch_name: string | null
  job_position: string | null
  job_level: string | null
  class: string | null
  departmentIds: string[]
  primaryDept?: string | null
}

export interface NamedRef {
  id: string
  name: string
}

// Case-sensitive trim equality — matches the SQL resolver in
// migration 112 (sop_resolved_audience). Keep them aligned: if the
// SQL becomes case-insensitive, this should too.
function normalize(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function resolveAudience(
  targets: AudienceTarget[],
  employees: AudienceEmployee[],
  branches: NamedRef[],
  jobPositions: NamedRef[],
  jobLevels: NamedRef[],
  employeeClasses: NamedRef[],
): Set<string> {
  const result = new Set<string>()
  if (targets.some(t => t.type === 'everyone')) {
    employees.forEach(e => result.add(e.id))
    return result
  }

  const branchName = new Map(branches.map(b => [b.id, normalize(b.name)]))
  const posName = new Map(jobPositions.map(p => [p.id, normalize(p.name)]))
  const lvlName = new Map(jobLevels.map(l => [l.id, normalize(l.name)]))
  const clsName = new Map(employeeClasses.map(c => [c.id, normalize(c.name)]))

  for (const target of targets) {
    if (!target.id) continue
    switch (target.type) {
      case 'employee':
        result.add(target.id)
        break
      case 'department':
        employees
          .filter(e => e.departmentIds.includes(target.id!))
          .forEach(e => result.add(e.id))
        break
      case 'branch': {
        const name = branchName.get(target.id)
        if (!name) break
        employees
          .filter(e => normalize(e.branch_name) === name)
          .forEach(e => result.add(e.id))
        break
      }
      case 'job_position': {
        const name = posName.get(target.id)
        if (!name) break
        employees
          .filter(e => normalize(e.job_position) === name)
          .forEach(e => result.add(e.id))
        break
      }
      case 'job_level': {
        const name = lvlName.get(target.id)
        if (!name) break
        employees
          .filter(e => normalize(e.job_level) === name)
          .forEach(e => result.add(e.id))
        break
      }
      case 'employee_class': {
        const name = clsName.get(target.id)
        if (!name) break
        employees
          .filter(e => normalize(e.class) === name)
          .forEach(e => result.add(e.id))
        break
      }
    }
  }
  return result
}

interface AudienceItem {
  id: string
  label: string
  sublabel?: string
}

interface AudiencePickerProps {
  value: AudienceTarget[]
  onChange: (next: AudienceTarget[]) => void
  employees: AudienceEmployee[]
  departments: NamedRef[]
  branches: NamedRef[]
  jobPositions: NamedRef[]
  jobLevels: NamedRef[]
  employeeClasses: NamedRef[]
  disabled?: boolean
}

export function AudiencePicker({
  value,
  onChange,
  employees,
  departments,
  branches,
  jobPositions,
  jobLevels,
  employeeClasses,
  disabled,
}: AudiencePickerProps) {
  const hasEveryone = value.some(t => t.type === 'everyone')

  const resolved = useMemo(
    () => resolveAudience(value, employees, branches, jobPositions, jobLevels, employeeClasses),
    [value, employees, branches, jobPositions, jobLevels, employeeClasses],
  )

  function toggleEveryone() {
    if (hasEveryone) {
      onChange(value.filter(t => t.type !== 'everyone'))
    } else {
      onChange([{ type: 'everyone', id: null, label: 'Everyone' }])
    }
  }

  const sectionsDisabled = disabled || hasEveryone

  const employeeItems: AudienceItem[] = useMemo(
    () => employees.map(e => ({
      id: e.id,
      label: e.name,
      sublabel: e.primaryDept || undefined,
    })),
    [employees],
  )

  return (
    <div className="space-y-3">
      <EveryonePill on={hasEveryone} onToggle={toggleEveryone} disabled={disabled} />

      <div
        className="space-y-3 transition-opacity"
        style={{
          opacity: hasEveryone ? 0.4 : 1,
          pointerEvents: hasEveryone ? 'none' : 'auto',
        }}
        aria-hidden={hasEveryone || undefined}
      >
        <AudienceSection
          label="Departments"
          type="department"
          items={departments.map(d => ({ id: d.id, label: d.name }))}
          value={value}
          onChange={onChange}
          disabled={sectionsDisabled}
        />
        <AudienceSection
          label="Branches"
          type="branch"
          items={branches.map(b => ({ id: b.id, label: b.name }))}
          value={value}
          onChange={onChange}
          disabled={sectionsDisabled}
        />
        <AudienceSection
          label="Job positions"
          type="job_position"
          items={jobPositions.map(p => ({ id: p.id, label: p.name }))}
          value={value}
          onChange={onChange}
          disabled={sectionsDisabled}
        />
        <AudienceSection
          label="Job levels"
          type="job_level"
          items={jobLevels.map(l => ({ id: l.id, label: l.name }))}
          value={value}
          onChange={onChange}
          disabled={sectionsDisabled}
        />
        <AudienceSection
          label="Employee classes"
          type="employee_class"
          items={employeeClasses.map(c => ({ id: c.id, label: c.name }))}
          value={value}
          onChange={onChange}
          disabled={sectionsDisabled}
        />
        <AudienceSection
          label="Individuals"
          type="employee"
          items={employeeItems}
          value={value}
          onChange={onChange}
          disabled={sectionsDisabled}
        />
      </div>

      <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {hasEveryone
          ? `Everyone in your organisation will see this SOP (${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}).`
          : value.length === 0
            ? 'No audience set — nobody will see this SOP.'
            : `Resolves to ${resolved.size} of ${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}.`}
      </div>
    </div>
  )
}

function EveryonePill({
  on,
  onToggle,
  disabled,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        borderColor: on ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: on ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
        color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)',
      }}
    >
      {on && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      Everyone in organisation
    </button>
  )
}

interface AudienceSectionProps {
  label: string
  type: Exclude<AudienceTargetType, 'everyone'>
  items: AudienceItem[]
  value: AudienceTarget[]
  onChange: (next: AudienceTarget[]) => void
  disabled?: boolean
}

function AudienceSection({ label, type, items, value, onChange, disabled }: AudienceSectionProps) {
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
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // Focus the search input when the popover opens; the query reset
  // lives in the trigger handler so this effect doesn't call setState.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const selectedIds = useMemo(
    () => new Set(
      value
        .filter(t => t.type === type)
        .map(t => t.id)
        .filter((id): id is string => !!id),
    ),
    [value, type],
  )

  const selectedItems = useMemo(
    () => items.filter(i => selectedIds.has(i.id)),
    [items, selectedIds],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.sublabel?.toLowerCase().includes(q) ?? false),
    )
  }, [items, query])

  if (items.length === 0) return null

  function toggle(item: AudienceItem) {
    if (selectedIds.has(item.id)) {
      onChange(value.filter(t => !(t.type === type && t.id === item.id)))
    } else {
      onChange([...value, { type, id: item.id, label: item.label }])
    }
  }

  function clearAll() {
    onChange(value.filter(t => t.type !== type))
  }

  const triggerLabel =
    selectedItems.length === 0
      ? `Select ${label.toLowerCase()}`
      : selectedItems.length === 1
        ? selectedItems[0].label
        : selectedItems.length <= 3
          ? selectedItems.map(i => i.label).join(', ')
          : `${selectedItems.slice(0, 2).map(i => i.label).join(', ')} +${selectedItems.length - 2}`

  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </label>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => {
            if (disabled) return
            if (!open) setQuery('')
            setOpen(o => !o)
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: selectedItems.length > 0 ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          }}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {selectedItems.length > 0 && !disabled && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Clear ${label.toLowerCase()}`}
                onClick={e => { e.stopPropagation(); clearAll() }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); clearAll() } }}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-colors hover:opacity-70"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {open && (
          <div
            role="listbox"
            aria-multiselectable
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
                  placeholder={`Search ${label.toLowerCase()}…`}
                  className="w-full rounded-md border bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
              </div>
            </div>

            {/* Scrollable list — height caps at ~3 rows then scrolls. */}
            <div className="max-h-[110px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  No matches
                </p>
              ) : (
                filtered.map(item => {
                  const selected = selectedIds.has(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => toggle(item)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                      style={{
                        color: 'var(--color-text)',
                        backgroundColor: selected
                          ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                          : 'transparent',
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
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="shrink-0 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          {item.sublabel}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
