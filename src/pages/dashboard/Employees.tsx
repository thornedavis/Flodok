import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164, formatPhone } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { FilterPanel, FilterSearchInput, MultiSelectDropdown } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts } from '../../lib/employee'
import { getSopStarterTemplate } from '../../lib/templates'
import { isPro, syncSeats } from '../../lib/billing'
import { FREE_EMPLOYEE_LIMIT, PRO_MIN_SEATS } from '../../lib/pricing'
import { UpgradeModal } from '../../components/UpgradeModal'
import { useBilling } from '../../contexts/BillingContext'
import type { Translations } from '../../lib/translations'
import type { User, Employee, Organization } from '../../types/aliases'

type EmployeesView = 'list' | 'cards'
type EmployeeStatus = 'active' | 'probation' | 'suspended' | 'terminated' | 'archived'
type SortField = 'name' | 'created_at' | 'phone' | 'status'
type SortDir = 'asc' | 'desc'
type ColumnKey = 'departments' | 'phone' | 'status' | 'portal'

const VIEW_STORAGE_KEY = 'flodok.employees.view'
const COLUMNS_STORAGE_KEY = 'flodok.employees.columns'
const STATUS_ORDER: EmployeeStatus[] = ['active', 'probation', 'suspended', 'terminated', 'archived']
const COLUMN_ORDER: ColumnKey[] = ['departments', 'phone', 'status', 'portal']
const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['departments', 'phone', 'status', 'portal']
const STATUS_SORT_RANK: Record<EmployeeStatus, number> = {
  active: 0, probation: 1, suspended: 2, terminated: 3, archived: 4,
}

