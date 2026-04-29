import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts, primaryDept, deptsJoined } from '../../lib/employee'
import { formatIdrDigits as formatCurrency } from '../../lib/credits'
import { InfoTooltip } from '../../components/InfoTooltip'
import { FilterPill, MultiSelectDropdown, FilterSearchInput } from '../../components/FilterControls'
import { ManageDepartmentsModal } from '../../components/ManageDepartmentsModal'
import type { User, Contract, Employee, Tag } from '../../types/aliases'

type ContractWithEmployee = Contract & { employee: Employee | null; tagIds: string[] }

export function Contracts({ user }: { user: User }) {
  const navigate = useNavigate()
  const { t } = useLang()
  const [contracts, setContracts] = useState<ContractWithEmployee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set())
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  async function reload() {
    const [contractResult, empResult] = await Promise.all([
      supabase.from('contracts').select('*').eq('org_id', user.org_id).order('updated_at', { ascending: false }),
      supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
    ])
    const empMap = new Map((empResult.data || []).map(e => [e.id, e]))
    setEmployees(empResult.data || [])
    setContracts(prev => (contractResult.data || []).map(c => ({
      ...c,
      employee: c.employee_id ? empMap.get(c.employee_id) || null : null,
      tagIds: prev.find(p => p.id === c.id)?.tagIds || [],
    })))
  }

  useEffect(() => {
    async function load() {
      const [contractResult, empResult, tagsResult, contractTagsResult] = await Promise.all([
        supabase.from('contracts').select('*').eq('org_id', user.org_id).order('updated_at', { ascending: false }),
        supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('contract_tags').select('*'),
      ])

      const empMap = new Map((empResult.data || []).map(e => [e.id, e]))

      const tagMap = new Map<string, string[]>()
      for (const ct of contractTagsResult.data || []) {
        const arr = tagMap.get(ct.contract_id) || []
        arr.push(ct.tag_id)
        tagMap.set(ct.contract_id, arr)
      }

      setEmployees(empResult.data || [])
      setContracts((contractResult.data || []).map(c => ({
        ...c,
        employee: c.employee_id ? empMap.get(c.employee_id) || null : null,
        tagIds: tagMap.get(c.id) || [],
      })))
      setAllTags(tagsResult.data || [])
      setLoading(false)
    }
    load()
  }, [user.org_id])

  const departments = [...new Set(contracts.flatMap(c => c.employee ? getEmployeeDepts(c.employee) : []))].sort()

  function getDepartmentCount(dept: string) {
    return contracts.filter(c => c.employee && getEmployeeDepts(c.employee).includes(dept)).length
  }

  function getStatusCount(status: string) {
    return contracts.filter(c => c.status === status).length
  }

  function toggleStatus(status: string) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  function getTagCount(tagId: string) {
    return contracts.filter(c => c.tagIds.includes(tagId)).length
  }

  const tagNameMap = new Map(allTags.map(t => [t.id, t]))

  const filtered = contracts.filter(c => {
    const empDepts = c.employee ? getEmployeeDepts(c.employee) : []
    const matchesDept = activeDepartments.size === 0 || empDepts.some(d => activeDepartments.has(d))
    const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(c.status)
    const matchesTags = activeTags.size === 0 || c.tagIds.some(tid => activeTags.has(tid))
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch = !q ||
      c.title.toLowerCase().includes(q) ||
      c.employee?.name.toLowerCase().includes(q) ||
      empDepts.some(d => d.toLowerCase().includes(q))
    return matchesDept && matchesStatus && matchesTags && matchesSearch
  })

  async function handleDuplicate(contract: ContractWithEmployee) {
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        org_id: user.org_id,
        employee_id: contract.employee_id,
        title: t.copyOfName(contract.title),
        content_markdown: contract.content_markdown,
        content_markdown_id: contract.content_markdown_id,
        status: 'draft' as const,
      })
      .select()
      .single()

    if (error) { alert(error.message); return }
    if (data) navigate(`/dashboard/contracts/${data.id}/edit`)
  }

  async function handleDelete(contract: ContractWithEmployee) {
    if (!confirm(t.deleteContractConfirm(contract.title))) return
    const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
    if (error) { alert(error.message); return }
    setContracts(prev => prev.filter(c => c.id !== contract.id))
    setMenuOpenId(null)
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  const statusLabels: Record<string, string> = {
    active: t.statusActive,
    draft: t.statusDraft,
    archived: t.statusArchived,
  }

  const departmentOptions = departments.map(d => ({ id: d, label: d, count: getDepartmentCount(d) }))
  const tagOptions = allTags.map(tg => ({ id: tg.id, label: tg.name, count: getTagCount(tg.id) }))
  const hasActiveFilters = activeDepartments.size + activeStatuses.size + activeTags.size > 0 || searchQuery.length > 0

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.contractsTitle}</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.createContract}
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterPill
          active={activeStatuses.size === 0}
          onClick={() => setActiveStatuses(new Set())}
          count={contracts.length}
        >
          {t.filterAll}
        </FilterPill>
        {(['active', 'draft', 'archived'] as const).map(status => (
          <FilterPill
            key={status}
            active={activeStatuses.has(status)}
            onClick={() => toggleStatus(status)}
            count={getStatusCount(status)}
          >
            {statusLabels[status]}
          </FilterPill>
        ))}
        {departments.length > 0 && (
          <MultiSelectDropdown
            label={t.departments}
            value={[...activeDepartments]}
            onChange={next => setActiveDepartments(new Set(next))}
            options={departmentOptions}
            footerAction={{ label: t.manageDepartments, onClick: () => setManageOpen(true) }}
          />
        )}
        {allTags.length > 0 && (
          <MultiSelectDropdown
            label={t.tagsLabel}
            value={[...activeTags]}
            onChange={next => setActiveTags(new Set(next))}
            options={tagOptions}
          />
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setActiveDepartments(new Set())
              setActiveStatuses(new Set())
              setActiveTags(new Set())
              setSearchQuery('')
            }}
            className="text-xs font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            {t.clearAllFilters}
          </button>
        )}
        <div className="ml-auto w-full sm:w-64">
          <FilterSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t.searchContractsPlaceholder}
          />
        </div>
      </div>

      <div>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {contracts.length === 0
              ? t.noContractsYet
              : t.noContractsMatchFilters}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(contract => (
              <div
                key={contract.id}
                className="group relative cursor-pointer rounded-xl border p-5 transition-all"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                onClick={() => navigate(`/dashboard/contracts/${contract.id}/edit`)}
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
                <div className="absolute right-3 top-3">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === contract.id ? null : contract.id) }}
                    className="rounded-md p-1 opacity-0 transition-all group-hover:opacity-100"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {menuOpenId === contract.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpenId(null) }} />
                      <div
                        className="absolute right-0 z-20 mt-1 w-36 rounded-lg border py-1 shadow-lg"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); handleDuplicate(contract) }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                          style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          {t.duplicate}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(contract) }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                          style={{ color: 'var(--color-danger)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                          {t.delete}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {contract.employee && getEmployeeDepts(contract.employee).length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {getEmployeeDepts(contract.employee).map(d => (
                      <span
                        key={d}
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}

                <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
                  {contract.title}
                </h3>

                {contract.employee && (
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {contract.employee.name}
                  </p>
                )}

                {contract.tagIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {contract.tagIds.map(tid => {
                      const tag = tagNameMap.get(tid)
                      if (!tag) return null
                      return (
                        <span
                          key={tid}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                        >
                          {tag.name}
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span className="inline-flex items-center gap-1" style={{ color: statusColors[contract.status] }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[contract.status] }} />
                    {statusLabels[contract.status] || contract.status}
                  </span>
                  <span>&middot;</span>
                  <span>v{contract.current_version}</span>
                  <span>&middot;</span>
                  <span>{new Date(contract.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateContractModal
          orgId={user.org_id}
          employees={employees}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => navigate(`/dashboard/contracts/${id}/edit`)}
        />
      )}

      <ManageDepartmentsModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        departments={departments}
        employees={employees}
        onChanged={() => { setActiveDepartments(new Set()); reload() }}
      />
    </div>
  )
}

type ContractType = 'pkwt' | 'pkwtt'

function generateContractMarkdown(
  type: ContractType,
  fields: {
    employeeName: string
    employeeAddress: string
    ktpNumber: string
    position: string
    department: string
    workLocation: string
    startDate: string
    endDate: string
    probationMonths: string
    baseSalary: string
    allowance: string
    hoursPerDay: string
    daysPerWeek: string
    annualLeave: string
  },
) {
  // Fields backed by structured data become merge field tokens — they
  // re-resolve at view time, so updates to the employee record or contract
  // numerics flow through automatically. Creation-time-only inputs (start
  // date, work location, etc.) are baked into the markdown as text.
  const isPKWT = type === 'pkwt'
  const name = '{{employee_name}}'
  const address = '{{employee_address}}'
  const ktp = '{{employee_ktp_nik}}'
  const dept = '{{employee_departments}}'
  const orgName = '{{org_name}}'
  const orgAddress = '{{org_address}}'
  const salary = '{{base_wage_idr}}'
  const allowance = '{{allowance_idr}}'
  const hoursTok = '{{hours_per_day}}'
  const daysTok = '{{days_per_week}}'
  const position = fields.position || '[Position]'
  const location = fields.workLocation || '[Work Location]'
  const start = fields.startDate || '[Start Date]'
  const end = fields.endDate || '[End Date]'
  const hours = fields.hoursPerDay || '8'
  const days = fields.daysPerWeek || '6'
  const leave = fields.annualLeave || '12'

  let md = `# ${isPKWT ? 'PERJANJIAN KERJA WAKTU TERTENTU (PKWT)' : 'PERJANJIAN KERJA WAKTU TIDAK TERTENTU (PKWTT)'}

# EMPLOYMENT CONTRACT

This Employment Contract (the "Agreement") is entered into on this **${start}**,

**BETWEEN:**

**${orgName}**, a company organized and existing under the laws of the Republic of Indonesia, with its principal office located at ${orgAddress} (the "Employer");

**AND:**

**${name}**, holder of KTP No. **${ktp}**, residing at **${address}** (the "Employee").

The parties agree to the following terms and conditions:

---

## 1. POSITION AND DUTIES

1.1 **Title:** The Employee is hired for the position of **${position}** within the **${dept}**.

1.2 **Reporting:** The Employee shall report directly to their designated supervisor or such other person as the Employer may designate.

1.3 **Responsibilities:** The Employee agrees to perform the duties customary to this position, including but not limited to those outlined by the Employer.

1.4 **Work Location:** ${location}

---

## 2. CONTRACT DURATION

`

  if (isPKWT) {
    md += `2.1 This Agreement shall commence on **${start}** and shall terminate on **${end}**, unless terminated earlier in accordance with the terms of this Agreement.

2.2 This Agreement may be extended by mutual written consent of both parties, subject to the maximum duration permitted under applicable law (PP 35/2021).

2.3 Upon expiration, the Employee shall be entitled to compensation pay as stipulated under Government Regulation No. 35 of 2021.

`
  } else {
    const probation = fields.probationMonths || '3'
    md += `2.1 This Agreement shall commence on **${start}** and shall continue indefinitely until terminated by either party in accordance with the terms of this Agreement.

2.2 **Probation Period:** The Employee shall be subject to a probation period of **${probation} month(s)** from the commencement date. During probation, either party may terminate this Agreement with 7 days' written notice.

`
  }

  md += `---

## 3. COMPENSATION

3.1 **Base Salary:** The Employee shall receive a monthly base salary of **${salary}** (gross), payable on the last working day of each month.

3.2 **Allowances:** **${allowance}** per month, covering transport, meals, and other elastic components of compensation.

3.3 **THR (Tunjangan Hari Raya):** The Employee is entitled to a religious holiday bonus equivalent to one month's salary after 12 months of continuous service, or pro-rated for service less than 12 months.

3.4 **Tax:** Income tax (PPh 21) shall be calculated and withheld in accordance with applicable tax regulations.

---

## 4. WORKING HOURS

4.1 The Employee shall work **${hoursTok} hours per day**, **${daysTok} days per week**, totaling **${Number(hours) * Number(days)} hours per week**.

4.2 The specific work schedule shall be determined by the Employer and communicated to the Employee.

---

## 5. OVERTIME

5.1 Overtime work shall be compensated in accordance with Indonesian labor law:
- **First hour:** 1.5x the hourly wage
- **Subsequent hours:** 2x the hourly wage

5.2 Overtime must be authorized in advance by the Employee's supervisor.

---

## 6. LEAVE

6.1 **Annual Leave:** The Employee is entitled to **${leave} working days** of paid annual leave per year, after completing 12 months of continuous service.

6.2 **Sick Leave:** As per applicable law, with valid medical certificate.

6.3 **Maternity Leave:** 3 months (1.5 months before and 1.5 months after delivery) with full pay, as per Law No. 13/2003.

6.4 **Other Leave:** As stipulated under applicable Indonesian labor law.

---

## 7. SOCIAL SECURITY (BPJS)

7.1 The Employer shall register the Employee in **BPJS Kesehatan** (health insurance) and **BPJS Ketenagakerjaan** (employment social security) in accordance with applicable law.

7.2 Contributions shall be shared between the Employer and Employee as prescribed by regulation.

---

## 8. TERMINATION

8.1 Either party may terminate this Agreement in accordance with the provisions of Law No. 13/2003 on Manpower and its amendments under Law No. 11/2020 (Cipta Kerja).

8.2 The Employee shall be entitled to severance pay, service pay, and compensation rights as applicable under law.

8.3 Grounds for termination by the Employer include, but are not limited to: serious misconduct, repeated violation of company rules, or prolonged absence without notice.

---

## 9. CONFIDENTIALITY

9.1 The Employee shall maintain the confidentiality of all proprietary information, trade secrets, and business operations of the Employer during and after the term of employment.

---

## 10. GENERAL PROVISIONS

10.1 This Agreement is governed by the laws of the Republic of Indonesia.

10.2 Any disputes arising from this Agreement shall be resolved through deliberation (musyawarah) and, failing that, through the Industrial Relations Court.

10.3 This Agreement is made in duplicate, each copy having equal legal force, one for each party.

---

**EMPLOYER:**

Name: ____________________________

Title: ____________________________

Signature: ________________________

Date: ____________________________

&nbsp;

**EMPLOYEE:**

Name: **${name}**

Signature: ________________________

Date: ____________________________
`

  return md
}

function CreateContractModal({ orgId, employees, onClose, onCreated }: {
  orgId: string
  employees: Employee[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useLang()
  const contractTypeInfo: Record<ContractType, { label: string; description: string }> = {
    pkwt: { label: t.contractTypeFixedTerm, description: t.contractTypePkwtDesc },
    pkwtt: { label: t.contractTypePermanent, description: t.contractTypePkwttDesc },
  }
  const [title, setTitle] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [contractType, setContractType] = useState<ContractType>('pkwt')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Quick-fill fields
  const [ktpNumber, setKtpNumber] = useState('')
  const [employeeAddress, setEmployeeAddress] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [probationMonths, setProbationMonths] = useState('3')
  const [baseSalary, setBaseSalary] = useState('')
  const [allowance, setAllowance] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [daysPerWeek, setDaysPerWeek] = useState('6')
  const [annualLeave, setAnnualLeave] = useState('12')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const filteredEmployees = empSearch.trim()
    ? employees.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()) || getEmployeeDepts(e).some(d => d.toLowerCase().includes(empSearch.toLowerCase())))
    : employees

  const selectedEmployee = employees.find(e => e.id === employeeId)

  async function handleCreate() {
    if (!title.trim()) { setError(t.titleRequired); return }
    setError('')
    setCreating(true)

    const markdown = generateContractMarkdown(contractType, {
      employeeName: selectedEmployee?.name || '',
      employeeAddress,
      ktpNumber,
      position: selectedEmployee ? (primaryDept(selectedEmployee) ? `${primaryDept(selectedEmployee)} Staff` : '') : '',
      department: selectedEmployee ? deptsJoined(selectedEmployee) : '',
      workLocation,
      startDate,
      endDate,
      probationMonths,
      baseSalary,
      allowance,
      hoursPerDay,
      daysPerWeek,
      annualLeave,
    })

    const baseWageIdr = baseSalary ? Number(baseSalary) : null
    const allowanceIdr = allowance ? Number(allowance) : null
    const hoursPerDayInt = hoursPerDay ? Number(hoursPerDay) : null
    const daysPerWeekInt = daysPerWeek ? Number(daysPerWeek) : null

    const { data, error: insertError } = await supabase
      .from('contracts')
      .insert({
        org_id: orgId,
        employee_id: employeeId || null,
        title: title.trim(),
        content_markdown: markdown,
        status: 'draft' as const,
        base_wage_idr: baseWageIdr,
        allowance_idr: allowanceIdr,
        hours_per_day: hoursPerDayInt,
        days_per_week: daysPerWeekInt,
      })
      .select()
      .single()

    if (insertError) { setError(insertError.message); setCreating(false); return }
    onCreated(data.id)
  }

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors" style={{ color: 'var(--color-text-tertiary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-5 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.createContract}</h2>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{error}</div>
          )}

          {/* Contract Type Toggle */}
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contractTypeLabel}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pkwt', 'pkwtt'] as const).map(type => {
                const isSelected = contractType === type
                const info = contractTypeInfo[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setContractType(type)}
                    className="relative rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={{
                      borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                    }}
                  >
                    <span className="flex items-center">
                      {info.label}
                      <InfoTooltip text={info.description} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t.contractTitlePlaceholder} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} autoFocus />
          </div>

          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.employeeLabel} <span className="font-normal" style={{ color: 'var(--color-text-tertiary)' }}>{t.optional}</span>
            </label>
            {selectedEmployee ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{selectedEmployee.name}</span>
                  {primaryDept(selectedEmployee) && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{primaryDept(selectedEmployee)}</span>}
                </div>
                <button type="button" onClick={() => { setEmployeeId(''); setKtpNumber(''); setEmployeeAddress('') }} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.clear}</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder={t.searchEmployeesPlaceholder} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
                {empSearch.trim() && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-32 overflow-y-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                    {filteredEmployees.length === 0 ? (
                      <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noMatches}</p>
                    ) : (
                      filteredEmployees.map(emp => (
                        <button key={emp.id} type="button" onClick={() => { setEmployeeId(emp.id); setEmpSearch(''); if (emp.ktp_nik) setKtpNumber(emp.ktp_nik); if (emp.address) setEmployeeAddress(emp.address) }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <span>{emp.name}</span>
                          {primaryDept(emp) && <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{primaryDept(emp)}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick-fill fields */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="mb-3 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.contractDetails}
              <span className="ml-2 font-normal text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.allFieldsEditableLater}</span>
            </h3>

            <div className="space-y-3">
              {/* Employee details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.ktpNikNumberLabel}</label>
                  <input type="text" value={ktpNumber} onChange={e => setKtpNumber(e.target.value)} placeholder="3171..." className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.workLocationLabel}</label>
                  <input type="text" value={workLocation} onChange={e => setWorkLocation(e.target.value)} placeholder={t.workLocationPlaceholder} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.employeeAddressLabel}</label>
                <input type="text" value={employeeAddress} onChange={e => setEmployeeAddress(e.target.value)} placeholder={t.fullAddressPlaceholder} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.startDateLabel}</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
                {contractType === 'pkwt' ? (
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.endDateLabel}</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.probationMonthsLabel}</label>
                    <select value={probationMonths} onChange={e => setProbationMonths(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                      <option value="1">{t.monthOption(1)}</option>
                      <option value="2">{t.monthOption(2)}</option>
                      <option value="3">{t.monthOption(3)}</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Compensation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.baseWageLabel}
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>{t.perMonth}</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" inputMode="numeric" value={formatCurrency(baseSalary)} onChange={e => setBaseSalary(e.target.value.replace(/\D/g, ''))}
                      placeholder="5,000,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.allowanceLabel}
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>{t.perMonth}</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" inputMode="numeric" value={formatCurrency(allowance)} onChange={e => setAllowance(e.target.value.replace(/\D/g, ''))}
                      placeholder="1,000,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Working hours */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.hoursPerDayLabel}</label>
                  <select value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="7">{t.hoursOption(7)}</option>
                    <option value="8">{t.hoursOption(8)}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.daysPerWeekLabel}</label>
                  <select value={daysPerWeek} onChange={e => setDaysPerWeek(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="5">{t.daysOption(5)}</option>
                    <option value="6">{t.daysOption(6)}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.annualLeaveLabel}</label>
                  <select value={annualLeave} onChange={e => setAnnualLeave(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="12">{t.daysOption(12)}</option>
                    <option value="14">{t.daysOption(14)}</option>
                    <option value="15">{t.daysOption(15)}</option>
                    <option value="20">{t.daysOption(20)}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <button onClick={handleCreate} disabled={creating || !title.trim()} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {creating ? t.creating : t.createContract}
            </button>
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.cancel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
