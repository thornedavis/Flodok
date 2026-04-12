import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164, formatPhone } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import type { User, Employee, Organization } from '../../types/database'

export function Employees({ user }: { user: User }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

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
    const newName = prompt('Name for the new employee (SOP will be copied):', `${emp.name} (Copy)`)
    if (!newName) return
    const newPhone = prompt('Phone number for the new employee:')
    if (!newPhone) return

    const phone = normalizePhone(newPhone, org?.default_country_code)
    if (!isValidE164(phone)) {
      alert('Invalid phone number format')
      return
    }

    const slug = generateSlug(newName)
    const token = generateAccessToken()

    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({ org_id: user.org_id, name: newName, phone, department: emp.department, slug, access_token: token })
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

    loadData()
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Delete ${emp.name}? This will also delete their SOP.`)) return
    await supabase.from('employees').delete().eq('id', emp.id)
    loadData()
  }

  // Derive departments
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean) as string[])].sort()

  function getDepartmentCount(dept: string) {
    return employees.filter(e => e.department === dept).length
  }

  function toggleDepartment(dept: string) {
    setActiveDepartments(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  // Filter
  const filtered = employees.filter(e => {
    const matchesDept = activeDepartments.size === 0 || activeDepartments.has(e.department || '')
    const matchesSearch = !searchQuery.trim() ||
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.phone.includes(searchQuery) ||
      e.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.email?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesDept && matchesSearch
  })

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  return (
    <div>
      {showAdd && (
        <AddEmployeeForm
          orgId={user.org_id}
          countryCode={org?.default_country_code || '+62'}
          onDone={() => { setShowAdd(false); loadData() }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>
        {/* Main content — employee cards */}
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Employees</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {filtered.length} {filtered.length === 1 ? 'employee' : 'employees'}
              </span>
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Add employee
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {employees.length === 0
                ? 'No employees yet. Add your first employee to get started.'
                : 'No employees match your filters.'}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(emp => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  onDuplicate={() => handleDuplicate(emp)}
                  onDelete={() => handleDelete(emp)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar — filters */}
        <aside className="sticky top-20 space-y-6 lg:border-l lg:pl-6" style={{ borderColor: 'var(--color-border)' }}>
          {/* Search */}
          <div>
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search employees..."
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--color-border-strong)]"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          </div>

          {/* Departments */}
          {departments.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                Departments
              </h3>
              <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Filter by team.
              </p>
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
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {getDepartmentCount(dept)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
              Summary
            </h3>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Total employees</span>
                <span style={{ color: 'var(--color-text)' }}>{employees.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Departments</span>
                <span style={{ color: 'var(--color-text)' }}>{departments.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <span>No department</span>
                <span style={{ color: 'var(--color-text)' }}>{employees.filter(e => !e.department).length}</span>
              </div>
            </div>
          </div>

          {/* Clear filters */}
          {(activeDepartments.size > 0 || searchQuery) && (
            <button
              onClick={() => {
                setActiveDepartments(new Set())
                setSearchQuery('')
              }}
              className="text-xs font-medium"
              style={{ color: 'var(--color-primary)' }}
            >
              Clear all filters
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}

function EmployeeCard({ emp, onDuplicate, onDelete }: {
  emp: Employee
  onDuplicate: () => void
  onDelete: () => void
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
    <Link
      to={`/dashboard/employees/${emp.id}`}
      className="group relative rounded-xl border p-5 transition-all"
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
              Duplicate
            </button>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete() }}
              className="flex w-full items-center px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--color-danger)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              Delete
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
        <div className="min-w-0">
          {emp.department && (
            <span
              className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                color: 'var(--color-primary)',
              }}
            >
              {emp.department}
            </span>
          )}
          <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
            {emp.name}
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {formatPhone(emp.phone)}
            {emp.email && <span> &middot; {emp.email}</span>}
          </p>
        </div>
      </div>
    </Link>
  )
}

function AddEmployeeForm({ orgId, countryCode, onDone, onCancel }: {
  orgId: string
  countryCode: string
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const normalized = normalizePhone(phone, countryCode)
    if (!isValidE164(normalized)) {
      setError('Invalid phone number format')
      return
    }

    setSaving(true)
    const slug = generateSlug(name)
    const token = generateAccessToken()

    const { data: emp, error: empError } = await supabase
      .from('employees')
      .insert({ org_id: orgId, name, phone: normalized, email: email || null, department: department || null, slug, access_token: token })
      .select()
      .single()

    if (empError) { setError(empError.message); setSaving(false); return }

    await supabase.from('sops').insert({
      org_id: orgId,
      employee_id: emp.id,
      title: `${name}'s SOP`,
      content_markdown: '',
      status: 'draft',
    })

    setSaving(false)
    onDone()
  }

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-xl border p-5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>New Employee</h3>

      {error && (
        <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Phone (WhatsApp) *</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="081234567890" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Department</label>
          <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Purchasing" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email (optional)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
          {saving ? 'Adding...' : 'Add employee'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}
