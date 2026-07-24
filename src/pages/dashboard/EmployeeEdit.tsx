import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { saltedAvatarKey, avatarKeyFromUrl } from '../../lib/avatar'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { CompensationSummary } from '../../components/employee/CompensationSummary'
import { EmployeeDocuments } from '../../components/employee/EmployeeDocuments'
import { EmployeeSidebar, type EmployeeSectionKey } from '../../components/employee/EmployeeSidebar'
import { SeparationModal } from '../../components/employee/SeparationModal'
import { deriveEmployeeStatus, type SeparationType } from '../../lib/employeeStatus'
import { SectionHeader } from '../../components/employee/SectionHeader'
import { PersonalSection } from '../../components/employee/sections/PersonalSection'
import { EmploymentSection } from '../../components/employee/sections/EmploymentSection'
import { EducationSection } from '../../components/employee/sections/EducationSection'
import { ExperienceSection } from '../../components/employee/sections/ExperienceSection'
import { AdditionalInfoSection } from '../../components/employee/sections/AdditionalInfoSection'
import { EmployeeAttachments } from '../../components/EmployeeAttachments'
import { DeleteEmployeeModal } from '../../components/DeleteEmployeeModal'
import { isPro, syncSeats } from '../../lib/billing'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { useBilling } from '../../contexts/BillingContext'
import { setEmployeePrimaryDepartment } from '../../lib/departments'
import type { User, Employee, Organization, Contract } from '../../types/aliases'
import type { EmpDeptShape } from '../../lib/employee'

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

type EmployeeWithDepartments = Employee & EmpDeptShape

type DepartmentOption = { id: string; name: string }

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Sections that may be deep-linked via ?section=… .
const SECTION_KEYS: EmployeeSectionKey[] = [
  'personal', 'employment', 'education', 'experience', 'additional', 'documents', 'linked_documents', 'compensation',
]

