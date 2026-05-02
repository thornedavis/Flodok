import { useState } from 'react'
import { useLang } from '../../../contexts/LanguageContext'
import { SectionPanel } from '../SectionPanel'
import { SectionHeader } from '../SectionHeader'
import { CustomFieldsPanel } from './additional/CustomFieldsPanel'
import type { Employee } from '../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

interface AdditionalInfoSectionProps {
  employee: Employee
  employeeId: string
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
}

export function AdditionalInfoSection({
  employee,
  employeeId,
  canWrite,
  writeDisabledTitle,
  saveFields,
}: AdditionalInfoSectionProps) {
  const { t } = useLang()

  const [notesEditing, setNotesEditing] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState('')
  const [notes, setNotes] = useState(employee.notes || '')

  function snapshotNotes() {
    setNotes(employee.notes || '')
    setNotesError('')
  }

  async function saveNotes() {
    setNotesError('')
    setNotesSaving(true)
    const result = await saveFields({ notes: notes || null })
    setNotesSaving(false)
    if (result.error) {
      setNotesError(result.error)
      return
    }
    setNotesEditing(false)
  }

  return (
    <div>
      <SectionHeader title={t.empNavAdditional} />
      <div className="space-y-6">
        <CustomFieldsPanel
          employeeId={employeeId}
          orgId={employee.org_id}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />

        <SectionPanel
          title={t.empSectionAdditionalNotes}
          editing={notesEditing}
          onEdit={() => { snapshotNotes(); setNotesEditing(true) }}
          onSave={saveNotes}
          onCancel={() => { snapshotNotes(); setNotesEditing(false) }}
          saving={notesSaving}
          canEdit={canWrite}
          editDisabledTitle={writeDisabledTitle}
        >
          {notesError && (
            <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {notesError}
            </div>
          )}

          {notesEditing ? (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t.notesPlaceholder}
              rows={4}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          ) : (
            employee.notes
              ? <p className="text-sm" style={{ color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>{employee.notes}</p>
              : <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.empSectionEmpty}</p>
          )}
        </SectionPanel>
      </div>
    </div>
  )
}
