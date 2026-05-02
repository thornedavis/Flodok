import { useState } from 'react'
import { useLang } from '../../../contexts/LanguageContext'
import { SectionHeader } from '../SectionHeader'
import { FormalEducationPanel } from './education/FormalEducationPanel'
import { InformalEducationPanel } from './education/InformalEducationPanel'
import type { Employee } from '../../../types/aliases'

type EducationSubTab = 'formal' | 'informal'

interface EducationSectionProps {
  employee: Employee
  canWrite: boolean
  writeDisabledTitle?: string
}

export function EducationSection({ employee, canWrite, writeDisabledTitle }: EducationSectionProps) {
  const { t } = useLang()
  const [subTab, setSubTab] = useState<EducationSubTab>('formal')

  const subTabs = [
    { key: 'formal', label: t.eduSubFormal },
    { key: 'informal', label: t.eduSubInformal },
  ]

  return (
    <div>
      <SectionHeader
        title={t.empNavEducation}
        subTabs={subTabs}
        activeSubTab={subTab}
        onSubTabChange={k => setSubTab(k as EducationSubTab)}
      />
      {subTab === 'formal' && (
        <FormalEducationPanel
          employeeId={employee.id}
          orgId={employee.org_id}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />
      )}
      {subTab === 'informal' && (
        <InformalEducationPanel
          employeeId={employee.id}
          orgId={employee.org_id}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />
      )}
    </div>
  )
}
