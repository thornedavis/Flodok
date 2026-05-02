import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164, formatPhone } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { FilterPill, FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { ManageDepartmentsModal } from '../../components/ManageDepartmentsModal'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts } from '../../lib/employee'
import { getSopStarterTemplate } from '../../lib/templates'
import { isPro, syncSeats } from '../../lib/billing'
import { FREE_EMPLOYEE_LIMIT, PRO_MIN_SEATS } from '../../lib/pricing'
import { UpgradeModal } from '../../components/UpgradeModal'
import { useBilling } from '../../contexts/BillingContext'
import type { Translations } from '../../lib/translations'
import type { User, Employee, Organization } from '../../types/aliases'

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'probation' | 'suspended' | 'terminated' | 'archived'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'recently_added'>('name')
  const [empPageSize, setEmpPageSize] = useState(12)
  const [empCurrentPage, setEmpCurrentPage] = useState(1)
  const [manageOpen, setManageOpen] = useState(false)


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
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter
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
      if (sortBy === 'recently_added') return b.created_at.localeCompare(a.created_at)
      return a.name.localeCompare(b.name)
    })

  function getStatusCount(status: 'active' | 'probation' | 'suspended' | 'terminated' | 'archived') {
    return employees.filter(e => e.status === status).length
  }

  // Frozen-Free orgs (was Pro, sub canceled) only see the first N items.
  // Hidden items are preserved server-side and reappear on resume.
  const visibleFiltered = visibleItemLimit !== null ? filtered.slice(0, visibleItemLimit) : filtered
  const hiddenCount = filtered.length - visibleFiltered.length
  const empTotalPages = Math.max(1, Math.ceil(visibleFiltered.length / empPageSize))
  const paginatedEmployees = visibleFiltered.slice((empCurrentPage - 1) * empPageSize, empCurrentPage * empPageSize)

  // Reset page when filters change
  useEffect(() => { setEmpCurrentPage(1) }, [searchQuery, activeDepartments, empPageSize])

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const departmentOptions = departments.map(d => ({ id: d, label: d, count: getDepartmentCount(d) }))

  const filterSections: FilterPanelSection[] = [
    ...(departments.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'departments',
      label: t.departments,
      value: [...activeDepartments],
      options: departmentOptions,
      onChange: (next: string[]) => setActiveDepartments(new Set(next)),
      footerAction: { label: t.manageDepartments, onClick: () => setManageOpen(true) },
    }] : []),
    {
      type: 'select' as const,
      key: 'sort',
      label: t.sortLabel,
      value: sortBy,
      defaultValue: 'name',
      options: [
        { id: 'name', label: t.sortNameAsc },
        { id: 'recently_added', label: t.sortRecentlyAdded },
      ],
      onChange: (next: string) => setSortBy(next as typeof sortBy),
    },
  ]

  type StatusKey = 'all' | 'active' | 'probation' | 'suspended' | 'terminated' | 'archived'
  const statusPills: Array<{ key: StatusKey; label: string; count: number }> = [
    { key: 'all',        label: t.employeeStatusAll,        count: employees.length },
    { key: 'active',     label: t.employeeStatusActive,     count: getStatusCount('active') },
    { key: 'probation',  label: t.employeeStatusProbation,  count: getStatusCount('probation') },
    { key: 'suspended',  label: t.employeeStatusSuspended,  count: getStatusCount('suspended') },
    { key: 'terminated', label: t.employeeStatusTerminated, count: getStatusCount('terminated') },
    { key: 'archived',   label: t.employeeStatusArchived,   count: getStatusCount('archived') },
  ]

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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {statusPills.map(p => (
          <FilterPill
            key={p.key}
            active={statusFilter === p.key}
            onClick={() => setStatusFilter(p.key)}
            count={p.count}
          >
            {p.label}
          </FilterPill>
        ))}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t.searchEmployeesPlaceholder}
            />
          </div>
          <FilterPanel
            triggerLabel={t.filterButtonLabel}
            sections={filterSections}
            onReset={() => { setActiveDepartments(new Set()); setSortBy('name') }}
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

              {empTotalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setEmpCurrentPage(p => Math.max(1, p - 1))}
                    disabled={empCurrentPage === 1}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: empCurrentPage === 1 ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                      backgroundColor: 'var(--color-bg-elevated)',
                    }}
                  >
                    {t.previous}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.pageOfPages(empCurrentPage, empTotalPages)}
                  </span>
                  <button
                    onClick={() => setEmpCurrentPage(p => Math.min(empTotalPages, p + 1))}
                    disabled={empCurrentPage === empTotalPages}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: empCurrentPage === empTotalPages ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                      backgroundColor: 'var(--color-bg-elevated)',
                    }}
                  >
                    {t.next}
                  </button>
                  <select
                    value={empPageSize}
                    onChange={e => setEmpPageSize(Number(e.target.value))}
                    className="rounded-lg border px-2 py-1.5 text-xs"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                  >
                    <option value={12}>{t.perPage(12)}</option>
                    <option value={24}>{t.perPage(24)}</option>
                    <option value={48}>{t.perPage(48)}</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>

      </div>

      <ManageDepartmentsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        departments={departments}
        employees={employees}
        onChanged={() => { setActiveDepartments(new Set()); loadData() }}
      />

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
