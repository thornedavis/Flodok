import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164, formatPhone } from '../../lib/phone'
import { generateUniqueSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { FilterPanel, FilterSearchInput, MultiSelectDropdown } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts, type EmpDeptShape } from '../../lib/employee'
import { docAsJson, emptyDocumentDoc } from '../../lib/documentDoc'
import { isPro, syncSeats } from '../../lib/billing'
import { FREE_EMPLOYEE_LIMIT, PRO_MIN_SEATS } from '../../lib/pricing'
import { UpgradeModal } from '../../components/UpgradeModal'
import { ImportEmployeesModal } from '../../components/ImportEmployeesModal'
import { buildExportFile } from '../../lib/employeeImport'
import { useBilling } from '../../contexts/BillingContext'
import { deriveEmployeeStatus, type DerivedStatus } from '../../lib/employeeStatus'
import type { Translations } from '../../lib/translations'
import type { User, Employee, Organization } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

type EmployeesView = 'list' | 'cards'
// Filter values now mirror the derived status — pre-hire stages live on
// the Recruitment page (filtered out at the query level) so only these
// three states are reachable for an employee in the directory.
type EmployeeStatus = 'active' | 'probation' | 'separated'
type SortField =
  | 'name' | 'created_at' | 'phone' | 'status'
  | 'employee_code' | 'email' | 'branch_name' | 'job_position' | 'job_level'
  | 'class' | 'employment_type' | 'join_date'
type SortDir = 'asc' | 'desc'
type ColumnKey =
  | 'employee_code' | 'email' | 'departments' | 'branch_name' | 'job_position'
  | 'job_level' | 'class' | 'employment_type' | 'status' | 'phone'
  | 'join_date' | 'probation_end_date' | 'resign_date'
  | 'date_of_birth' | 'place_of_birth' | 'gender' | 'religion'
  | 'marital_status' | 'blood_type' | 'ktp_nik'
  | 'address' | 'postal_code' | 'citizen_id_address'
  | 'passport_number' | 'passport_expiry' | 'notes'
  | 'portal'

const VIEW_STORAGE_KEY = 'flodok.employees.view'
const COLUMNS_STORAGE_KEY = 'flodok.employees.columns'
const STATUS_ORDER: EmployeeStatus[] = ['active', 'probation', 'separated']
// Display order in the row + the order options appear in the Columns picker.
const COLUMN_ORDER: ColumnKey[] = [
  'employee_code', 'email', 'departments', 'branch_name', 'job_position',
  'job_level', 'class', 'employment_type', 'status', 'phone',
  'join_date', 'probation_end_date', 'resign_date',
  'date_of_birth', 'place_of_birth', 'gender', 'religion',
  'marital_status', 'blood_type', 'ktp_nik',
  'address', 'postal_code', 'citizen_id_address',
  'passport_number', 'passport_expiry', 'notes',
  'portal',
]
const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = ['departments', 'phone', 'status', 'portal']
const STATUS_SORT_RANK: Record<EmployeeStatus, number> = {
  active: 0, probation: 1, separated: 2,
}

// ───── List view column registry ─────────────────────────────────────
//
// Single source of truth for the list view: header label, body cell render,
// width, sortability. Both ListHeader and EmployeeRow read this so adding a
// column is a one-place change.

interface ListColumn {
  key: ColumnKey
  label: (t: Translations) => string
  /** Tailwind width class. */
  width: string
  sortField?: SortField
  alignRight?: boolean
  render: (ctx: { emp: EmployeeWithDepartments; t: Translations; statusLabels: Record<EmployeeStatus, string> }) => React.ReactNode
}

function emptyCell(): React.ReactNode {
  return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
}

function textCell(v: string | null | undefined): React.ReactNode {
  const trimmed = v?.trim()
  return trimmed ? trimmed : emptyCell()
}

