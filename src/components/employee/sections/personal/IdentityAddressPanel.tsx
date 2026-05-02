import { useState } from 'react'
import { useLang } from '../../../../contexts/LanguageContext'
import { DatePicker } from '../../../DatePicker'
import { SectionPanel, FieldRow, FieldValue } from '../../SectionPanel'
import type { Employee } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

interface IdentityAddressPanelProps {
  employee: Employee
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
}

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{children}</label>
}

export function IdentityAddressPanel({
  employee,
  canWrite,
  writeDisabledTitle,
  saveFields,
}: IdentityAddressPanelProps) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [ktpNik, setKtpNik] = useState(employee.ktp_nik || '')
  const [citizenIdAddress, setCitizenIdAddress] = useState(employee.citizen_id_address || '')
  const [postalCode, setPostalCode] = useState(employee.postal_code || '')
  const [address, setAddress] = useState(employee.address || '')
  const [passportNumber, setPassportNumber] = useState(employee.passport_number || '')
  const [passportExpiry, setPassportExpiry] = useState(employee.passport_expiry || '')

  function snapshot() {
    setKtpNik(employee.ktp_nik || '')
    setCitizenIdAddress(employee.citizen_id_address || '')
    setPostalCode(employee.postal_code || '')
    setAddress(employee.address || '')
    setPassportNumber(employee.passport_number || '')
    setPassportExpiry(employee.passport_expiry || '')
    setError('')
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    const result = await saveFields({
      ktp_nik: ktpNik || null,
      citizen_id_address: citizenIdAddress || null,
      postal_code: postalCode || null,
      address: address || null,
      passport_number: passportNumber || null,
      passport_expiry: passportExpiry || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
  }

  function multilineValue(value: string | null | undefined) {
    if (!value) return <FieldValue value={null} />
    return <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>
  }

  return (
    <SectionPanel
      title={t.empSectionIdentityAddress}
      subtitle={t.empSectionIdentityAddressHint}
      editing={editing}
      onEdit={() => { snapshot(); setEditing(true) }}
      onSave={handleSave}
      onCancel={() => { snapshot(); setEditing(false) }}
      saving={saving}
      canEdit={canWrite}
      editDisabledTitle={writeDisabledTitle}
    >
      {error && (
        <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {editing ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>{t.ktpNikOptionalLabel}</Label>
            <input type="text" value={ktpNik} onChange={e => setKtpNik(e.target.value)} placeholder="e.g. 5171234567890001" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label>{t.empFieldPostalCode}</Label>
            <input type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div className="md:col-span-2">
            <Label>{t.empFieldCitizenIdAddress}</Label>
            <textarea value={citizenIdAddress} onChange={e => setCitizenIdAddress(e.target.value)} rows={2} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.empFieldCitizenIdAddressHint}</p>
          </div>
          <div className="md:col-span-2">
            <Label>{t.empFieldResidentialAddress}</Label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder={t.addressPlaceholder} rows={2} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label>{t.empFieldPassportNumber}</Label>
            <input type="text" value={passportNumber} onChange={e => setPassportNumber(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label>{t.empFieldPassportExpiry}</Label>
            <DatePicker
              value={passportExpiry}
              onChange={setPassportExpiry}
              minYear={new Date().getFullYear() - 5}
              maxYear={new Date().getFullYear() + 20}
            />
          </div>
        </div>
      ) : (
        <div>
          <FieldRow label={t.ktpNikOptionalLabel}><FieldValue value={employee.ktp_nik} /></FieldRow>
          <FieldRow label={t.empFieldCitizenIdAddress}>{multilineValue(employee.citizen_id_address)}</FieldRow>
          <FieldRow label={t.empFieldPostalCode}><FieldValue value={employee.postal_code} /></FieldRow>
          <FieldRow label={t.empFieldResidentialAddress}>{multilineValue(employee.address)}</FieldRow>
          <FieldRow label={t.empFieldPassportNumber}><FieldValue value={employee.passport_number} /></FieldRow>
          <FieldRow label={t.empFieldPassportExpiry}><FieldValue value={formatDate(employee.passport_expiry)} /></FieldRow>
        </div>
      )}
    </SectionPanel>
  )
}
