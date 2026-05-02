import { useEffect, useState } from 'react'
import { useLang } from '../../../../contexts/LanguageContext'
import { PhoneInput, isValidPhone, describePhoneError } from '../../../PhoneInput'
import { DepartmentsMultiSelect } from '../../../DepartmentsMultiSelect'
import { DatePicker } from '../../../DatePicker'
import { SectionPanel, FieldRow, FieldValue } from '../../SectionPanel'
import {
  GENDER_VALUES, MARITAL_VALUES, BLOOD_TYPE_VALUES, RELIGION_VALUES,
  genderLabel, maritalLabel, bloodLabel, religionLabel,
} from './enums'
import type { Employee, Organization } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

interface BasicInfoPanelProps {
  employee: Employee
  org: Organization | null
  orgDepartments: string[]
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
  /** True when the employee was just created via the "Add" button and the
   *  basic fields haven't been filled in yet. Auto-opens edit mode and treats
   *  Cancel as a discard. */
  isNew?: boolean
  onDiscardNew?: () => void
}

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
      {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
    </label>
  )
}

/** Best-effort split of the legacy `name` column when first_name is null. */
function deriveNameParts(employee: Employee, isNew: boolean): { first: string; last: string } {
  // For a freshly-created placeholder employee, don't pre-populate fields with
  // the placeholder name — the form should be empty so the user types real values.
  if (isNew) return { first: '', last: '' }
  if (employee.first_name !== null && employee.first_name !== undefined) {
    return { first: employee.first_name || '', last: employee.last_name || '' }
  }
  const parts = (employee.name || '').trim().split(/\s+/)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function composeName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(' ')
}

