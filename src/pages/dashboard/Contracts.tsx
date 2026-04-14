import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { User, Contract, Employee, Tag } from '../../types/database'

type ContractWithEmployee = Contract & { employee: Employee | null; tagIds: string[] }

export function Contracts({ user }: { user: User }) {
  const navigate = useNavigate()
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

  const departments = [...new Set(contracts.map(c => c.employee?.department).filter(Boolean) as string[])].sort()
  const statuses = ['active', 'draft', 'archived'] as const

  function getDepartmentCount(dept: string) {
    return contracts.filter(c => c.employee?.department === dept).length
  }

  function getStatusCount(status: string) {
    return contracts.filter(c => c.status === status).length
  }

  function toggleDepartment(dept: string) {
    setActiveDepartments(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept); else next.add(dept)
      return next
    })
  }

  function toggleStatus(status: string) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  function toggleTag(tagId: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId)
      return next
    })
  }

  function getTagCount(tagId: string) {
    return contracts.filter(c => c.tagIds.includes(tagId)).length
  }

  const tagNameMap = new Map(allTags.map(t => [t.id, t]))

  const filtered = contracts.filter(c => {
    const matchesDept = activeDepartments.size === 0 || activeDepartments.has(c.employee?.department || '')
    const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(c.status)
    const matchesTags = activeTags.size === 0 || c.tagIds.some(tid => activeTags.has(tid))
    const matchesSearch = !searchQuery.trim() ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.employee?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.employee?.department?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesDept && matchesStatus && matchesTags && matchesSearch
  })

  async function handleDuplicate(contract: ContractWithEmployee) {
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        org_id: user.org_id,
        employee_id: contract.employee_id,
        title: `${contract.title} (Copy)`,
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
    if (!confirm(`Delete "${contract.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
    if (error) { alert(error.message); return }
    setContracts(prev => prev.filter(c => c.id !== contract.id))
    setMenuOpenId(null)
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Contracts</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {filtered.length} {filtered.length === 1 ? 'Contract' : 'Contracts'}
            </span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Create Contract
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {contracts.length === 0
              ? 'No contracts yet. Click "Create Contract" to get started.'
              : 'No contracts match your filters.'}
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
                          Duplicate
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
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {contract.employee?.department && (
                  <span
                    className="mb-3 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                  >
                    {contract.employee.department}
                  </span>
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
                    {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
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

      {/* Sidebar */}
      <aside className="sticky top-20 space-y-6 lg:border-l lg:pl-6" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search contracts..."
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--color-border-strong)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>
        </div>

        {departments.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Departments</h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Filter by team.</p>
            <div className="space-y-1">
              {departments.map(dept => {
                const isActive = activeDepartments.has(dept)
                return (
                  <button
                    key={dept}
                    onClick={() => toggleDepartment(dept)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
                    style={{
                      backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                      borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                    onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span>{dept}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{getDepartmentCount(dept)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Status</h3>
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Filter by contract status.</p>
          <div className="space-y-1">
            {statuses.map(status => {
              const isActive = activeStatuses.has(status)
              const count = getStatusCount(status)
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm capitalize transition-all"
                  style={{
                    backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                    color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                    borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                  onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColors[status] }} />
                    {status}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {allTags.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Tags</h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Filter by tag.</p>
            <div className="space-y-1">
              {allTags.map(tag => {
                const isActive = activeTags.has(tag.id)
                const count = getTagCount(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
                    style={{
                      backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                      borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                    onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span>{tag.name}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {(activeDepartments.size > 0 || activeStatuses.size > 0 || activeTags.size > 0 || searchQuery) && (
          <button
            onClick={() => { setActiveDepartments(new Set()); setActiveStatuses(new Set()); setActiveTags(new Set()); setSearchQuery('') }}
            className="text-xs font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            Clear all filters
          </button>
        )}
      </aside>

      {showCreateModal && (
        <CreateContractModal
          orgId={user.org_id}
          employees={employees}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => navigate(`/dashboard/contracts/${id}/edit`)}
        />
      )}
    </div>
  )
}

type ContractType = 'pkwt' | 'pkwtt'

const CONTRACT_TYPE_INFO: Record<ContractType, { label: string; description: string }> = {
  pkwt: {
    label: 'Fixed Term (PKWT)',
    description: 'Perjanjian Kerja Waktu Tertentu — for contract/temporary employees. Has a defined start and end date, max 5 years including extensions. No probation period allowed.',
  },
  pkwtt: {
    label: 'Permanent (PKWTT)',
    description: 'Perjanjian Kerja Waktu Tidak Tertentu — for permanent employees. No end date. May include a probation period of up to 3 months.',
  },
}

function formatCurrency(val: string) {
  const num = val.replace(/\D/g, '')
  if (!num) return ''
  return Number(num).toLocaleString('id-ID')
}

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
    transportAllowance: string
    mealAllowance: string
    hoursPerDay: string
    daysPerWeek: string
    annualLeave: string
  },
) {
  const isPKWT = type === 'pkwt'
  const name = fields.employeeName || '[Employee Name]'
  const address = fields.employeeAddress || '[Employee Address]'
  const ktp = fields.ktpNumber || '[KTP Number]'
  const position = fields.position || '[Position]'
  const dept = fields.department || '[Department]'
  const location = fields.workLocation || '[Work Location]'
  const start = fields.startDate || '[Start Date]'
  const end = fields.endDate || '[End Date]'
  const salary = fields.baseSalary ? `Rp ${formatCurrency(fields.baseSalary)}` : '[Base Salary]'
  const transport = fields.transportAllowance ? `Rp ${formatCurrency(fields.transportAllowance)}` : '-'
  const meal = fields.mealAllowance ? `Rp ${formatCurrency(fields.mealAllowance)}` : '-'
  const hours = fields.hoursPerDay || '8'
  const days = fields.daysPerWeek || '6'
  const leave = fields.annualLeave || '12'

  let md = `# ${isPKWT ? 'PERJANJIAN KERJA WAKTU TERTENTU (PKWT)' : 'PERJANJIAN KERJA WAKTU TIDAK TERTENTU (PKWTT)'}

# EMPLOYMENT CONTRACT

This Employment Contract (the "Agreement") is entered into on this **${start}**,

**BETWEEN:**

**[Company Name]**, a company organized and existing under the laws of the Republic of Indonesia, with its principal office located at [Company Address] (the "Employer");

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

3.2 **Allowances:**
- Transport Allowance: **${transport}** per month
- Meal Allowance: **${meal}** per month

3.3 **THR (Tunjangan Hari Raya):** The Employee is entitled to a religious holiday bonus equivalent to one month's salary after 12 months of continuous service, or pro-rated for service less than 12 months.

3.4 **Tax:** Income tax (PPh 21) shall be calculated and withheld in accordance with applicable tax regulations.

---

## 4. WORKING HOURS

4.1 The Employee shall work **${hours} hours per day**, **${days} days per week**, totaling **${Number(hours) * Number(days)} hours per week**.

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

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const handleEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 })
    }
    setShow(true)
  }

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        i
      </button>
      {show && (
        <div
          className="fixed z-50 w-64 -translate-x-1/2 rounded-lg border p-3 text-xs shadow-lg"
          style={{ top: pos.top, left: pos.left, backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {text}
        </div>
      )}
    </span>
  )
}