const LIST_COLUMN_DEFS: Record<ColumnKey, ListColumn> = {
  employee_code:   { key: 'employee_code',   label: t => t.empFieldEmployeeCode,    width: 'w-28', sortField: 'employee_code',   render: ({ emp }) => textCell(emp.employee_code) },
  email:           { key: 'email',           label: t => t.empFieldEmail,           width: 'w-48', sortField: 'email',           render: ({ emp }) => textCell(emp.email) },
  departments: {
    key: 'departments',
    label: t => t.departments,
    width: 'w-56',
    render: ({ emp }) => {
      const depts = getEmployeeDepts(emp)
      if (depts.length === 0) return emptyCell()
      return (
        <div className="flex flex-wrap gap-1">
          {depts.map(d => (
            <span
              key={d}
              className="inline-flex truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            >
              {d}
            </span>
          ))}
        </div>
      )
    },
  },
  branch_name:     { key: 'branch_name',     label: t => t.empFieldBranchName,      width: 'w-36', sortField: 'branch_name',     render: ({ emp }) => textCell(emp.branch_name) },
  job_position:    { key: 'job_position',    label: t => t.empFieldJobPosition,     width: 'w-40', sortField: 'job_position',    render: ({ emp }) => textCell(emp.job_position) },
  job_level:       { key: 'job_level',       label: t => t.empFieldJobLevel,        width: 'w-32', sortField: 'job_level',       render: ({ emp }) => textCell(emp.job_level) },
  class:           { key: 'class',           label: t => t.empFieldClass,           width: 'w-28', sortField: 'class',           render: ({ emp }) => textCell(emp.class) },
  employment_type: { key: 'employment_type', label: t => t.empFieldEmploymentType,  width: 'w-32', sortField: 'employment_type', render: ({ emp }) => textCell(emp.employment_type) },
  status: {
    key: 'status', label: t => t.statusLabel, width: 'w-24', sortField: 'status', alignRight: true,
    render: ({ emp, t }) => {
      const derived = deriveEmployeeStatus(emp)
      return <DerivedStatusBadge status={derived} label={derivedStatusLabel(derived, t)} />
    },
  },
  phone: {
    key: 'phone', label: t => t.phoneWhatsAppLabel, width: 'w-36', sortField: 'phone', alignRight: true,
    render: ({ emp }) => emp.phone ? formatPhone(emp.phone) : emptyCell(),
  },
  join_date:           { key: 'join_date',           label: t => t.empFieldJoinDate,            width: 'w-28', sortField: 'join_date', render: ({ emp }) => textCell(emp.join_date) },
  probation_end_date:  { key: 'probation_end_date',  label: t => t.empFieldProbationEndDate,    width: 'w-32',                          render: ({ emp }) => textCell(emp.probation_end_date) },
  resign_date:         { key: 'resign_date',         label: t => t.empFieldResignDate,          width: 'w-28',                          render: ({ emp }) => textCell(emp.resign_date) },
  date_of_birth:       { key: 'date_of_birth',       label: t => t.empFieldDateOfBirth,         width: 'w-28',                          render: ({ emp }) => textCell(emp.date_of_birth) },
  place_of_birth:      { key: 'place_of_birth',      label: t => t.empFieldPlaceOfBirth,        width: 'w-32',                          render: ({ emp }) => textCell(emp.place_of_birth) },
  gender:              { key: 'gender',              label: t => t.empFieldGender,              width: 'w-24',                          render: ({ emp }) => textCell(emp.gender) },
  religion:            { key: 'religion',            label: t => t.empFieldReligion,            width: 'w-28',                          render: ({ emp }) => textCell(emp.religion) },
  marital_status:      { key: 'marital_status',      label: t => t.empFieldMaritalStatus,       width: 'w-28',                          render: ({ emp }) => textCell(emp.marital_status) },
  blood_type:          { key: 'blood_type',          label: t => t.empFieldBloodType,           width: 'w-20',                          render: ({ emp }) => textCell(emp.blood_type) },
  ktp_nik:             { key: 'ktp_nik',             label: t => t.empFieldKtpNik,              width: 'w-36',                          render: ({ emp }) => textCell(emp.ktp_nik) },
  address:             { key: 'address',             label: t => t.empFieldResidentialAddress,  width: 'w-56',                          render: ({ emp }) => textCell(emp.address) },
  postal_code:         { key: 'postal_code',         label: t => t.empFieldPostalCode,          width: 'w-24',                          render: ({ emp }) => textCell(emp.postal_code) },
  citizen_id_address:  { key: 'citizen_id_address',  label: t => t.empFieldCitizenIdAddress,    width: 'w-56',                          render: ({ emp }) => textCell(emp.citizen_id_address) },
  passport_number:     { key: 'passport_number',     label: t => t.empFieldPassportNumber,      width: 'w-32',                          render: ({ emp }) => textCell(emp.passport_number) },
  passport_expiry:     { key: 'passport_expiry',     label: t => t.empFieldPassportExpiry,      width: 'w-28',                          render: ({ emp }) => textCell(emp.passport_expiry) },
  notes:               { key: 'notes',               label: t => t.notesLabel,                  width: 'w-56',                          render: ({ emp }) => textCell(emp.notes) },
  portal: {
    key: 'portal', label: t => t.colPortalLink, width: 'w-72',
    render: ({ emp }) => {
      const portalUrl = `${window.location.origin}/portal/${emp.slug}-${emp.access_token}`
      return (
        <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 min-w-0">
          <CopyableText value={portalUrl} />
          <CopyButton value={portalUrl} />
        </div>
      )
    },
  },
}

