import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../../../contexts/LanguageContext'
import { DatePicker } from '../../../DatePicker'
import { SectionPanel, FieldRow, FieldValue } from '../../SectionPanel'
import { documentEditPath, documentsIndexPath } from '../../../../lib/documentTypes'
import type { Translations } from '../../../../lib/translations'
import type { Contract, Employee } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const EMPLOYMENT_TYPE_VALUES = [
  'permanent', 'contract', 'probation', 'internship', 'outsource',
] as const

function employmentTypeLabel(t: Translations, value: string | null): string | null {
  switch (value) {
    case 'permanent': return t.empEmploymentTypePermanent
    case 'contract': return t.empEmploymentTypeContract
    case 'probation': return t.empEmploymentTypeProbation
    case 'internship': return t.empEmploymentTypeInternship
    case 'outsource': return t.empEmploymentTypeOutsource
    default: return null
  }
}

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDateTime(value: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

interface EmploymentDatesPanelProps {
  employee: Employee
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
  /** Most recent active contract for this employee, if any. */
  activeContract: Contract | null
  /** Latest signed_at across all signatures on the active contract.
   *  Null if the contract isn't signed yet (or no contract exists). */
  contractSignedAt: string | null
}

function FormLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
      {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
    </label>
  )
}

/** Read-only row: shows the contract sign date when available, otherwise a
 *  link out to the Contracts area. The value is derived from
 *  contract_signatures, never edited from this panel. */
function ContractSignDateValue({
  activeContract,
  contractSignedAt,
}: {
  activeContract: Contract | null
  contractSignedAt: string | null
}) {
  const { t } = useLang()
  const formatted = formatDateTime(contractSignedAt)

  const linkTarget = activeContract
    ? documentEditPath('contract', activeContract.id)
    : documentsIndexPath('contract')

  return (
    <div className="flex items-center gap-2">
      {formatted ? (
        <span style={{ color: 'var(--color-text)' }}>{formatted}</span>
      ) : (
        <span className="italic" style={{ color: 'var(--color-text-tertiary)' }}>{t.empContractSignDeterminedBy}</span>
      )}
      <Link
        to={linkTarget}
        title={t.empContractSignViewContracts}
        aria-label={t.empContractSignViewContracts}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[var(--color-bg-tertiary)]"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <ExternalLinkIcon />
      </Link>
    </div>
  )
}

export function EmploymentDatesPanel({
  employee,
  canWrite,
  writeDisabledTitle,
  saveFields,
  activeContract,
  contractSignedAt,
}: EmploymentDatesPanelProps) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [employmentType, setEmploymentType] = useState(employee.employment_type || '')
  const [joinDate, setJoinDate] = useState(employee.join_date || '')
  const [probationEnd, setProbationEnd] = useState(employee.probation_end_date || '')
  const [resignDate, setResignDate] = useState(employee.resign_date || '')

  function snapshot() {
    setEmploymentType(employee.employment_type || '')
    setJoinDate(employee.join_date || '')
    setProbationEnd(employee.probation_end_date || '')
    setResignDate(employee.resign_date || '')
    setError('')
  }

  async function handleSave() {
    setError('')
    const missing: string[] = []
    if (!employmentType) missing.push(t.empFieldEmploymentType)
    if (!joinDate) missing.push(t.empFieldJoinDate)
    if (missing.length > 0) {
      setError(t.empRequiredMissing(missing.join(', ')))
      return
    }

    setSaving(true)
    const result = await saveFields({
      employment_type: employmentType || null,
      join_date: joinDate || null,
      probation_end_date: probationEnd || null,
      resign_date: resignDate || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
  }

  const currentYear = new Date().getFullYear()

  return (
    <SectionPanel
      title={t.empSectionEmploymentDates}
      subtitle={t.empSectionEmploymentDatesHint}
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
            <FormLabel required>{t.empFieldEmploymentType}</FormLabel>
            <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.empOptionUnset}</option>
              {EMPLOYMENT_TYPE_VALUES.map(v => <option key={v} value={v}>{employmentTypeLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <FormLabel required>{t.empFieldJoinDate}</FormLabel>
            <DatePicker value={joinDate} onChange={setJoinDate} minYear={currentYear - 60} maxYear={currentYear + 1} />
          </div>
          <div>
            <FormLabel>{t.empFieldProbationEndDate}</FormLabel>
            <DatePicker value={probationEnd} onChange={setProbationEnd} minYear={currentYear - 60} maxYear={currentYear + 5} />
          </div>
          <div>
            <FormLabel>{t.empFieldResignDate}</FormLabel>
            <DatePicker value={resignDate} onChange={setResignDate} minYear={currentYear - 60} maxYear={currentYear + 5} />
          </div>
        </div>
      ) : (
        <div>
          <FieldRow label={t.empFieldEmploymentType}><FieldValue value={employmentTypeLabel(t, employee.employment_type)} /></FieldRow>
          <FieldRow label={t.empFieldJoinDate}><FieldValue value={formatDate(employee.join_date)} /></FieldRow>
          <FieldRow label={t.empFieldProbationEndDate}><FieldValue value={formatDate(employee.probation_end_date)} /></FieldRow>
          <FieldRow label={t.empFieldContractSignDate}>
            <ContractSignDateValue activeContract={activeContract} contractSignedAt={contractSignedAt} />
          </FieldRow>
          <FieldRow label={t.empFieldResignDate}><FieldValue value={formatDate(employee.resign_date)} /></FieldRow>
        </div>
      )}
    </SectionPanel>
  )
}
