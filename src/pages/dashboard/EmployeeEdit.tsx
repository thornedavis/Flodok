import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizePhone, isValidE164 } from '../../lib/phone'
import { generateSlug, generateAccessToken } from '../../lib/slug'
import { getAvatarGradient } from '../../lib/avatar'
import { PhoneInput } from '../../components/PhoneInput'
import { DepartmentsMultiSelect } from '../../components/DepartmentsMultiSelect'
import { DocumentUpload } from '../../components/DocumentUpload'
import { useLang } from '../../contexts/LanguageContext'
import type { User, Employee, Organization } from '../../types/database'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function EmployeeEditModal({ user, employeeId, onClose, onSaved }: {
  user: User
  employeeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLang()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [empDepartments, setEmpDepartments] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [ktpNik, setKtpNik] = useState('')
  const [address, setAddress] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [ktpPhotoUrl, setKtpPhotoUrl] = useState<string | null>(null)
  const [kkPhotoUrl, setKkPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [orgDepartments, setOrgDepartments] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const [empResult, orgResult, allEmpsResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).single(),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('employees').select('department, departments').eq('org_id', user.org_id),
      ])
      if (empResult.data) {
        setEmployee(empResult.data)
        setName(empResult.data.name)
        setPhone(empResult.data.phone)
        setEmail(empResult.data.email || '')
        // Prefer the new array column; fall back to legacy single-value for records
        // that predate the multi-dept migration.
        const initial = empResult.data.departments && empResult.data.departments.length > 0
          ? empResult.data.departments
          : empResult.data.department
          ? [empResult.data.department]
          : []
        setEmpDepartments(initial)
        setNotes(empResult.data.notes || '')
        setKtpNik(empResult.data.ktp_nik || '')
        setAddress(empResult.data.address || '')
        setPhotoUrl(empResult.data.photo_url)
        setKtpPhotoUrl(empResult.data.ktp_photo_url)
        setKkPhotoUrl(empResult.data.kk_photo_url)
      }
      setOrg(orgResult.data)
      if (allEmpsResult.data) {
        const all = new Set<string>()
        for (const e of allEmpsResult.data) {
          if (e.department) all.add(e.department)
          for (const d of e.departments || []) all.add(d)
        }
        setOrgDepartments([...all].sort())
      }
    }
    load()
  }, [employeeId, user.org_id])

  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t.avatarInvalidType)
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError(t.avatarTooLarge)
      return
    }

    setError('')
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${employeeId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`

    await supabase.from('employees').update({ photo_url: url }).eq('id', employeeId)
    setPhotoUrl(url)
    setUploading(false)
  }

  async function handleRemoveAvatar() {
    if (!employee) return
    setUploading(true)

    const ext = photoUrl?.split('.').pop()?.split('?')[0]
    if (ext) {
      await supabase.storage.from('avatars').remove([`${employeeId}.${ext}`])
    }

    await supabase.from('employees').update({ photo_url: null }).eq('id', employeeId)
    setPhotoUrl(null)
    setUploading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!isValidE164(phone)) {
      setError(t.invalidPhone)
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase
      .from('employees')
      .update({
        name,
        phone,
        email: email || null,
        departments: empDepartments,
        // Mirror first department into legacy single column so existing filters
        // (SOPs, Contracts, Overview) keep working until those sites migrate.
        department: empDepartments[0] || null,
        notes: notes || null,
        ktp_nik: ktpNik || null,
        address: address || null,
        photo_url: photoUrl,
        ktp_photo_url: ktpPhotoUrl,
        kk_photo_url: kkPhotoUrl,
      })
      .eq('id', employeeId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  async function handleDuplicate() {
    if (!employee || !org) return
    const newName = prompt(t.promptDuplicateName, t.copyOfName(employee.name))
    if (!newName) return
    const newPhone = prompt(t.promptDuplicatePhone)
    if (!newPhone) return

    const ph = normalizePhone(newPhone, org.default_country_code)
    if (!isValidE164(ph)) {
      alert(t.invalidPhone)
      return
    }

    const slug = generateSlug(newName)
    const token = generateAccessToken()

    const { data: newEmp, error } = await supabase
      .from('employees')
      .insert({
        org_id: employee.org_id,
        name: newName,
        phone: ph,
        departments: empDepartments,
        department: empDepartments[0] || null,
        slug,
        access_token: token,
      })
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

    onSaved()
  }

  async function handleDelete() {
    if (!employee) return
    if (!confirm(t.deleteEmployeeConfirm(employee.name))) return
    await supabase.from('employees').delete().eq('id', employee.id)
    onSaved()
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const portalUrl = employee
    ? `${window.location.origin}/sop/${employee.slug}-${employee.access_token}`
    : ''

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
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

        {!employee ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
        ) : (
          <>
            <h2 className="mb-5 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.editEmployeeTitle}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                  {error}
                </div>
              )}

              {/* Avatar */}
              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.photoLabel}</label>
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
                    style={{ background: photoUrl ? 'var(--color-bg-tertiary)' : getAvatarGradient(employeeId) }}
                  >
                    {photoUrl && (
                      <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                    >
                      {uploading ? t.uploading : t.upload}
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
                        className="text-xs"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        {t.remove}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.nameLabel}</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.phoneWhatsAppLabel}</label>
                <div className="relative">
                  <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={org?.default_country_code} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.departmentsLabel}</label>
                <DepartmentsMultiSelect value={empDepartments} onChange={setEmpDepartments} availableDepartments={orgDepartments} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.emailOptionalLabel}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.ktpNikOptionalLabel}</label>
                <input type="text" value={ktpNik} onChange={e => setKtpNik(e.target.value)} placeholder="e.g. 5171234567890001" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.ktpPhotoLabel}</label>
                <DocumentUpload employeeId={employeeId} kind="ktp" photoUrl={ktpPhotoUrl} onChange={setKtpPhotoUrl} label={name} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.kkPhotoLabel}</label>
                <DocumentUpload employeeId={employeeId} kind="kk" photoUrl={kkPhotoUrl} onChange={setKkPhotoUrl} label={name} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.addressOptionalLabel}</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder={t.addressPlaceholder} rows={2} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.notesInternalLabel}</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t.notesPlaceholder}
                  rows={3}
                  className="w-full resize-none rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.employeePortalLink}</label>
                <p className="mb-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.shareLinkHint}</p>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly value={portalUrl} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)' }} />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(portalUrl)}
                    className="shrink-0 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)', color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)' }}
                  >
                    {copied ? t.copied : t.copy}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
                <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
                  {saving ? t.saving : t.saveChanges}
                </button>
                <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  {t.cancel}
                </button>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={handleDuplicate} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    {t.duplicate}
                  </button>
                  <button type="button" onClick={handleDelete} className="rounded-lg px-4 py-2 text-sm" style={{ color: 'var(--color-danger)' }}>
                    {t.delete}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