function compareEmployees(a: Employee, b: Employee, field: SortField): number {
  const lc = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase()
  switch (field) {
    case 'name':            return a.name.localeCompare(b.name)
    case 'created_at':      return a.created_at.localeCompare(b.created_at)
    case 'phone':           return lc(a.phone).localeCompare(lc(b.phone))
    case 'employee_code':   return lc(a.employee_code).localeCompare(lc(b.employee_code))
    case 'email':           return lc(a.email).localeCompare(lc(b.email))
    case 'branch_name':     return lc(a.branch_name).localeCompare(lc(b.branch_name))
    case 'job_position':    return lc(a.job_position).localeCompare(lc(b.job_position))
    case 'job_level':       return lc(a.job_level).localeCompare(lc(b.job_level))
    case 'class':           return lc(a.class).localeCompare(lc(b.class))
    case 'employment_type': return lc(a.employment_type).localeCompare(lc(b.employment_type))
    case 'join_date':       return (a.join_date ?? '').localeCompare(b.join_date ?? '')
    case 'status': {
      const ra = STATUS_SORT_RANK[deriveEmployeeStatus(a) as EmployeeStatus] ?? 99
      const rb = STATUS_SORT_RANK[deriveEmployeeStatus(b) as EmployeeStatus] ?? 99
      return (ra - rb) || a.name.localeCompare(b.name)
    }
  }
}

