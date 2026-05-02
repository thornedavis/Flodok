import { useLang } from '../../../contexts/LanguageContext'
import { SectionHeader } from '../SectionHeader'
import { WorkingExperiencePanel } from './education/WorkingExperiencePanel'
import type { Employee } from '../../../types/aliases'

interface ExperienceSectionProps {
  employee: Employee
  canWrite: boolean
  writeDisabledTitle?: string
}

export function ExperienceSection({ employee, canWrite, writeDisabledTitle }: ExperienceSectionProps) {
  const { t } = useLang()
  return (
    <div>
      <SectionHeader title={t.empNavExperience} />
      <WorkingExperiencePanel
        employeeId={employee.id}
        orgId={employee.org_id}
        canWrite={canWrite}
        writeDisabledTitle={writeDisabledTitle}
      />
    </div>
  )
}