export function EmployeeEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id: employeeId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const isNew = searchParams.get('new') === '1'

  const [employee, setEmployee] = useState<EmployeeWithDepartments | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [contractSignedAt, setContractSignedAt] = useState<string | null>(null)
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentOption[]>([])
  const [orgBranches, setOrgBranches] = useState<string[]>([])
  const [orgJobPositions, setOrgJobPositions] = useState<string[]>([])
  const [orgJobLevels, setOrgJobLevels] = useState<string[]>([])
  const [orgEmployeeClasses, setOrgEmployeeClasses] = useState<string[]>([])
  const initialSection = searchParams.get('section') as EmployeeSectionKey | null
  const [activeSection, setActiveSection] = useState<EmployeeSectionKey>(
    initialSection && SECTION_KEYS.includes(initialSection) ? initialSection : 'personal',
  )

  const [uploading, setUploading] = useState(false)
  const [topError, setTopError] = useState('')
  const [separationType, setSeparationType] = useState<SeparationType | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useBreadcrumbTrailing(employee?.name ?? null)

  useEffect(() => {
    if (!employeeId) return
    const id = employeeId
    async function load() {
      const [empResult, orgResult, referenceResult, departmentsResult, branchResult, contractResult] = await Promise.all([
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('id', id).single(),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
        supabase.from('company_departments').select('id, name').eq('org_id', user.org_id).order('display_order').order('name'),
        supabase.from('company_branches').select('name').eq('org_id', user.org_id).eq('is_active', true).order('name'),
        supabase
          .from('contracts')
          .select('*')
          .eq('employee_id', id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      setActiveContract(contractResult.data)

      // Latest signature on the active contract — surfaces as the read-only
      // "Contract sign date" row in the Employment panel.
      if (contractResult.data) {
        const { data: sig } = await supabase
          .from('contract_signatures')
          .select('signed_at')
          .eq('contract_id', contractResult.data.id)
          .order('signed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setContractSignedAt(sig?.signed_at ?? null)
      } else {
        setContractSignedAt(null)
      }

      if (empResult.data) setEmployee(empResult.data as EmployeeWithDepartments)
      setOrg(orgResult.data)
      if (referenceResult.data) {
        const buckets = bucketReferenceValues(referenceResult.data)
        setOrgJobPositions(referenceNames(buckets.job_position))
        setOrgJobLevels(referenceNames(buckets.job_level))
        setOrgEmployeeClasses(referenceNames(buckets.employee_class))
      }
      if (departmentsResult.data) {
        setAvailableDepartments(departmentsResult.data)
      }
      if (branchResult.data) {
        setOrgBranches(branchResult.data.map(b => b.name))
      }
    }
    load()
  }, [employeeId, user.org_id])

  async function reloadEmployee() {
    if (!employeeId) return
    const { data } = await supabase
      .from('employees')
      .select(EMPLOYEE_WITH_DEPTS_SELECT)
      .eq('id', employeeId)
      .single()
    if (data) setEmployee(data as EmployeeWithDepartments)
  }

  function goBack() {
    navigate('/dashboard/employees')
  }

  async function saveFields(partial: Partial<Employee>): Promise<{ error?: string }> {
    if (!employeeId) return { error: 'No employee id' }
    const { error } = await supabase
      .from('employees')
      .update(partial)
      .eq('id', employeeId)
    if (error) return { error: error.message }
    // Re-fetch with the department join so downstream readers always see
    // a consistent shape after any update.
    await reloadEmployee()
    // First successful save graduates this employee out of "new" state so
    // subsequent edits behave normally (no auto-edit, no discard-on-cancel).
    if (isNew) {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    return {}
  }

  async function saveDepartmentByName(name: string | null): Promise<{ error?: string }> {
    if (!employeeId) return { error: 'No employee id' }
    const result = await setEmployeePrimaryDepartment({
      employeeId,
      orgId: user.org_id,
      name,
      available: availableDepartments,
    })
    if (result.error) return { error: result.error }
    if (result.created) {
      setAvailableDepartments(prev =>
        [...prev, result.created!].sort((a, b) => a.name.localeCompare(b.name)),
      )
    }
    await reloadEmployee()
    return {}
  }

  async function handleDiscardNew() {
    if (!employee) return
    if (!confirm(t.empDiscardNewConfirm)) return
    await supabase.from('employees').delete().eq('id', employee.id)
    if (org && isPro(org)) {
      syncSeats().catch(err => console.error('sync-seats failed after discard-new:', err))
    }
    goBack()
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !employeeId) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setTopError(t.avatarInvalidType)
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setTopError(t.avatarTooLarge)
      return
    }

    setTopError('')
    setUploading(true)

    const ext = file.name.split('.').pop() || 'jpg'
    // Unguessable salted key (migration 163 hardening); each upload is a fresh object.
    const path = saltedAvatarKey(employeeId, ext)

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setTopError(uploadError.message)
      setUploading(false)
      return
    }

    // Remove the previous (differently-keyed) object so re-uploads don't orphan.
    const oldKey = avatarKeyFromUrl(employee?.photo_url)
    if (oldKey && oldKey !== path) {
      await supabase.storage.from('avatars').remove([oldKey])
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`

    const result = await saveFields({ photo_url: url })
    setUploading(false)
    if (result.error) setTopError(result.error)
  }

  async function handleRemoveAvatar() {
    if (!employee || !employeeId) return
    setUploading(true)

    const key = avatarKeyFromUrl(employee.photo_url)
    if (key) {
      await supabase.storage.from('avatars').remove([key])
    }

    const result = await saveFields({ photo_url: null })
    setUploading(false)
    if (result.error) setTopError(result.error)
  }

  async function handleSeparationConfirm(type: SeparationType, lastDay: string, reason: string) {
    const result = await saveFields({
      lifecycle_stage: 'separated',
      resign_date: lastDay,
      separation_type: type,
      separation_reason: reason || null,
      // Keep the legacy status column in sync so existing list filters
      // (terminated tab) continue to surface separated employees.
      status: 'terminated',
    })
    if (result.error) {
      throw new Error(result.error)
    }
    setSeparationType(null)
  }

  function handleDelete() {
    if (!employee) return
    setDeleteOpen(true)
  }

  function afterDeleted() {
    if (org && isPro(org)) {
      syncSeats().catch(err => console.error('sync-seats failed after delete:', err))
    }
    goBack()
  }

  if (!employee || !employeeId) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  }

  const portalUrl = `${window.location.origin}/portal/${employee.slug}-${employee.access_token}`
  const writeDisabledTitle = !canWrite ? t.dunningWriteBlocked : undefined
  const status = deriveEmployeeStatus(employee)

  function renderSection() {
    if (!employee || !employeeId) return null
    switch (activeSection) {
      case 'personal':
        return (
          <PersonalSection
            employee={employee}
            org={org}
            availableDepartments={availableDepartments}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
            saveDepartment={saveDepartmentByName}
            isNew={isNew}
            onDiscardNew={handleDiscardNew}
          />
        )
      case 'employment':
        return (
          <EmploymentSection
            employee={employee}
            organization={org}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
            activeContract={activeContract}
            contractSignedAt={contractSignedAt}
            branchOptions={orgBranches}
            jobPositionOptions={orgJobPositions}
            jobLevelOptions={orgJobLevels}
            employeeClassOptions={orgEmployeeClasses}
          />
        )
      case 'education':
        return (
          <EducationSection
            employee={employee}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
          />
        )
      case 'experience':
        return (
          <ExperienceSection
            employee={employee}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
          />
        )
      case 'additional':
        return (
          <AdditionalInfoSection
            employee={employee}
            employeeId={employeeId}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
          />
        )
      case 'documents':
        return (
          <div>
            <SectionHeader title={t.empNavDocuments} />
            <EmployeeAttachments employeeId={employeeId} disabled={!canWrite} />
          </div>
        )
      case 'linked_documents':
        return (
          <div>
            <SectionHeader title={t.empNavLinkedDocs} />
            <EmployeeDocuments employeeId={employeeId} />
          </div>
        )
      case 'compensation':
        return (
          <div>
            <SectionHeader title={t.empNavCompensation} />
            <CompensationSummary user={user} contract={activeContract} employeeId={employeeId} />
          </div>
        )
    }
  }

  return (
    <div>
      {topError && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {topError}
        </div>
      )}

      <div className="flex flex-col gap-6 md:flex-row">
        <EmployeeSidebar
          employeeId={employeeId}
          name={employee.name}
          photoUrl={employee.photo_url}
          status={status}
          portalUrl={portalUrl}
          uploading={uploading}
          onUpload={handleAvatarChange}
          onRemove={handleRemoveAvatar}
          active={activeSection}
          onSelect={setActiveSection}
          onResign={() => setSeparationType('resigned')}
          onTerminate={() => setSeparationType('terminated')}
          onDelete={handleDelete}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />
        <main className="min-w-0 flex-1">{renderSection()}</main>
      </div>

      {separationType && (
        <SeparationModal
          type={separationType}
          employeeName={employee.name}
          onCancel={() => setSeparationType(null)}
          onConfirm={(lastDay, reason) => handleSeparationConfirm(separationType, lastDay, reason)}
        />
      )}

      <DeleteEmployeeModal
        open={deleteOpen}
        target={deleteOpen && employee ? { kind: 'single', id: employee.id, name: employee.name } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={afterDeleted}
      />
    </div>
  )
}