export function Employees({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const seedQuery = (location.state as { q?: string } | null)?.q ?? ''
  const { canWrite, visibleItemLimit, state: dunning } = useBilling()
  const [employees, setEmployees] = useState<EmployeeWithDepartments[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [searchQuery, setSearchQuery] = useState(seedQuery)
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [activeJobPositions, setActiveJobPositions] = useState<Set<string>>(new Set())
  const [activeJobLevels, setActiveJobLevels] = useState<Set<string>>(new Set())
  const [activeClasses, setActiveClasses] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<EmployeeStatus>>(() => new Set(['active']))
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [empPageSize, setEmpPageSize] = useState(12)
  const [empCurrentPage, setEmpCurrentPage] = useState(1)
  const [showImport, setShowImport] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
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
      supabase.from('employees')
        .select(EMPLOYEE_WITH_DEPTS_SELECT)
        .eq('org_id', user.org_id)
        .in('lifecycle_stage', ['active', 'separated'])
        .order('name'),
      supabase.from('organizations').select('*').eq('id', user.org_id).single(),
    ])
    setEmployees((empResult.data || []) as EmployeeWithDepartments[])
    setOrg(orgResult.data)
    setLoading(false)
  }

  async function handleDuplicate(emp: EmployeeWithDepartments) {
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

    const slug = generateUniqueSlug(newName)
    const token = generateAccessToken()

    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({
        org_id: user.org_id,
        name: newName,
        phone,
        slug,
        access_token: token,
      })
      .select()
      .single()

    if (error) { alert(error.message); return }

    // Copy the source employee's department assignments to the new row.
    const sourceLinks = (emp.employee_departments ?? []).filter(l => l.department)
    if (newEmp && sourceLinks.length > 0) {
      await supabase.from('employee_departments').insert(
        sourceLinks.map(l => ({
          employee_id: newEmp.id,
          department_id: l.department!.id,
          is_primary: l.is_primary,
        })),
      )
    }

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

  async function handleDelete(emp: EmployeeWithDepartments) {
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
    const slug = generateUniqueSlug(placeholderName)
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
    // Phase C onward: structured doc storage. The starter scaffold from the
    // markdown era is gone — Phase G's typed templates will reintroduce
    // starter content as a per-doc-type choice.
    await supabase.from('sops').insert({
      org_id: user.org_id,
      employee_id: emp.id,
      title: t.defaultSopTitle(placeholderName),
      content_doc: docAsJson(emptyDocumentDoc()),
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
      const matchesStatus = statusFilter.size === 0 || statusFilter.has(deriveEmployeeStatus(e) as EmployeeStatus)
      const matchesDept = activeDepartments.size === 0 || empDepts.some(d => activeDepartments.has(d))
      const matchesJobPos = activeJobPositions.size === 0 || (e.job_position ? activeJobPositions.has(e.job_position) : false)
      const matchesJobLevel = activeJobLevels.size === 0 || (e.job_level ? activeJobLevels.has(e.job_level) : false)
      const matchesClass = activeClasses.size === 0 || (e.class ? activeClasses.has(e.class) : false)
      const q = searchQuery.trim().toLowerCase()
      const matchesSearch = !q ||
        e.name.toLowerCase().includes(q) ||
        e.phone.includes(q) ||
        empDepts.some(d => d.toLowerCase().includes(q)) ||
        e.email?.toLowerCase().includes(q)
      return matchesStatus && matchesDept && matchesJobPos && matchesJobLevel && matchesClass && matchesSearch
    })
    .slice()
    .sort((a, b) => {
      const cmp = compareEmployees(a, b, sortField)
      return sortDir === 'asc' ? cmp : -cmp
    })

  function getStatusCount(status: EmployeeStatus) {
    return employees.filter(e => deriveEmployeeStatus(e) === status).length
  }

  const statusLabels: Record<EmployeeStatus, string> = {
    active: t.derivedStatusActive,
    probation: t.derivedStatusProbation,
    separated: t.derivedStatusSeparated,
  }

  // Frozen-Free orgs (was Pro, sub canceled) only see the first N items.
  // Hidden items are preserved server-side and reappear on resume.
  const visibleFiltered = visibleItemLimit !== null ? filtered.slice(0, visibleItemLimit) : filtered
  const hiddenCount = filtered.length - visibleFiltered.length
  const empTotalPages = Math.max(1, Math.ceil(visibleFiltered.length / empPageSize))
  const paginatedEmployees = visibleFiltered.slice((empCurrentPage - 1) * empPageSize, empCurrentPage * empPageSize)

  // Sticky-left "name" column width — sized to the longest name on the current
  // page within sensible min/max bounds. Header and rows share this so columns
  // line up. Approximation, not measureText, to keep the render path cheap.
  const nameColumnPx = (() => {
    const longest = paginatedEmployees.reduce((max, e) => Math.max(max, e.name?.length ?? 0), 0)
    const AVATAR = 36
    const GAP = 12
    const PX_PER_CHAR = 8.5
    const PADDING = 32
    return Math.max(176, Math.min(320, AVATAR + GAP + Math.ceil(longest * PX_PER_CHAR) + PADDING))
  })()

  // Reset page when filters change. Selection clears too — keeping it across
  // filter changes leads to confusing "deleted hidden things" outcomes.
  useEffect(() => { setEmpCurrentPage(1); setSelectedIds(new Set()) }, [searchQuery, activeDepartments, activeJobPositions, activeJobLevels, activeClasses, statusFilter, empPageSize])

  function toggleRowSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAllOnPage() {
    setSelectedIds(prev => {
      const allSelected = paginatedEmployees.length > 0 && paginatedEmployees.every(e => prev.has(e.id))
      const next = new Set(prev)
      for (const e of paginatedEmployees) {
        if (allSelected) next.delete(e.id); else next.add(e.id)
      }
      return next
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || !canWrite || bulkDeleting) return
    if (!confirm(t.bulkDeleteConfirm(selectedIds.size))) return
    setBulkDeleting(true)
    try {
      const ids = [...selectedIds]
      const { error } = await supabase.from('employees').delete().in('id', ids)
      if (error) { alert(error.message); return }
      if (org && isPro(org)) {
        syncSeats().catch(err => console.error('sync-seats failed after bulk delete:', err))
      }
      setSelectedIds(new Set())
      loadData()
    } finally {
      setBulkDeleting(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const departmentOptions = departments.map(d => ({ id: d, label: d, count: getDepartmentCount(d) }))

  const jobPositions = [...new Set(employees.map(e => e.job_position).filter((v): v is string => !!v))].sort()
  const jobLevels = [...new Set(employees.map(e => e.job_level).filter((v): v is string => !!v))].sort()
  const employeeClasses = [...new Set(employees.map(e => e.class).filter((v): v is string => !!v))].sort()
  const countBy = (field: 'job_position' | 'job_level' | 'class', value: string) =>
    employees.filter(e => e[field] === value).length

  const goManageStructure = () => navigate('/dashboard/company?tab=structure')

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
      headerAction: { label: t.hiringFieldManage, onClick: goManageStructure },
    }] : []),
    ...(jobPositions.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'job_position',
      label: t.empFieldJobPosition,
      value: [...activeJobPositions],
      options: jobPositions.map(p => ({ id: p, label: p, count: countBy('job_position', p) })),
      onChange: (next: string[]) => setActiveJobPositions(new Set(next)),
      headerAction: { label: t.hiringFieldManage, onClick: goManageStructure },
    }] : []),
    ...(jobLevels.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'job_level',
      label: t.empFieldJobLevel,
      value: [...activeJobLevels],
      options: jobLevels.map(l => ({ id: l, label: l, count: countBy('job_level', l) })),
      onChange: (next: string[]) => setActiveJobLevels(new Set(next)),
      headerAction: { label: t.hiringFieldManage, onClick: goManageStructure },
    }] : []),
    ...(employeeClasses.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'class',
      label: t.empFieldClass,
      value: [...activeClasses],
      options: employeeClasses.map(c => ({ id: c, label: c, count: countBy('class', c) })),
      onChange: (next: string[]) => setActiveClasses(new Set(next)),
      headerAction: { label: t.hiringFieldManage, onClick: goManageStructure },
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

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await buildExportFile({
        orgName: org?.name ?? 'employees',
        employees: visibleFiltered,
        t,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(org?.name ?? 'employees').replace(/[^\w-]+/g, '-')}-employees.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || employees.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
            title={t.exportEmployees}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{t.exportEmployees}</span>
          </button>
          <AddEmployeeMenu
            t={t}
            disabled={!canWrite}
            disabledTitle={!canWrite ? t.dunningWriteBlocked : undefined}
            onAdd={handleAddClick}
            onImport={() => setShowImport(true)}
          />
        </div>
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
            setActiveJobPositions(new Set())
            setActiveJobLevels(new Set())
            setActiveClasses(new Set())
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
            options={COLUMN_ORDER.map(key => ({ id: key, label: LIST_COLUMN_DEFS[key].label(t) }))}
            searchPlaceholder={t.searchEmployeesPlaceholder}
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

      {selectedIds.size > 0 && view === 'list' && (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
          style={{
            borderColor: 'var(--color-primary)',
            backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
          }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {t.bulkSelectedCount(selectedIds.size)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg border px-3 py-1 text-xs font-medium transition-colors"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
            >
              {t.bulkClear}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={!canWrite || bulkDeleting}
              className="rounded-lg px-3 py-1 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-danger)' }}
            >
              {t.bulkDelete}
            </button>
          </div>
        </div>
      )}

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
                  className="overflow-x-auto rounded-xl border"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                >
                  <div className="min-w-max">
                    <ListHeader
                      t={t}
                      sortField={sortField}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                      visibleColumns={visibleColumns}
                      nameColumnPx={nameColumnPx}
                      pageEmployees={paginatedEmployees}
                      selectedIds={selectedIds}
                      onToggleAll={toggleAllOnPage}
                    />
                    {paginatedEmployees.map((emp, idx) => (
                      <EmployeeRow
                        key={emp.id}
                        emp={emp}
                        t={t}
                        statusLabels={statusLabels}
                        isLast={idx === paginatedEmployees.length - 1}
                        visibleColumns={visibleColumns}
                        nameColumnPx={nameColumnPx}
                        selected={selectedIds.has(emp.id)}
                        onToggleSelected={() => toggleRowSelected(emp.id)}
                        onDuplicate={() => handleDuplicate(emp)}
                        onDelete={() => handleDelete(emp)}
                        onEdit={() => navigate(`/dashboard/employees/${emp.id}/edit`)}
                      />
                    ))}
                  </div>
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

      {showImport && org && (
        <ImportEmployeesModal
          user={user}
          org={org}
          currentEmployees={employees}
          t={t}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadData() }}
        />
      )}
    </div>
  )
}

