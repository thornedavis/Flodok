import { useLang } from '../../../contexts/LanguageContext'
import { SectionHeader } from '../SectionHeader'
import { PositionPanel } from './employment/PositionPanel'
import { EmploymentDatesPanel } from './employment/EmploymentDatesPanel'
import type { Contract, Employee } from '../../../types/aliases'

interface EmploymentSectionProps {
  employee: Employee
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
  activeContract: Contract | null
  contractSignedAt: string | null
}

export function EmploymentSection({
  employee,
  canWrite,
  writeDisabledTitle,
  saveFields,
  activeContract,
  contractSignedAt,
}: EmploymentSectionProps) {
  const { t } = useLang()
  return (
    <div>
      <SectionHeader title={t.empNavEmployment} />
      <div className="space-y-6">
        <PositionPanel
          employee={employee}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
          saveFields={saveFields}
        />
        <EmploymentDatesPanel
          employee={employee}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
          saveFields={saveFields}
          activeContract={activeContract}
          contractSignedAt={contractSignedAt}
        />
      </div>
    </div>
  )
}
