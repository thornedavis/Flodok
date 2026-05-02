import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { AchievementsSection } from '../../components/employee/AchievementsSection'
import { CompensationOverview } from '../../components/employee/CompensationOverview'
import { EmployeeActivityLog } from '../../components/employee/EmployeeActivityLog'
import { EmployeeSidebar, type EmployeeSectionKey } from '../../components/employee/EmployeeSidebar'
import { SectionHeader } from '../../components/employee/SectionHeader'
import { PersonalSection } from '../../components/employee/sections/PersonalSection'
import { EmploymentSection } from '../../components/employee/sections/EmploymentSection'
import { EducationSection } from '../../components/employee/sections/EducationSection'
import { ExperienceSection } from '../../components/employee/sections/ExperienceSection'
import { AdditionalInfoSection } from '../../components/employee/sections/AdditionalInfoSection'
import { isPro, syncSeats } from '../../lib/billing'
import { useBilling } from '../../contexts/BillingContext'
import type { User, Employee, Organization, Contract } from '../../types/aliases'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type EmployeeStatus = 'probation' | 'active' | 'suspended' | 'terminated'

export function EmployeeEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id: employeeId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const isNew = searchParams.get('new') === '1'

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [contractSignedAt, setContractSignedAt] = useState<string | null>(null)
  const [orgDepartments, setOrgDepartments] = useState<string[]>([])
  const [allowanceRefreshKey, setAllowanceRefreshKey] = useState(0)
  const [activeSection, setActiveSection] = useState<EmployeeSectionKey>('personal')

  const [uploading, setUploading] = useState(false)
  const [topError, setTopError] = useState('')

  useBreadcrumbTrailing(employee?.name ?? null)

  useEffect(() => {
    if (!employeeId) return
    const id = employeeId
    async function load() {
      const [empResult, orgResult, allEmpsResult, contractResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', id).single(),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('employees').select('department, departments').eq('org_id', user.org_id),
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

      if (empResult.data) setEmployee(empResult.data)
      setOrg(orgResult.data)
      if (allEmpsResult.data) {
        const all = new Set<string>()
        for (const e of allEmpsResult.data) {
          if (e.department) all.add(e.department)
          for (const d of e.departments || []) all.add(d)
        }
        setOrgDepartments([...all].sort())
      }
    }
    load()
  }, [employeeId, user.org_id])

  function goBack() {
    navigate('/dashboard/employees')
  }

  async function saveFields(partial: Partial<Employee>): Promise<{ error?: string }> {
    if (!employeeId) return { error: 'No employee id' }
    const { data, error } = await supabase
      .from('employees')
      .update(partial)
      .eq('id', employeeId)
      .select()
      .single()
    if (error) return { error: error.message }
    if (data) setEmployee(data)
    // First successful save graduates this employee out of "new" state so
    // subsequent edits behave normally (no auto-edit, no discard-on-cancel).
    if (isNew) {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
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

    const ext = file.name.split('.').pop()
    const path = `${employeeId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setTopError(uploadError.message)
      setUploading(false)
      return
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

    const ext = employee.photo_url?.split('.').pop()?.split('?')[0]
    if (ext) {
      await supabase.storage.from('avatars').remove([`${employeeId}.${ext}`])
    }

    const result = await saveFields({ photo_url: null })
    setUploading(false)
    if (result.error) setTopError(result.error)
  }

  async function handleStatusChange(next: EmployeeStatus) {
    const result = await saveFields({ status: next })
    if (result.error) setTopError(result.error)
  }

  async function handleDelete() {
    if (!employee) return
    if (!confirm(t.deleteEmployeeConfirm(employee.name))) return
    await supabase.from('employees').delete().eq('id', employee.id)
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
  const status: EmployeeStatus =
    (employee.status === 'archived' ? 'terminated' : (employee.status as EmployeeStatus | null)) || 'probation'

  function renderSection() {
    if (!employee || !employeeId) return null
    switch (activeSection) {
      case 'personal':
        return (
          <PersonalSection
            employee={employee}
            org={org}
            orgDepartments={orgDepartments}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
            isNew={isNew}
            onDiscardNew={handleDiscardNew}
          />
        )
      case 'employment':
        return (
          <EmploymentSection
            employee={employee}
            canWrite={canWrite}
            writeDisabledTitle={writeDisabledTitle}
            saveFields={saveFields}
            activeContract={activeContract}
            contractSignedAt={contractSignedAt}
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
      case 'compensation':
        return org ? (
          <div>
            <SectionHeader title={t.empNavCompensation} />
            <div className="space-y-10">
              <CompensationOverview
                user={user}
                employeeId={employeeId}
                contract={activeContract}
                photoUrl={employee.photo_url}
                divisor={org.credits_divisor}
                refreshKey={allowanceRefreshKey}
                onChange={() => setAllowanceRefreshKey(k => k + 1)}
              />
              <EmployeeActivityLog employeeId={employeeId} refreshKey={allowanceRefreshKey} />
            </div>
          </div>
        ) : null
      case 'achievements':
        return (
          <div>
            <SectionHeader title={t.empNavAchievements} />
            <AchievementsSection
              user={user}
              employeeId={employeeId}
              employee={employee}
              activeContract={activeContract}
            />
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
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          canWrite={canWrite}
          writeDisabledTitle={writeDisabledTitle}
        />
        <main className="min-w-0 flex-1">{renderSection()}</main>
      </div>
    </div>
  )
}
