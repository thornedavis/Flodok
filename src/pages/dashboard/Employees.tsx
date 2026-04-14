import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164, formatPhone } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { PhoneInput } from '../../components/PhoneInput'
import { DepartmentSelect } from '../../components/DepartmentSelect'
import { EmployeeEditModal } from './EmployeeEdit'
import type { User, Employee, Organization } from '../../types/database'

export function Employees({ user }: { user: User }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [empPageSize, setEmpPageSize] = useState(12)
  const [empCurrentPage, setEmpCurrentPage] = useState(1)


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

  async function handleRenameDepartment(oldName: string) {
    const newName = prompt(`Rename department "${oldName}" to:`, oldName)
    if (!newName || newName.trim() === oldName) return
    const trimmed = newName.trim()

    // Check for duplicate (case-insensitive)
    const existing = departments.find(d => d.toLowerCase() === trimmed.toLowerCase() && d !== oldName)
    if (existing) {
      if (!confirm(`Department "${existing}" already exists. Merge "${oldName}" into "${existing}"?`)) return
      // Merge into existing name
      await supabase.from('employees').update({ department: existing }).eq('org_id', user.org_id).eq('department', oldName)
    } else {
      await supabase.from('employees').update({ department: trimmed }).eq('org_id', user.org_id).eq('department', oldName)
    }
    loadData()
  }

  async function handleDeleteDepartment(dept: string) {
    const count = getDepartmentCount(dept)
    if (!confirm(`Remove department "${dept}"? This will clear the department field from ${count} employee${count === 1 ? '' : 's'}.`)) return
    await supabase.from('employees').update({ department: null }).eq('org_id', user.org_id).eq('department', dept)
    setActiveDepartments(prev => {
      const next = new Set(prev)
      next.delete(dept)
      return next
    })
    loadData()
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

  const empTotalPages = Math.max(1, Math.ceil(filtered.length / empPageSize))
  const paginatedEmployees = filtered.slice((empCurrentPage - 1) * empPageSize, empCurrentPage * empPageSize)

  // Reset page when filters change
  useEffect(() => { setEmpCurrentPage(1) }, [searchQuery, activeDepartments, empPageSize])

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  return (
    <div>
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
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {paginatedEmployees.map(emp => (
                  <EmployeeCard
                    key={emp.id}
                    emp={emp}
                    onDuplicate={() => handleDuplicate(emp)}
                    onDelete={() => handleDelete(emp)}
                    onEdit={() => setEditingId(emp.id)}
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
                    Previous
                  </button>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Page {empCurrentPage} of {empTotalPages}
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
                    Next
                  </button>
                  <select
                    value={empPageSize}
                    onChange={e => setEmpPageSize(Number(e.target.value))}
                    className="rounded-lg border px-2 py-1.5 text-xs"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                  >
                    <option value={12}>12 per page</option>
                    <option value={24}>24 per page</option>
                    <option value={48}>48 per page</option>
                  </select>
                </div>
              )}
            </>
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
                Filter by team. Right-click to manage.
              </p>
              <div className="space-y-1">
                {departments.map(dept => {
                  const isActive = activeDepartments.has(dept)
                  return (
                    <div key={dept} className="group flex items-center">
                      <button
                        onClick={() => toggleDepartment(dept)}
                        className="flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
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
                      {/* Manage buttons */}
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleRenameDepartment(dept)}
                          className="rounded p-1 transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseOver={e => { e.currentTarget.style.color = 'var(--color-text)' }}
                          onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                          title="Rename department"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteDepartment(dept)}
                          className="rounded p-1 transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseOver={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
                          onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                          title="Remove department"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
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

      {editingId && (
        <EmployeeEditModal
          user={user}
          employeeId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); loadData() }}
        />
      )}

      {showAdd && (
        <AddEmployeeForm
          orgId={user.org_id}
          countryCode={org?.default_country_code || '+62'}
          departments={departments}
          onDone={() => { setShowAdd(false); loadData() }}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
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
      title={copied ? 'Copied!' : 'Copy'}
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

function EmployeeCard({ emp, onDuplicate, onDelete, onEdit }: {
  emp: Employee
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
        <div className="min-w-0 flex-1">
          {emp.department && (
            <span
              className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {emp.department}
            </span>
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
              {`${window.location.origin}/sop/${emp.slug}-${emp.access_token}`}
            </span>
            <CopyButton value={`${window.location.origin}/sop/${emp.slug}-${emp.access_token}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function AddEmployeeForm({ orgId, countryCode, departments, onDone, onCancel }: {
  orgId: string
  countryCode: string
  departments: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [notes, setNotes] = useState('')
  const [ktpNik, setKtpNik] = useState('')
  const [address, setAddress] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError('Image must be under 2 MB.')
      return
    }

    setError('')
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function handleRemoveAvatar() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isValidE164(phone)) {
      setError('Invalid phone number format')
      return
    }

    setSaving(true)
    const slug = generateSlug(name)
    const token = generateAccessToken()

    const { data: emp, error: empError } = await supabase
      .from('employees')
      .insert({ org_id: orgId, name, phone, email: email || null, department: department || null, notes: notes || null, ktp_nik: ktpNik || null, address: address || null, slug, access_token: token })
      .select()
      .single()

    if (empError) { setError(empError.message); setSaving(false); return }

    // Upload avatar if selected
    if (avatarFile && emp) {
      const ext = avatarFile.name.split('.').pop()
      const path = `${emp.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true })

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        const url = `${publicUrl}?t=${Date.now()}`
        await supabase.from('employees').update({ photo_url: url }).eq('id', emp.id)
      }
    }

    await supabase.from('sops').insert({
      org_id: orgId,
      employee_id: emp.id,
      title: `${name}'s SOP`,
      content_markdown: '',
      status: 'draft',
    })

    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setSaving(false)
    onDone()
  }

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-5 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>New Employee</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          {/* Avatar */}
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Photo</label>
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{ background: avatarPreview ? 'var(--color-bg-tertiary)' : getAvatarGradient(name || 'new') }}
              >
                {avatarPreview && (
                  <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <label
                  className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {avatarPreview ? 'Change' : 'Upload'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarSelect}
                    className="hidden"
                  />
                </label>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="text-xs"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Phone (WhatsApp) *</label>
            <div className="relative">
              <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={countryCode} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Department</label>
            <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email (optional)</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>KTP/NIK Number (optional)</label>
            <input type="text" value={ktpNik} onChange={e => setKtpNik(e.target.value)} placeholder="e.g. 5171234567890001" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Address (optional)</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Employee's residential address..." rows={2} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Notes (internal only)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this employee..."
              rows={3}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {saving ? 'Adding...' : 'Add employee'}
            </button>
            <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