function AddEmployeeMenu({ t, disabled, disabledTitle, onAdd, onImport }: {
  t: Translations
  disabled: boolean
  disabledTitle?: string
  onAdd: () => void
  onImport: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        title={disabledTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <span>{t.addEmployee}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[200px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onAdd() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {t.addEmployeeMenuAdd}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onImport() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {t.addEmployeeMenuImport}
          </button>
        </div>
      )}
    </div>
  )
}

function CopyableText({ value }: { value: string }) {
  const { t } = useLang()

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
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`${value} — ${t.copy}`}
      className="block min-w-0 flex-1 truncate rounded text-left text-xs transition-colors hover:underline"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {value}
    </button>
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
  emp: EmployeeWithDepartments
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

function DerivedStatusBadge({ status, label }: { status: DerivedStatus; label: string }) {
  const tone: Record<DerivedStatus, { bg: string; fg: string }> = {
    prospective: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 14%, transparent)',  fg: 'var(--color-text-secondary)' },
    offered:     { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',         fg: 'var(--color-primary)' },
    onboarding:  { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',         fg: 'var(--color-primary)' },
    probation:   { bg: 'color-mix(in srgb, var(--color-warning, #d97706) 14%, transparent)', fg: 'var(--color-warning, #d97706)' },
    active:      { bg: 'color-mix(in srgb, var(--color-success, #16a34a) 14%, transparent)', fg: 'var(--color-success, #16a34a)' },
    separated:   { bg: 'color-mix(in srgb, var(--color-danger, #dc2626) 14%, transparent)',  fg: 'var(--color-danger, #dc2626)' },
    talent_pool: { bg: 'var(--color-bg-tertiary)',                                            fg: 'var(--color-text-tertiary)' },
  }
  const c = tone[status]
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  )
}