export function Employees({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const seedQuery = (location.state as { q?: string } | null)?.q ?? ''
  const { canWrite, visibleItemLimit, state: dunning } = useBilling()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [searchQuery, setSearchQuery] = useState(seedQuery)
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<EmployeeStatus>>(() => new Set(['active']))
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [empPageSize, setEmpPageSize] = useState(12)
  const [empCurrentPage, setEmpCurrentPage] = useState(1)
  const [view, setView] = useState<EmployeesView>(() => {
    if (typeof window === 'undefined') return 'list'
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return saved === 'cards' ? 'cards' : 'list'
  })
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window === 'undefined') return new Set(DEFAULT_VISIBLE_COLUMNS)
    try {
      const saved = window.localStorage.getItem(COLUMNS_STORAGE_KEY)
      if (!saved) return new Set(DEFAULT_VISIBLE_COLUMNS)
      const parsed = JSON.parse(saved) as unknown
      if (!Array.isArray(parsed)) return new Set(DEFAULT_VISIBLE_COLUMNS)
      return new Set(parsed.filter((c): c is ColumnKey => COLUMN_ORDER.includes(c as ColumnKey)))
    } catch {
      return new Set(DEFAULT_VISIBLE_COLUMNS)
    }
  })

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, view) } catch { /* storage unavailable */ }
  }, [view])

  useEffect(() => {
    try { window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visibleColumns])) } catch { /* storage unavailable */ }
  }, [visibleColumns])


  useEffect(() => {
    loadData()
  }, [user.org_id])

  async function loadData() {
    const [empResult, orgResult] = await Promise.all([
      supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
      supabase.from('organizations').select('*').eq('id', user.org_id).single(),
    ])
    setEmployees(empResult.data || [])
    setOrg(orgResult.data)
    setLoading(false)
  }

  async function handleDuplicate(emp: Employee) {
    if (!canWrite) return
    if (org && !isPro(org) && employees.length >= FREE_EMPLOYEE_LIMIT) {
      setShowUpgrade(true)
      return
    }
    const newName = prompt(t.promptDuplicateName, t.copyOfName(emp.name))
    if (!newName) return
    const newPhone = prompt(t.promptDuplicatePhone)
    if (!newPhone) return

    const phone = normalizePhone(newPhone, org?.default_country_code)
    if (!isValidE164(phone)) {
      alert(t.invalidPhone)
      return
    }

    const slug = generateSlug(newName)
    const token = generateAccessToken()

    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({
        org_id: user.org_id,
        name: newName,
        phone,
        departments: getEmployeeDepts(emp),
        department: getEmployeeDepts(emp)[0] || null,
        slug,
        access_token: token,
      })
      .select()
      .single()

    if (error) { alert(error.message); return }

    const { data: sop } = await supabase
      .from('sops')
      .select('*')
      .eq('employee_id', emp.id)
      .single()

    if (sop && newEmp) {
      await supabase.from('sops').insert({
        org_id: user.org_id,
        employee_id: newEmp.id,
        title: sop.title,
        content_markdown: sop.content_markdown,
        status: 'draft',
      })
    }

    if (org && isPro(org)) {
      syncSeats().catch(err => console.error('sync-seats failed after duplicate:', err))
    }

    loadData()
  }

  async function handleDelete(emp: Employee) {
    if (!canWrite) return
    if (!confirm(t.deleteEmployeeConfirm(emp.name))) return
    await supabase.from('employees').delete().eq('id', emp.id)
    if (org && isPro(org)) {
      syncSeats().catch(err => console.error('sync-seats failed after delete:', err))
    }
    loadData()
  }

  async function handleAddClick() {
    if (!org) return
    if (!canWrite) {
      // Read-only or frozen — no add at all. Banner already explains why.
      return
    }
    if (!isPro(org) && employees.length >= FREE_EMPLOYEE_LIMIT) {
      setShowUpgrade(true)
      return
    }

    const placeholderName = t.empNewPlaceholderName
    const slug = generateSlug(placeholderName)
    const token = generateAccessToken()

    const { data: emp, error } = await supabase
      .from('employees')
      .insert({
        org_id: user.org_id,
        name: placeholderName,
        phone: '',
        slug,
        access_token: token,
        status: 'probation',
      })
      .select()
      .single()

    if (error || !emp) {
      alert(error?.message || 'Failed to create employee')
      return
    }

    // Match the existing convention: every employee gets a draft starter SOP.
    await supabase.from('sops').insert({
      org_id: user.org_id,
      employee_id: emp.id,
      title: t.defaultSopTitle(placeholderName),
      content_markdown: getSopStarterTemplate(),
      status: 'draft',
    })

    if (isPro(org)) {
      syncSeats().catch(err => console.error('sync-seats failed after add:', err))
    }

    navigate(`/dashboard/employees/${emp.id}/edit?new=1`)
  }

  // Derive departments — collect from each employee's array, falling back to legacy
  const departments = [...new Set(employees.flatMap(e => getEmployeeDepts(e)))].sort()

  function getDepartmentCount(dept: string) {
    return employees.filter(e => getEmployeeDepts(e).includes(dept)).length
  }

  // Filter + sort
  const filtered = employees
    .filter(e => {
      const empDepts = getEmployeeDepts(e)
      const matchesStatus = statusFilter.size === 0 || statusFilter.has(e.status as EmployeeStatus)
      const matchesDept = activeDepartments.size === 0 || empDepts.some(d => activeDepartments.has(d))
      const q = searchQuery.trim().toLowerCase()
      const matchesSearch = !q ||
        e.name.toLowerCase().includes(q) ||
        e.phone.includes(q) ||
        empDepts.some(d => d.toLowerCase().includes(q)) ||
        e.email?.toLowerCase().includes(q)
      return matchesStatus && matchesDept && matchesSearch
    })
    .slice()
    .sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':       cmp = a.name.localeCompare(b.name); break
        case 'created_at': cmp = a.created_at.localeCompare(b.created_at); break
        case 'phone':      cmp = (a.phone || '').localeCompare(b.phone || ''); break
        case 'status': {
          const ra = STATUS_SORT_RANK[(a.status as EmployeeStatus)] ?? 99
          const rb = STATUS_SORT_RANK[(b.status as EmployeeStatus)] ?? 99
          cmp = ra - rb
          if (cmp === 0) cmp = a.name.localeCompare(b.name)
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  function getStatusCount(status: EmployeeStatus) {
    return employees.filter(e => e.status === status).length
  }

  const statusLabels: Record<EmployeeStatus, string> = {
    active: t.employeeStatusActive,
    probation: t.employeeStatusProbation,
    suspended: t.employeeStatusSuspended,
    terminated: t.employeeStatusTerminated,
    archived: t.employeeStatusArchived,
  }

  // Frozen-Free orgs (was Pro, sub canceled) only see the first N items.
  // Hidden items are preserved server-side and reappear on resume.
  const visibleFiltered = visibleItemLimit !== null ? filtered.slice(0, visibleItemLimit) : filtered
  const hiddenCount = filtered.length - visibleFiltered.length
  const empTotalPages = Math.max(1, Math.ceil(visibleFiltered.length / empPageSize))
  const paginatedEmployees = visibleFiltered.slice((empCurrentPage - 1) * empPageSize, empCurrentPage * empPageSize)

  // Reset page when filters change
  useEffect(() => { setEmpCurrentPage(1) }, [searchQuery, activeDepartments, statusFilter, empPageSize])

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const departmentOptions = departments.map(d => ({ id: d, label: d, count: getDepartmentCount(d) }))

  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect' as const,
      key: 'status',
      label: t.employeeStatusFilterLabel,
      value: [...statusFilter],
      options: STATUS_ORDER.map(s => ({ id: s, label: statusLabels[s], count: getStatusCount(s) })),
      onChange: (next: string[]) => setStatusFilter(new Set(next as EmployeeStatus[])),
    },
    ...(departments.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'departments',
      label: t.departments,
      value: [...activeDepartments],
      options: departmentOptions,
      onChange: (next: string[]) => setActiveDepartments(new Set(next)),
      footerAction: { label: t.manageDepartments, onClick: () => navigate('/dashboard/company') },
    }] : []),
    {
      type: 'select' as const,
      key: 'sort',
      label: t.sortLabel,
      value: `${sortField}|${sortDir}`,
      defaultValue: 'name|asc',
      options: [
        { id: 'name|asc',        label: t.sortNameAsc },
        { id: 'name|desc',       label: t.sortNameDesc },
        { id: 'created_at|desc', label: t.sortRecentlyAdded },
        { id: 'created_at|asc',  label: t.sortOldest },
      ],
      onChange: (next: string) => {
        const [f, d] = next.split('|') as [SortField, SortDir]
        setSortField(f)
        setSortDir(d)
      },
    },
  ]

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.employeesTitle}</h1>
        <button
          onClick={handleAddClick}
          disabled={!canWrite}
          title={!canWrite ? t.dunningWriteBlocked : undefined}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.addEmployee}
        </button>
      </div>

      {hiddenCount > 0 && dunning === 'free_frozen' && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
        >
          {t.dunningHiddenItemsNotice.replace('{count}', String(hiddenCount))}
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-5 flex w-full flex-wrap items-center gap-2">
        <ViewToggle view={view} onChange={setView} t={t} />
        <FilterPanel
          triggerLabel={t.filterButtonLabel}
          sections={filterSections}
          onReset={() => {
            setActiveDepartments(new Set())
            setStatusFilter(new Set(['active']))
            setSortField('name')
            setSortDir('asc')
          }}
        />
        {view === 'list' && (
          <MultiSelectDropdown
            label={t.columnsButtonLabel}
            value={[...visibleColumns]}
            onChange={next => setVisibleColumns(new Set(next as ColumnKey[]))}
            options={[
              { id: 'departments', label: t.departments },
              { id: 'phone',       label: t.phoneWhatsAppLabel },
              { id: 'status',      label: t.statusLabel },
              { id: 'portal',      label: t.colPortalLink },
            ]}
          />
        )}
        <div className="ml-auto w-full sm:w-64">
          <FilterSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t.searchEmployeesPlaceholder}
          />
        </div>
      </div>

      <div>
        <div>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {employees.length === 0
                ? t.noEmployeesYet
                : t.noEmployeesMatchFilters}
            </p>
          ) : (
            <>
              {view === 'cards' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {paginatedEmployees.map(emp => (
                    <EmployeeCard
                      key={emp.id}
                      emp={emp}
                      t={t}
                      onDuplicate={() => handleDuplicate(emp)}
                      onDelete={() => handleDelete(emp)}
                      onEdit={() => navigate(`/dashboard/employees/${emp.id}/edit`)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="overflow-hidden rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                >
                  <ListHeader
                    t={t}
                    sortField={sortField}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                    visibleColumns={visibleColumns}
                  />
                  {paginatedEmployees.map((emp, idx) => (
                    <EmployeeRow
                      key={emp.id}
                      emp={emp}
                      t={t}
                      statusLabel={statusLabels[(emp.status as EmployeeStatus) ?? 'active'] ?? emp.status}
                      isLast={idx === paginatedEmployees.length - 1}
                      visibleColumns={visibleColumns}
                      onDuplicate={() => handleDuplicate(emp)}
                      onDelete={() => handleDelete(emp)}
                      onEdit={() => navigate(`/dashboard/employees/${emp.id}/edit`)}
                    />
                  ))}
                </div>
              )}

              <PaginationFooter
                t={t}
                total={visibleFiltered.length}
                pageSize={empPageSize}
                currentPage={empCurrentPage}
                totalPages={empTotalPages}
                onPageChange={setEmpCurrentPage}
                onPageSizeChange={setEmpPageSize}
              />
            </>
          )}
        </div>

      </div>

      {showUpgrade && (
        <UpgradeModal
          t={t}
          initialSeats={Math.max(employees.length + 1, PRO_MIN_SEATS)}
          cancelReturnPath="/employees"
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded p-0.5 transition-colors"
      style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
      title={copied ? t.copied : t.copy}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

function EmployeeCard({ emp, t, onDuplicate, onDelete, onEdit }: {
  emp: Employee
  t: Translations
  onDuplicate: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div
      onClick={onEdit}
      className="group relative cursor-pointer rounded-xl border p-5 transition-all"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Three-dot menu */}
      <div ref={menuRef} className="absolute right-3 top-3">
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-8 z-10 min-w-[140px] rounded-lg border py-1 shadow-lg"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDuplicate() }}
              className="flex w-full items-center px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--color-text)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {t.duplicate}
            </button>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete() }}
              className="flex w-full items-center px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--color-danger)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {t.delete}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ background: emp.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(emp.id) }}
        >
          {emp.photo_url && (
            <img src={emp.photo_url} alt={emp.name} className="h-full w-full object-cover" />
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          {getEmployeeDepts(emp).length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {getEmployeeDepts(emp).map(dept => (
                <span
                  key={dept}
                  className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {dept}
                </span>
              ))}
            </div>
          )}
          <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
            {emp.name}
          </h3>

          {/* WhatsApp number with copy */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {formatPhone(emp.phone)}
            </span>
            <CopyButton value={emp.phone} />
          </div>

          {/* Portal URL with copy */}
          <div className="mt-1 flex items-center gap-1.5">
            <span className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {`${window.location.origin}/portal/${emp.slug}-${emp.access_token}`}
            </span>
            <CopyButton value={`${window.location.origin}/portal/${emp.slug}-${emp.access_token}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ViewToggle({ view, onChange, t }: {
  view: EmployeesView
  onChange: (next: EmployeesView) => void
  t: Translations
}) {
  const items: Array<{ key: EmployeesView; label: string; icon: React.ReactNode }> = [
    {
      key: 'list',
      label: t.viewList,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      key: 'cards',
      label: t.viewCards,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
  ]
  return (
    <div
      role="group"
      className="inline-flex items-center rounded-full border p-0.5"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {items.map(item => {
        const active = view === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            title={item.label}
            className="flex items-center justify-center rounded-full p-1.5 transition-colors"
            style={{
              backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}

function StatusBadge({ status, label }: { status: EmployeeStatus; label: string }) {
  const tone: Record<EmployeeStatus, { bg: string; fg: string }> = {
    active:     { bg: 'color-mix(in srgb, var(--color-success, #16a34a) 14%, transparent)', fg: 'var(--color-success, #16a34a)' },
    probation:  { bg: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',          fg: 'var(--color-primary)' },
    suspended:  { bg: 'color-mix(in srgb, var(--color-warning, #d97706) 14%, transparent)', fg: 'var(--color-warning, #d97706)' },
    terminated: { bg: 'color-mix(in srgb, var(--color-danger, #dc2626) 12%, transparent)',  fg: 'var(--color-danger, #dc2626)' },
    archived:   { bg: 'var(--color-bg-tertiary)',                                            fg: 'var(--color-text-tertiary)' },
  }
  const t = tone[status] ?? tone.archived
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {label}
    </span>
  )
}

function EmployeeRow({ emp, t, statusLabel, isLast, visibleColumns, onDuplicate, onDelete, onEdit }: {
  emp: Employee
  t: Translations
  statusLabel: string
  isLast: boolean
  visibleColumns: Set<ColumnKey>
  onDuplicate: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const depts = getEmployeeDepts(emp)
  const portalUrl = `${window.location.origin}/portal/${emp.slug}-${emp.access_token}`
  const status = (emp.status as EmployeeStatus) ?? 'active'

  return (
    <div
      onClick={onEdit}
      className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors"
      style={{
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        backgroundColor: 'transparent',
      }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{ background: emp.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(emp.id) }}
      >
        {emp.photo_url && <img src={emp.photo_url} alt={emp.name} className="h-full w-full object-cover" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {emp.name}
        </div>
        {visibleColumns.has('departments') && depts.length > 0 && (
          <div className="mt-0.5 truncate text-xs lg:hidden" style={{ color: 'var(--color-text-tertiary)' }}>
            {depts.join(' · ')}
          </div>
        )}
      </div>

      {visibleColumns.has('departments') && (
        <div className="hidden min-w-0 flex-1 lg:flex lg:flex-wrap lg:gap-1">
          {depts.length === 0 ? (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>—</span>
          ) : (
            depts.map(dept => (
              <span
                key={dept}
                className="inline-flex truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
              >
                {dept}
              </span>
            ))
          )}
        </div>
      )}

      {visibleColumns.has('phone') && (
        <div className="hidden w-36 shrink-0 truncate text-right text-xs md:block" style={{ color: 'var(--color-text-secondary)' }}>
          {formatPhone(emp.phone)}
        </div>
      )}

      {visibleColumns.has('status') && (
        <div className="w-20 shrink-0 text-right">
          <StatusBadge status={status} label={statusLabel} />
        </div>
      )}

      {visibleColumns.has('portal') && (
        <div onClick={e => e.stopPropagation()} className="hidden md:block">
          <CopyButton value={portalUrl} />
        </div>
      )}

      <div ref={menuRef} className="relative">
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen) }}
          className="rounded-md p-1.5 transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-8 z-10 min-w-[140px] rounded-lg border py-1 shadow-lg"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDuplicate() }}
              className="flex w-full items-center px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--color-text)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {t.duplicate}
            </button>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete() }}
              className="flex w-full items-center px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--color-danger)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {t.delete}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ListHeader({ t, sortField, sortDir, onToggle, visibleColumns }: {
  t: Translations
  sortField: SortField
  sortDir: SortDir
  onToggle: (field: SortField) => void
  visibleColumns: Set<ColumnKey>
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-tertiary)',
      }}
    >
      <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      <SortableHeader
        label={t.nameLabel}
        field="name"
        currentField={sortField}
        currentDir={sortDir}
        onClick={() => onToggle('name')}
        className="min-w-0 flex-1"
      />
      {visibleColumns.has('departments') && (
        <div className="hidden min-w-0 flex-1 lg:block">{t.departments}</div>
      )}
      {visibleColumns.has('phone') && (
        <SortableHeader
          label={t.phoneWhatsAppLabel}
          field="phone"
          currentField={sortField}
          currentDir={sortDir}
          onClick={() => onToggle('phone')}
          align="right"
          className="hidden w-36 shrink-0 md:block"
        />
      )}
      {visibleColumns.has('status') && (
        <SortableHeader
          label={t.statusLabel}
          field="status"
          currentField={sortField}
          currentDir={sortDir}
          onClick={() => onToggle('status')}
          align="right"
          className="w-20 shrink-0"
        />
      )}
      {visibleColumns.has('portal') && (
        <div className="hidden w-[22px] shrink-0 md:block" aria-hidden="true" />
      )}
      <div className="w-7 shrink-0" aria-hidden="true" />
    </div>
  )
}

function SortableHeader({ label, field, currentField, currentDir, onClick, align = 'left', className = '' }: {
  label: string
  field: SortField
  currentField: SortField
  currentDir: SortDir
  onClick: () => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = currentField === field
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 truncate transition-colors hover:text-[var(--color-text)] ${align === 'right' ? 'justify-end' : ''} ${className}`}
      style={{ color: active ? 'var(--color-text)' : undefined }}
      aria-sort={active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="truncate">{label}</span>
      <svg
        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{
          opacity: active ? 1 : 0.35,
          transform: active && currentDir === 'desc' ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s, opacity 0.15s',
        }}
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  )
}

function PaginationFooter({ t, total, pageSize, currentPage, totalPages, onPageChange, onPageSizeChange }: {
  t: Translations
  total: number
  pageSize: number
  currentPage: number
  totalPages: number
  onPageChange: (next: number) => void
  onPageSizeChange: (next: number) => void
}) {
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(total, currentPage * pageSize)
  const atFirst = currentPage <= 1
  const atLast = currentPage >= totalPages

  const navBtnStyle = (disabled: boolean) => ({
    borderColor: 'var(--color-border)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text)',
    backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  } as const)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <option value={12}>{t.perPage(12)}</option>
          <option value={24}>{t.perPage(24)}</option>
          <option value={48}>{t.perPage(48)}</option>
        </select>
        <span>{t.paginationShowing(start, end, total)}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={atFirst}
          aria-label={t.previous}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atFirst)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={atFirst}
          aria-label={t.previous}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atFirst)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="px-2 text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          {t.pageOfPages(currentPage, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={atLast}
          aria-label={t.next}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atLast)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={atLast}
          aria-label={t.next}
          className="rounded-lg border px-2 py-1.5 text-xs"
          style={navBtnStyle(atLast)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