function CreateContractModal({ orgId, employees, onClose, onCreated }: {
  orgId: string
  employees: Employee[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
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
  const [transportAllowance, setTransportAllowance] = useState('')
  const [mealAllowance, setMealAllowance] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [daysPerWeek, setDaysPerWeek] = useState('6')
  const [annualLeave, setAnnualLeave] = useState('12')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const filteredEmployees = empSearch.trim()
    ? employees.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()) || e.department?.toLowerCase().includes(empSearch.toLowerCase()))
    : employees

  const selectedEmployee = employees.find(e => e.id === employeeId)

  async function handleCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setError('')
    setCreating(true)

    const markdown = generateContractMarkdown(contractType, {
      employeeName: selectedEmployee?.name || '',
      employeeAddress,
      ktpNumber,
      position: selectedEmployee?.department ? `${selectedEmployee.department} Staff` : '',
      department: selectedEmployee?.department || '',
      workLocation,
      startDate,
      endDate,
      probationMonths,
      baseSalary,
      transportAllowance,
      mealAllowance,
      hoursPerDay,
      daysPerWeek,
      annualLeave,
    })

    const { data, error: insertError } = await supabase
      .from('contracts')
      .insert({ org_id: orgId, employee_id: employeeId || null, title: title.trim(), content_markdown: markdown, status: 'draft' as const })
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

        <h2 className="mb-5 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>Create Contract</h2>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{error}</div>
          )}

          {/* Contract Type Toggle */}
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Contract Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pkwt', 'pkwtt'] as const).map(type => {
                const isSelected = contractType === type
                const info = CONTRACT_TYPE_INFO[type]
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
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Employment Contract - Katut Ruti" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} autoFocus />
          </div>

          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Employee <span className="font-normal" style={{ color: 'var(--color-text-tertiary)' }}>(optional)</span>
            </label>
            {selectedEmployee ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{selectedEmployee.name}</span>
                  {selectedEmployee.department && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{selectedEmployee.department}</span>}
                </div>
                <button type="button" onClick={() => { setEmployeeId(''); setKtpNumber(''); setEmployeeAddress('') }} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Clear</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employees..." className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
                {empSearch.trim() && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-32 overflow-y-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                    {filteredEmployees.length === 0 ? (
                      <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No matches</p>
                    ) : (
                      filteredEmployees.map(emp => (
                        <button key={emp.id} type="button" onClick={() => { setEmployeeId(emp.id); setEmpSearch(''); if (emp.ktp_nik) setKtpNumber(emp.ktp_nik); if (emp.address) setEmployeeAddress(emp.address) }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <span>{emp.name}</span>
                          {emp.department && <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{emp.department}</span>}
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
              Contract Details
              <span className="ml-2 font-normal text-xs" style={{ color: 'var(--color-text-tertiary)' }}>All fields can be edited later</span>
            </h3>

            <div className="space-y-3">
              {/* Employee details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>KTP / NIK Number</label>
                  <input type="text" value={ktpNumber} onChange={e => setKtpNumber(e.target.value)} placeholder="3171..." className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Work Location</label>
                  <input type="text" value={workLocation} onChange={e => setWorkLocation(e.target.value)} placeholder="e.g. Jl. Raya Ubud" className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Employee Address</label>
                <input type="text" value={employeeAddress} onChange={e => setEmployeeAddress(e.target.value)} placeholder="Full address" className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
                {contractType === 'pkwt' ? (
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Probation (months)</label>
                    <select value={probationMonths} onChange={e => setProbationMonths(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                      <option value="1">1 month</option>
                      <option value="2">2 months</option>
                      <option value="3">3 months</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Compensation */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Base Salary
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>/mo</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" value={baseSalary ? formatCurrency(baseSalary) : ''} onChange={e => setBaseSalary(e.target.value.replace(/\D/g, ''))}
                      placeholder="5,000,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Transport
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>/mo</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" value={transportAllowance ? formatCurrency(transportAllowance) : ''} onChange={e => setTransportAllowance(e.target.value.replace(/\D/g, ''))}
                      placeholder="500,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Meal
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>/mo</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" value={mealAllowance ? formatCurrency(mealAllowance) : ''} onChange={e => setMealAllowance(e.target.value.replace(/\D/g, ''))}
                      placeholder="500,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Working hours */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Hours / day</label>
                  <select value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="7">7 hours</option>
                    <option value="8">8 hours</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Days / week</label>
                  <select value={daysPerWeek} onChange={e => setDaysPerWeek(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="5">5 days</option>
                    <option value="6">6 days</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Annual leave</label>
                  <select value={annualLeave} onChange={e => setAnnualLeave(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="12">12 days</option>
                    <option value="14">14 days</option>
                    <option value="15">15 days</option>
                    <option value="20">20 days</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <button onClick={handleCreate} disabled={creating || !title.trim()} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {creating ? 'Creating...' : 'Create Contract'}
            </button>
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