function derivedStatusLabel(status: DerivedStatus, t: Translations): string {
  switch (status) {
    case 'prospective': return t.derivedStatusProspective
    case 'offered': return t.derivedStatusOffered
    case 'onboarding': return t.derivedStatusOnboarding
    case 'probation': return t.derivedStatusProbation
    case 'active': return t.derivedStatusActive
    case 'separated': return t.derivedStatusSeparated
    case 'talent_pool': return t.derivedStatusTalentPool
  }
}

function EmployeeRow({ emp, t, statusLabels, isLast, visibleColumns, nameColumnPx, selected, onToggleSelected, onDuplicate, onDelete, onEdit }: {
  emp: EmployeeWithDepartments
  t: Translations
  statusLabels: Record<EmployeeStatus, string>
  isLast: boolean
  visibleColumns: Set<ColumnKey>
  nameColumnPx: number
  selected: boolean
  onToggleSelected: () => void
  onDuplicate: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  // The actions menu renders via portal to <body> with fixed positioning.
  // Reason: the row sits inside an `overflow-x-auto` ancestor, which the CSS
  // spec auto-promotes to `overflow-y: auto` too — meaning a normally-positioned
  // dropdown gets clipped at the bottom of the row. Portal + getBoundingClientRect
  // sidesteps that entirely.
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setMenuOpen(true)
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    function handleClose() { setMenuOpen(false) }
    document.addEventListener('mousedown', handleClick)
    // The button moves when any scrolling ancestor scrolls (page, table). Close
    // the menu rather than try to track — simpler and the fixed pos goes stale fast.
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [menuOpen])

  const visibleDefs = COLUMN_ORDER
    .filter(k => visibleColumns.has(k))
    .map(k => LIST_COLUMN_DEFS[k])

  return (
    <div
      onClick={onEdit}
      className="group flex cursor-pointer items-center py-2.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}
    >
      {/* Sticky checkbox */}
      <div
        onClick={e => e.stopPropagation()}
        className="sticky left-0 z-20 flex shrink-0 items-center justify-center group-hover:bg-[var(--color-bg-tertiary)]"
        style={{ width: `${CHECKBOX_COL_PX}px`, backgroundColor: 'var(--color-bg)' }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={t.bulkSelectRowAriaLabel(emp.name)}
          className="h-4 w-4 cursor-pointer"
          style={{ accentColor: 'var(--color-primary)' }}
        />
      </div>

      {/* Sticky avatar + name */}
      <div
        className="sticky z-20 flex shrink-0 items-center gap-3 pr-3 group-hover:bg-[var(--color-bg-tertiary)]"
        style={{ left: `${CHECKBOX_COL_PX}px`, width: `${nameColumnPx}px`, backgroundColor: 'var(--color-bg)' }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ background: emp.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(emp.id) }}
        >
          {emp.photo_url && <img src={emp.photo_url} alt={emp.name} className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {emp.name}
        </div>
      </div>

      {/* Scrolling middle columns */}
      {visibleDefs.map(col => (
        <div
          key={col.key}
          className={`${col.width} shrink-0 truncate px-3 text-xs ${col.alignRight ? 'text-right' : ''}`}
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {col.render({ emp, t, statusLabels })}
        </div>
      ))}

      {/* Sticky right: actions */}
      <div
        onClick={e => e.stopPropagation()}
        className={STICKY_RIGHT_CELL_BODY}
        style={{ backgroundColor: 'var(--color-bg)' }}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => menuOpen ? setMenuOpen(false) : openMenu()}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium transition-colors"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-primary)',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <span>{t.actionsLabel}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && menuPos && createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border py-1 shadow-lg"
            style={{
              top: `${menuPos.top}px`,
              right: `${menuPos.right}px`,
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-elevated, var(--color-bg))',
            }}
          >
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onEdit() }}
              className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: 'var(--color-text)' }}
            >
              {t.empViewInfo}
            </button>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onDuplicate() }}
              className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: 'var(--color-text)' }}
            >
              {t.duplicate}
            </button>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onDelete() }}
              className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ color: 'var(--color-danger)' }}
            >
              {t.delete}
            </button>
          </div>,
          document.body,
        )}
      </div>
    </div>
  )
}

