import { useLang } from '../../../../contexts/LanguageContext'
import { DocumentUpload } from '../../../DocumentUpload'
import { SectionPanel } from '../../SectionPanel'
import type { Employee } from '../../../../types/aliases'

interface IdentityDocumentsPanelProps {
  employee: Employee
  employeeId: string
  canWrite: boolean
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
}

export function IdentityDocumentsPanel({
  employee,
  employeeId,
  canWrite,
  saveFields,
}: IdentityDocumentsPanelProps) {
  const { t } = useLang()

  async function handlePhotoChange(field: 'ktp_photo_url' | 'kk_photo_url', url: string | null) {
    await saveFields({ [field]: url })
  }

  return (
    <SectionPanel title={t.empSectionAdditionalDocs}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.ktpPhotoLabel}</label>
          <DocumentUpload
            employeeId={employeeId}
            kind="ktp"
            photoUrl={employee.ktp_photo_url}
            onChange={url => handlePhotoChange('ktp_photo_url', url)}
            label={employee.name}
            disabled={!canWrite}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.kkPhotoLabel}</label>
          <DocumentUpload
            employeeId={employeeId}
            kind="kk"
            photoUrl={employee.kk_photo_url}
            onChange={url => handlePhotoChange('kk_photo_url', url)}
            label={employee.name}
            disabled={!canWrite}
          />
        </div>
      </div>
    </SectionPanel>
  )
}