export function BasicInfoPanel({
  employee,
  org,
  orgDepartments,
  canWrite,
  writeDisabledTitle,
  saveFields,
  isNew = false,
  onDiscardNew,
}: BasicInfoPanelProps) {
  const { t } = useLang()
  const [editing, setEditing] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const initialDepartments = employee.departments && employee.departments.length > 0
    ? employee.departments
    : employee.department
    ? [employee.department]
    : []
  const initialName = deriveNameParts(employee, isNew)

  const [firstName, setFirstName] = useState(initialName.first)
  const [lastName, setLastName] = useState(initialName.last)
  const [phone, setPhone] = useState(isNew ? '' : employee.phone)
  const [email, setEmail] = useState(employee.email || '')
  const [placeOfBirth, setPlaceOfBirth] = useState(employee.place_of_birth || '')
  const [dateOfBirth, setDateOfBirth] = useState(employee.date_of_birth || '')
  const [gender, setGender] = useState(employee.gender || '')
  const [maritalStatus, setMaritalStatus] = useState(employee.marital_status || '')
  const [bloodType, setBloodType] = useState(employee.blood_type || '')
  const [religion, setReligion] = useState(employee.religion || '')
  const [departments, setDepartments] = useState<string[]>(initialDepartments)

  // Make sure edit mode opens once the employee record has loaded for a new
  // employee (in case the panel mounted before the load finished).
  useEffect(() => {
    if (isNew) setEditing(true)
  }, [isNew])

  function snapshot() {
    const np = deriveNameParts(employee, isNew)
    setFirstName(np.first)
    setLastName(np.last)
    setPhone(isNew ? '' : employee.phone)
    setEmail(employee.email || '')
    setPlaceOfBirth(employee.place_of_birth || '')
    setDateOfBirth(employee.date_of_birth || '')
    setGender(employee.gender || '')
    setMaritalStatus(employee.marital_status || '')
    setBloodType(employee.blood_type || '')
    setReligion(employee.religion || '')
    setDepartments(initialDepartments)
    setError('')
  }

  function handleCancel() {
    if (isNew && onDiscardNew) {
      onDiscardNew()
      return
    }
    snapshot()
    setEditing(false)
  }

  async function handleSave() {
    setError('')

    // Required-field check (first name, email, date of birth, marital status, religion).
    // Phone validation happens separately via the country-aware validator below.
    const missing: string[] = []
    if (!firstName.trim()) missing.push(t.empFieldFirstName)
    if (!email.trim()) missing.push(t.emailOptionalLabel.replace(/\s*\(.*\)\s*$/, ''))
    if (!dateOfBirth) missing.push(t.dateOfBirthLabel)
    if (!maritalStatus) missing.push(t.empFieldMaritalStatus)
    if (!religion) missing.push(t.empFieldReligion)
    if (missing.length > 0) {
      setError(t.empRequiredMissing(missing.join(', ')))
      return
    }

    if (!isValidPhone(phone)) {
      setError(describePhoneError(phone, t))
      return
    }

    setSaving(true)
    const result = await saveFields({
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      name: composeName(firstName, lastName),
      phone,
      email: email.trim() || null,
      place_of_birth: placeOfBirth || null,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      marital_status: maritalStatus || null,
      blood_type: bloodType || null,
      religion: religion || null,
      departments,
      department: departments[0] || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
  }

  const displayDepartments = initialDepartments.length > 0 ? initialDepartments.join(', ') : null
  const displayName = deriveNameParts(employee, false)

  return (
    <SectionPanel
      title={t.empSectionPersonalData}
      subtitle={t.empSectionPersonalDataHint}
      editing={editing}
      onEdit={() => { snapshot(); setEditing(true) }}
      onSave={handleSave}
      onCancel={handleCancel}
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
            <Label required>{t.empFieldFirstName}</Label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label>{t.empFieldLastName}</Label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label required>{t.phoneWhatsAppLabel}</Label>
            <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={org?.default_country_code} />
          </div>
          <div>
            <Label required>{t.emailOptionalLabel.replace(/\s*\(.*\)\s*$/, '')}</Label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label>{t.empFieldPlaceOfBirth}</Label>
            <input type="text" value={placeOfBirth} onChange={e => setPlaceOfBirth(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label required>{t.dateOfBirthLabel}</Label>
            <DatePicker
              value={dateOfBirth}
              onChange={setDateOfBirth}
              maxYear={new Date().getFullYear()}
              minYear={new Date().getFullYear() - 100}
            />
          </div>
          <div>
            <Label>{t.empFieldGender}</Label>
            <select value={gender} onChange={e => setGender(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.empOptionUnset}</option>
              {GENDER_VALUES.map(v => <option key={v} value={v}>{genderLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <Label required>{t.empFieldMaritalStatus}</Label>
            <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.empOptionUnset}</option>
              {MARITAL_VALUES.map(v => <option key={v} value={v}>{maritalLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <Label>{t.empFieldBloodType}</Label>
            <select value={bloodType} onChange={e => setBloodType(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.empOptionUnset}</option>
              {BLOOD_TYPE_VALUES.map(v => <option key={v} value={v}>{bloodLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <Label required>{t.empFieldReligion}</Label>
            <select value={religion} onChange={e => setReligion(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.empOptionUnset}</option>
              {RELIGION_VALUES.map(v => <option key={v} value={v}>{religionLabel(t, v)}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>{t.departmentsLabel}</Label>
            <DepartmentsMultiSelect value={departments} onChange={setDepartments} availableDepartments={orgDepartments} />
          </div>
        </div>
      ) : (
        <div>
          <FieldRow label={t.empFieldFirstName}><FieldValue value={displayName.first} /></FieldRow>
          <FieldRow label={t.empFieldLastName}><FieldValue value={displayName.last} /></FieldRow>
          <FieldRow label={t.phoneWhatsAppLabel}><FieldValue value={employee.phone} /></FieldRow>
          <FieldRow label={t.emailOptionalLabel.replace(/\s*\(.*\)\s*$/, '')}><FieldValue value={employee.email} /></FieldRow>
          <FieldRow label={t.empFieldPlaceOfBirth}><FieldValue value={employee.place_of_birth} /></FieldRow>
          <FieldRow label={t.dateOfBirthLabel}><FieldValue value={formatDate(employee.date_of_birth)} /></FieldRow>
          <FieldRow label={t.empFieldGender}><FieldValue value={genderLabel(t, employee.gender)} /></FieldRow>
          <FieldRow label={t.empFieldMaritalStatus}><FieldValue value={maritalLabel(t, employee.marital_status)} /></FieldRow>
          <FieldRow label={t.empFieldBloodType}><FieldValue value={bloodLabel(t, employee.blood_type)} /></FieldRow>
          <FieldRow label={t.empFieldReligion}><FieldValue value={religionLabel(t, employee.religion)} /></FieldRow>
          <FieldRow label={t.departmentsLabel}><FieldValue value={displayDepartments} /></FieldRow>
        </div>
      )}
    </SectionPanel>
  )
}
