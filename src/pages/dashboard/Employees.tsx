import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164, formatPhone } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import type { User, Employee, Organization } from '../../types/database'

export function Employees({ user }: { user: User }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
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
      .insert({ org_id: user.org_id, name: newName, phone, slug, access_token: token })
      .select()
      .single()

    if (error) { alert(error.message); return }

    // Copy SOP content
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

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Employees</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Add employee
        </button>
      </div>

      {showAdd && (
        <AddEmployeeForm
          orgId={user.org_id}
          countryCode={org?.default_country_code || '+62'}
          onDone={() => { setShowAdd(false); loadData() }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {employees.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          No employees yet. Add your first employee to get started.
        </p>
      ) : (
        <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          {employees.map(emp => (
            <div key={emp.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <Link
                  to={`/dashboard/employees/${emp.id}`}
                  className="font-medium hover:underline"
                  style={{ color: 'var(--color-text)' }}
                >
                  {emp.name}
                </Link>
                <div className="mt-0.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatPhone(emp.phone)}
                  {emp.email && <span> &middot; {emp.email}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDuplicate(emp)}
                  className="rounded-md px-2.5 py-1 text-xs border transition-colors"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  title="Duplicate employee with SOP"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => navigate(`/dashboard/employees/${emp.id}`)}
                  className="rounded-md px-2.5 py-1 text-xs border transition-colors"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(emp)}
                  className="rounded-md px-2.5 py-1 text-xs transition-colors"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
      .insert({ org_id: orgId, name, phone: normalized, email: email || null, slug, access_token: token })
      .select()
      .single()

    if (empError) { setError(empError.message); setSaving(false); return }

    // Create a draft SOP for the new employee
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Phone (WhatsApp) *</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="081234567890" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
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
