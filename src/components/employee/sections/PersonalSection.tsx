import { useState } from 'react'
import { useLang } from '../../../contexts/LanguageContext'
import { SectionHeader } from '../SectionHeader'
import { BasicInfoPanel } from './personal/BasicInfoPanel'
import { IdentityAddressPanel } from './personal/IdentityAddressPanel'
import { IdentityDocumentsPanel } from './personal/IdentityDocumentsPanel'
import { FamilyMembersPanel } from './personal/FamilyMembersPanel'
import { EmergencyContactsPanel } from './personal/EmergencyContactsPanel'
import type { Employee, Organization } from '../../../types/aliases'

type PersonalSubTab = 'basic' | 'family' | 'emergency'

interface PersonalSectionProps {
  employee: Employee
  org: Organization | null
  orgDepartments: string[]
  canWrite: boolean
  writeDisabledTitle?: string
  saveFields: (partial: Partial<Employee>) => Promise<{ error?: string }>
  isNew?: boolean
  onDiscardNew?: () => void
}

export function PersonalSection({
  employee,
  org,
  orgDepartments,
  canWrite,
  writeDisabledTitle,
  saveFields,
  isNew = false,
  onDiscardNew,
}: PersonalSectionProps) {
  const { t } = useLang()
  const [subTab, setSubTab] = useState<PersonalSubTab>('basic')

  const subTabs = [
    { key: 'basic', label: t.empSubBasicInfo },
    { key: 'family', label: t.empSubFamily },
    { key: 'emergency', label: t.empSubEmergencyContact },
  ]

  return (
    <div>
      <SectionHeader
        title={t.empNavPersonal}
        subTabs={subTabs}
        activeSubTab={subTab}
        onSubTabChange={k => setSubTab(k as PersonalSubTab)}
      />

      {subTab === 'basic' && (
        <div className="space-y-6">
          <BasicInfoPanel
            employee={employee}
            org={org}
            orgDepartments={orgDepartments}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
            isNew={isNew}
            onDiscardNew={onDiscardNew}
          />
          <IdentityAddressPanel
            employee={employee}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
          />
          <IdentityDocumentsPanel
            employee={employee}
            employeeId={employee.id}
            canWrite={canWrite}
            saveFields={saveFields}
          />
        </div>
      )}

      {subTab === 'family' && (
        <FamilyMembersPanel
          employeeId={employee.id}
          orgId={employee.org_id}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />
      )}

      {subTab === 'emergency' && (
        <EmergencyContactsPanel
          employeeId={employee.id}
          orgId={employee.org_id}
          org={org}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />
      )}
    </div>
  )
}
