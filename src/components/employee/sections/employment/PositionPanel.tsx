import { useState } from 'react'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel, FieldRow, FieldValue } from '../../SectionPanel'
import type { Employee } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

interface PositionPanelProps {
  employee: Employee
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
  branchOptions: string[]
  jobPositionOptions: string[]
  jobLevelOptions: string[]
  employeeClassOptions: string[]
}

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
      {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
    </label>
  )
}

export function PositionPanel({
  employee,
  canWrite,
  writeDisabledTitle,
  saveFields,
  branchOptions,
  jobPositionOptions,
  jobLevelOptions,
  employeeClassOptions,
}: PositionPanelProps) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [employeeCode, setEmployeeCode] = useState(employee.employee_code || '')
  const [jobPosition, setJobPosition] = useState(employee.job_position || '')
  const [jobLevel, setJobLevel] = useState(employee.job_level || '')
  const [grade, setGrade] = useState(employee.grade || '')
  const [klass, setKlass] = useState(employee.class || '')
  const [branchName, setBranchName] = useState(employee.branch_name || '')

  function snapshot() {
    setEmployeeCode(employee.employee_code || '')
    setJobPosition(employee.job_position || '')
    setJobLevel(employee.job_level || '')
    setGrade(employee.grade || '')
    setKlass(employee.class || '')
    setBranchName(employee.branch_name || '')
    setError('')
  }

  async function handleSave() {
    setError('')
    const missing: string[] = []
    if (!employeeCode.trim()) missing.push(t.empFieldEmployeeCode)
    if (!jobPosition.trim()) missing.push(t.empFieldJobPosition)
    if (!jobLevel.trim()) missing.push(t.empFieldJobLevel)
    if (missing.length > 0) {
      setError(t.empRequiredMissing(missing.join(', ')))
      return
    }

    setSaving(true)
    const result = await saveFields({
      employee_code: employeeCode.trim() || null,
      job_position: jobPosition.trim() || null,
      job_level: jobLevel.trim() || null,
      grade: grade.trim() || null,
      class: klass.trim() || null,
      branch_name: branchName.trim() || null,
    })
    setSaving(false)
    if (result.error) {
      // Friendlier message for the unique-constraint case.
      if (/employees_org_employee_code_key/.test(result.error)) {
        setError(t.empEmployeeCodeTaken)
      } else {
        setError(result.error)
      }
      return
    }
    setEditing(false)
  }

  return (
    <SectionPanel
      title={t.empSectionPosition}
      subtitle={t.empSectionPositionHint}
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
            <Label required>{t.empFieldEmployeeCode}</Label>
            <input type="text" value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label required>{t.empFieldJobPosition}</Label>
            <ReferenceSelect value={jobPosition} onChange={setJobPosition} options={jobPositionOptions} />
          </div>
          <div>
            <Label required>{t.empFieldJobLevel}</Label>
            <ReferenceSelect value={jobLevel} onChange={setJobLevel} options={jobLevelOptions} />
          </div>
          <div>
            <Label>{t.empFieldGrade}</Label>
            <input type="text" value={grade} onChange={e => setGrade(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <Label>{t.empFieldClass}</Label>
            <ReferenceSelect value={klass} onChange={setKlass} options={employeeClassOptions} />
          </div>
          <div>
            <Label>{t.empFieldBranchName}</Label>
            <ReferenceSelect value={branchName} onChange={setBranchName} options={branchOptions} />
          </div>
        </div>
      ) : (
        <div>
          <FieldRow label={t.empFieldEmployeeCode}><FieldValue value={employee.employee_code} /></FieldRow>
          <FieldRow label={t.empFieldJobPosition}><FieldValue value={employee.job_position} /></FieldRow>
          <FieldRow label={t.empFieldJobLevel}><FieldValue value={employee.job_level} /></FieldRow>
          <FieldRow label={t.empFieldGrade}><FieldValue value={employee.grade} /></FieldRow>
          <FieldRow label={t.empFieldClass}><FieldValue value={employee.class} /></FieldRow>
          <FieldRow label={t.empFieldBranchName}><FieldValue value={employee.branch_name} /></FieldRow>
        </div>
      )}
    </SectionPanel>
  )
}

function ReferenceSelect({ value, onChange, options }: {
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  const { t } = useLang()
  const allOptions = withCurrentOption(options, value)
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
      <option value="">{t.empOptionUnset}</option>
      {allOptions.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  )
}

function withCurrentOption(options: string[], value: string) {
  const clean = value.trim()
  if (!clean) return options
  return options.some(option => option.toLowerCase() === clean.toLowerCase())
    ? options
    : [clean, ...options]
}
