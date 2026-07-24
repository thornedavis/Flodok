// Reference work hours for one employee — the expected start/end the
// attendance log is read against (migration 215).
//
// These are a REFERENCE, not a rule: nothing computes lateness from them and
// nothing about pay changes. They exist so whoever reads the attendance log
// can see "due 09:00, clocked in 09:01" without knowing each person's schedule
// by heart, and make the call themselves.
//
// Blank = inherit the organisation default (Settings ▸ Attendance). The read
// view says which of the two is in force so an unset employee never looks
// misconfigured. Hours live here rather than on the contract because 168's
// tg_lock_signed_live freezes signed contracts — a schedule change would
// otherwise mean re-issuing and re-signing.

import { useState } from 'react'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel, FieldRow } from '../../SectionPanel'
import { hhmm } from '../../../../lib/attendance/time'
import type { Employee, Organization } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
      {children}
    </label>
  )
}

function range(start: string, end: string): string | null {
  if (!start && !end) return null
  return `${start || '—'} – ${end || '—'}`
}

interface WorkHoursPanelProps {
  employee: Employee
  organization: Organization | null
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
}

export function WorkHoursPanel({
  employee,
  organization,
  canWrite,
  writeDisabledTitle,
  saveFields,
}: WorkHoursPanelProps) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [start, setStart] = useState(hhmm(employee.work_start_time))
  const [end, setEnd] = useState(hhmm(employee.work_end_time))

  function snapshot() {
    setStart(hhmm(employee.work_start_time))
    setEnd(hhmm(employee.work_end_time))
    setError('')
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    const result = await saveFields({
      work_start_time: start || null,
      work_end_time: end || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setEditing(false)
  }

  const own = range(hhmm(employee.work_start_time), hhmm(employee.work_end_time))
  const orgDefault = range(hhmm(organization?.default_work_start_time), hhmm(organization?.default_work_end_time))

  return (
    <SectionPanel
      title={t.empSectionWorkHours}
      subtitle={t.empSectionWorkHoursHint}
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
            <FormLabel>{t.empFieldWorkStart}</FormLabel>
            <input
              type="time"
              value={start}
              onChange={e => setStart(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <FormLabel>{t.empFieldWorkEnd}</FormLabel>
            <input
              type="time"
              value={end}
              onChange={e => setEnd(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>
          <p className="text-xs md:col-span-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {orgDefault ? t.empWorkHoursInheritHint(orgDefault) : t.empWorkHoursNoDefaultHint}
          </p>
        </div>
      ) : (
        <FieldRow label={t.empSectionWorkHours}>
          {own ? (
            <span style={{ color: 'var(--color-text)' }}>{own}</span>
          ) : orgDefault ? (
            <span className="flex flex-wrap items-center gap-2">
              <span style={{ color: 'var(--color-text)' }}>{orgDefault}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.empWorkHoursUsingDefault}</span>
            </span>
          ) : (
            <span className="italic" style={{ color: 'var(--color-text-tertiary)' }}>{t.empWorkHoursUnset}</span>
          )}
        </FieldRow>
      )}
    </SectionPanel>
  )
}
