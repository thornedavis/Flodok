import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164 } from '../../lib/phone'
import type { User, Employee, Organization } from '../../types/database'

export function EmployeeEdit({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [empResult, orgResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', id!).single(),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
      ])
      if (empResult.data) {
        setEmployee(empResult.data)
        setName(empResult.data.name)
        setPhone(empResult.data.phone)
        setEmail(empResult.data.email || '')
      }
      setOrg(orgResult.data)
    }
    load()
  }, [id, user.org_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const normalized = normalizePhone(phone, org?.default_country_code)
    if (!isValidE164(normalized)) {
      setError('Invalid phone number format')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase
      .from('employees')
      .update({ name, phone: normalized, email: email || null })
      .eq('id', id!)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    navigate('/dashboard/employees')
  }

  if (!employee) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const sopUrl = `${window.location.origin}/sop/${employee.slug}-${employee.access_token}`

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Edit Employee</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Phone (WhatsApp)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email (optional)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>SOP Link</label>
          <div className="flex items-center gap-2">
            <input type="text" readOnly value={sopUrl} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)' }} />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(sopUrl)}
              className="shrink-0 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Copy
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button type="button" onClick={() => navigate('/dashboard/employees')} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
