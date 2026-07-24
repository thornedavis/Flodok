import { useLang } from '../../../contexts/LanguageContext'
import { SectionHeader } from '../SectionHeader'
import { PositionPanel } from './employment/PositionPanel'
import { EmploymentDatesPanel } from './employment/EmploymentDatesPanel'
import { WorkHoursPanel } from './employment/WorkHoursPanel'
import type { Contract, Employee, Organization } from '../../../types/aliases'

interface EmploymentSectionProps {
  employee: Employee
  organization: Organization | null
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
  activeContract: Contract | null
  contractSignedAt: string | null
  branchOptions: string[]
  jobPositionOptions: string[]
  jobLevelOptions: string[]
  employeeClassOptions: string[]
}

export function EmploymentSection({
  employee,
  organization,
  canWrite,
  writeDisabledTitle,
  saveFields,
  activeContract,
  contractSignedAt,
  branchOptions,
  jobPositionOptions,
  jobLevelOptions,
  employeeClassOptions,
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
          branchOptions={branchOptions}
          jobPositionOptions={jobPositionOptions}
          jobLevelOptions={jobLevelOptions}
          employeeClassOptions={employeeClassOptions}
        />
        <EmploymentDatesPanel
          employee={employee}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
          saveFields={saveFields}
          activeContract={activeContract}
          contractSignedAt={contractSignedAt}
        />
        <WorkHoursPanel
          employee={employee}
          organization={organization}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
          saveFields={saveFields}
        />
      </div>
    </div>
  )
}