// Sticky cell className for the right-anchored Actions column. The
// `group-hover:` background matches the row's hover background so it doesn't
// visibly fall out of the row during horizontal scroll.
const STICKY_RIGHT_CELL_BODY =
  'sticky right-0 z-20 ml-auto flex w-28 shrink-0 items-center justify-end px-4 group-hover:bg-[var(--color-bg-tertiary)]'

const CHECKBOX_COL_PX = 44

function ListHeader({ t, sortField, sortDir, onToggle, visibleColumns, nameColumnPx, pageEmployees, selectedIds, onToggleAll }: {
  t: Translations
  sortField: SortField
  sortDir: SortDir
  onToggle: (field: SortField) => void
  visibleColumns: Set<ColumnKey>
  nameColumnPx: number
  pageEmployees: EmployeeWithDepartments[]
  selectedIds: Set<string>
  onToggleAll: () => void
}) {
  const visibleDefs = COLUMN_ORDER
    .filter(k => visibleColumns.has(k))
    .map(k => LIST_COLUMN_DEFS[k])

  const headerCheckRef = useRef<HTMLInputElement>(null)
  const allSelected = pageEmployees.length > 0 && pageEmployees.every(e => selectedIds.has(e.id))
  const someSelected = pageEmployees.some(e => selectedIds.has(e.id))
  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = !allSelected && someSelected
  }, [allSelected, someSelected])

  return (
    <div
      className="flex items-center py-2 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {/* Sticky checkbox cell */}
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center justify-center"
        style={{ width: `${CHECKBOX_COL_PX}px`, backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        <input
          ref={headerCheckRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          aria-label={t.bulkSelectAllAriaLabel}
          className="h-4 w-4 cursor-pointer"
          style={{ accentColor: 'var(--color-primary)' }}
        />
      </div>

      {/* Sticky avatar spacer + Name sort header */}
      <div
        className="sticky z-20 flex shrink-0 items-center gap-3 pr-3"
        style={{ left: `${CHECKBOX_COL_PX}px`, width: `${nameColumnPx}px`, backgroundColor: 'var(--color-bg-tertiary)' }}
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
      </div>

      {/* Scrolling columns */}
      {visibleDefs.map(col => col.sortField ? (
        <SortableHeader
          key={col.key}
          label={col.label(t)}
          field={col.sortField}
          currentField={sortField}
          currentDir={sortDir}
          onClick={() => onToggle(col.sortField!)}
          align={col.alignRight ? 'right' : 'left'}
          className={`${col.width} shrink-0 px-3`}
        />
      ) : (
        <div
          key={col.key}
          className={`${col.width} shrink-0 truncate px-3 ${col.alignRight ? 'text-right' : ''}`}
        >
          {col.label(t)}
        </div>
      ))}

      {/* Sticky right: spacer matching the Actions column width */}
      <div
        className="sticky right-0 z-20 ml-auto w-28 shrink-0 px-4"
        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
        aria-hidden="true"
      />
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
      className={`flex items-center gap-1 truncate uppercase tracking-wider transition-colors hover:text-[var(--color-text)] ${align === 'right' ? 'justify-end' : ''} ${className}`}
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
