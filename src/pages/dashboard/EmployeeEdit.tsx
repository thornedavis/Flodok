import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164 } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import type { User, Employee, Organization } from '../../types/database'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function EmployeeEdit({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
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
        setDepartment(empResult.data.department || '')
        setPhotoUrl(empResult.data.photo_url)
      }
      setOrg(orgResult.data)
    }
    load()
  }, [id, user.org_id])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError('Image must be under 2 MB.')
      return
    }

    setError('')
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${id}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    // Append cache-buster so the browser fetches the new image
    const url = `${publicUrl}?t=${Date.now()}`

    await supabase.from('employees').update({ photo_url: url }).eq('id', id!)
    setPhotoUrl(url)
    setUploading(false)
  }

  async function handleRemoveAvatar() {
    if (!employee) return
    setUploading(true)

    // Try to delete the file from storage (ignore errors if file doesn't exist)
    const ext = photoUrl?.split('.').pop()?.split('?')[0]
    if (ext) {
      await supabase.storage.from('avatars').remove([`${id}.${ext}`])
    }

    await supabase.from('employees').update({ photo_url: null }).eq('id', id!)
    setPhotoUrl(null)
    setUploading(false)
  }

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
      .update({ name, phone: normalized, email: email || null, department: department || null, photo_url: photoUrl })
      .eq('id', id!)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    navigate('/dashboard/employees')
  }

  async function handleDuplicate() {
    if (!employee || !org) return
    const newName = prompt('Name for the new employee (SOP will be copied):', `${employee.name} (Copy)`)
    if (!newName) return
    const newPhone = prompt('Phone number for the new employee:')
    if (!newPhone) return

    const phone = normalizePhone(newPhone, org.default_country_code)
    if (!isValidE164(phone)) {
      alert('Invalid phone number format')
      return
    }

    const slug = generateSlug(newName)
    const token = generateAccessToken()

    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({ org_id: employee.org_id, name: newName, phone, department: employee.department, slug, access_token: token })
      .select()
      .single()

    if (error) { alert(error.message); return }

    const { data: sop } = await supabase
      .from('sops')
      .select('*')
      .eq('employee_id', employee.id)
      .single()

    if (sop && newEmp) {
      await supabase.from('sops').insert({
        org_id: employee.org_id,
        employee_id: newEmp.id,
        title: sop.title,
        content_markdown: sop.content_markdown,
        status: 'draft',
      })
    }

    navigate(`/dashboard/employees/${newEmp!.id}`)
  }

  async function handleDelete() {
    if (!employee) return
    if (!confirm(`Delete ${employee.name}? This will also delete their SOP.`)) return
    await supabase.from('employees').delete().eq('id', employee.id)
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

        {/* Avatar */}
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Photo</label>
          <div className="flex items-center gap-4">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{ background: photoUrl ? 'var(--color-bg-tertiary)' : getAvatarGradient(id!) }}
            >
              {photoUrl && (
                <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {uploading ? 'Uploading...' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {photoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="text-left text-xs"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Remove
                </button>
              )}
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                JPEG, PNG, or WebP. Max 2 MB.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Phone (WhatsApp)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Department</label>
          <input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Purchasing" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
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

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button type="button" onClick={() => navigate('/dashboard/employees')} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Cancel
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={handleDuplicate} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Duplicate
            </button>
            <button type="button" onClick={handleDelete} className="rounded-lg px-4 py-2 text-sm" style={{ color: 'var(--color-danger)' }}>
              Delete
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
