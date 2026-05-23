import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useRole } from '../../hooks/useRole'
import { AvatarUpload } from '../../components/AvatarUpload'
import { Skeleton } from '../../components/Skeleton'
import { PhoneInput } from '../../components/PhoneInput'
import { AddressFields, type AddressValue } from '../../components/AddressFields'
import { isValidE164 } from '../../lib/phone'
import {
  COMPANY_REFERENCE_KINDS,
  bucketReferenceValues,
  getReferenceUsage,
  type CompanyReferenceKind,
} from '../../lib/companyReference'
import type { CompanyBranch, CompanyDepartment, CompanyReferenceValue, Employee, Organization, User } from '../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const EMPTY_ADDRESS: AddressValue = { street: '', city: '', province: '', postal_code: '', country: 'ID' }

type CompanyTab = 'profile' | 'structure' | 'assets' | 'activity'

type KindConfig = {
  kind: CompanyReferenceKind
  title: string
  description: string
}

type ProfileForm = {
  orgName: string
  displayName: string
  orgPhone: string
  companyEmail: string
  websiteUrl: string
  industry: string
  companySizeRange: string
  npwp15: string
  npwp16: string
  nitku: string
  taxableDate: string
  taxPersonName: string
  taxPersonNpwp15: string
  taxPersonNpwp16: string
  bpjsKetenagakerjaanNumber: string
  jkkRate: string
  kluCode: string
  companyRegistrationNumber: string
  businessLicenseNumber: string
  payDayOfMonth: string
  timezone: string
}

const COMPANY_TABS: CompanyTab[] = ['profile', 'structure', 'assets', 'activity']

// Compose the confirm() message shown before deleting a department,
// branch, or reference value (job position / level / class). Surfaces
// the three things that can make a delete consequential: employees
// currently denormalised against the name, SOPs that target it as an
// audience, and (departments only) SOPs that name it as owner. All of
// those are detached transactionally on the server — the confirm just
// makes sure the user knows what's about to happen.
function buildDeleteConfirmMessage(
  name: string,
  employeeUsage: number,
  audienceCount: number,
  ownerCount: number = 0,
): string {
  const parts: string[] = []
  if (employeeUsage > 0) parts.push(`${employeeUsage} ${employeeUsage === 1 ? 'employee' : 'employees'}`)
  if (audienceCount > 0) parts.push(`${audienceCount} SOP ${audienceCount === 1 ? 'audience' : 'audiences'}`)
  if (ownerCount > 0) parts.push(`${ownerCount} SOP ${ownerCount === 1 ? 'owner' : 'owners'}`)
  if (parts.length === 0) {
    return `Delete "${name}"?`
  }
  return `Delete "${name}"? It's referenced by ${parts.join(', ')} and will be detached from each.`
}

function parseTab(value: string | null): CompanyTab {
  return COMPANY_TABS.find(t => t === value) ?? 'profile'
}

export function Company({ user }: { user: User }) {
  const { t } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  function selectTab(next: CompanyTab) {
    const params = new URLSearchParams(searchParams)
    if (next === 'profile') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.companyTitle}</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.companySubtitle}
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--color-border)' }}>
        <TabButton active={tab === 'profile'} onClick={() => selectTab('profile')}>{t.companyTabProfile}</TabButton>
        <TabButton active={tab === 'structure'} onClick={() => selectTab('structure')}>{t.companyTabStructure}</TabButton>
        <TabButton active={tab === 'assets'} onClick={() => selectTab('assets')}>{t.companyTabAssets}</TabButton>
        <TabButton active={tab === 'activity'} onClick={() => selectTab('activity')}>{t.companyTabActivity}</TabButton>
      </div>

      {tab === 'profile' && <CompanyProfileTab user={user} />}
      {tab === 'structure' && <CompanyStructureTab user={user} />}
      {tab === 'assets' && <Placeholder title={t.companyTabAssets} body={t.companyAssetsPlaceholder} />}
      {tab === 'activity' && <Placeholder title={t.companyTabActivity} body={t.companyActivityPlaceholder} />}
    </div>
  )
}

// Branded loading state for the profile form: a logo block + a grid of field
// placeholders so the form doesn't pop in once the org loads.
function CompanyFormSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <section className="space-y-5">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2 h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function CompanyProfileTab({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const { canWrite: billingCanWrite } = useBilling()
  const [org, setOrg] = useState<Organization | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS)
  const [form, setForm] = useState<ProfileForm>(emptyProfileForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const { data } = await supabase.from('organizations').select('*').eq('id', user.org_id).single()
    if (!data) return
    setOrg(data)
    setLogoUrl(data.logo_url)
    setAddress(addressFromOrg(data))
    setForm(profileFormFromOrg(data))
  }

  async function handleLogoChange(url: string | null) {
    const previous = logoUrl
    setLogoUrl(url)
    const { data, error } = await supabase
      .from('organizations')
      .update({ logo_url: url })
      .eq('id', user.org_id)
      .select()
      .single()
    if (error || !data) {
      alert(error?.message || 'Could not save organization logo. Please try again.')
      setLogoUrl(previous)
      return
    }
    setOrg(data)
  }

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const parsedPayDay = Number(form.payDayOfMonth)
  const phoneValid = !form.orgPhone || isValidE164(form.orgPhone)
  const payDayValid = Number.isFinite(parsedPayDay) && Number.isInteger(parsedPayDay) && parsedPayDay >= 0 && parsedPayDay <= 28
  const dirty = !!org && profileDirty(org, form, address) && form.orgName.trim().length > 0 && phoneValid && payDayValid

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    const { data, error } = await supabase.from('organizations').update({
      name: form.orgName.trim(),
      display_name: form.displayName.trim() || null,
      phone: form.orgPhone || null,
      company_email: form.companyEmail.trim() || null,
      website_url: form.websiteUrl.trim() || null,
      industry: form.industry.trim() || null,
      company_size_range: form.companySizeRange.trim() || null,
      npwp_15: form.npwp15.trim() || null,
      npwp_16: form.npwp16.trim() || null,
      nitku: form.nitku.trim() || null,
      taxable_date: form.taxableDate || null,
      tax_person_name: form.taxPersonName.trim() || null,
      tax_person_npwp_15: form.taxPersonNpwp15.trim() || null,
      tax_person_npwp_16: form.taxPersonNpwp16.trim() || null,
      bpjs_ketenagakerjaan_number: form.bpjsKetenagakerjaanNumber.trim() || null,
      jkk_rate: form.jkkRate.trim() || null,
      klu_code: form.kluCode.trim() || null,
      company_registration_number: form.companyRegistrationNumber.trim() || null,
      business_license_number: form.businessLicenseNumber.trim() || null,
      address_street: address.street.trim() || null,
      address_city: address.city.trim() || null,
      address_province: address.province.trim() || null,
      address_postal_code: address.postal_code.trim() || null,
      address_country: address.country,
      pay_day_of_month: parsedPayDay,
      timezone: form.timezone,
    }).eq('id', user.org_id).select().single()
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    if (data) {
      setOrg(data)
      setAddress(addressFromOrg(data))
      setForm(profileFormFromOrg(data))
    }
  }

  function handleCancel() {
    if (!org) return
    setAddress(addressFromOrg(org))
    setForm(profileFormFromOrg(org))
  }

  if (!org) return <CompanyFormSkeleton />

  return (
    <form id="company-profile-form" onSubmit={handleSave} className="space-y-8">
      <SectionHeader
        title={t.companyProfileSection}
        actions={isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || !dirty}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={saving || !billingCanWrite || !dirty}
              title={!billingCanWrite ? t.dunningWriteBlocked : undefined}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        )}
      />

      {!isAdmin && <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.adminOnlyHint}</p>}

      <section className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationLogoLabel}</label>
          <AvatarUpload
            id={user.org_id}
            storagePrefix="org"
            photoUrl={logoUrl}
            label={form.orgName || org.name}
            disabled={!isAdmin}
            onChange={handleLogoChange}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <TextField label={t.organizationLegalName} value={form.orgName} onChange={v => update('orgName', v)} required disabled={!isAdmin} help={t.organizationLegalNameHelp} />
          <TextField label={t.organizationDisplayName} value={form.displayName} onChange={v => update('displayName', v)} disabled={!isAdmin} placeholder={form.orgName} help={t.organizationDisplayNameHelp} />
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationPhoneLabel}</label>
            {isAdmin ? (
              <PhoneInput value={form.orgPhone} onChange={v => update('orgPhone', v)} defaultCountryCode={org.default_country_code} />
            ) : (
              <input value={form.orgPhone} readOnly className="w-full rounded-lg border px-3 py-2 text-sm" style={disabledInputStyle()} />
            )}
          </div>
          <TextField label={t.companyEmailLabel} value={form.companyEmail} onChange={v => update('companyEmail', v)} disabled={!isAdmin} type="email" />
          <TextField label={t.companyWebsiteLabel} value={form.websiteUrl} onChange={v => update('websiteUrl', v)} disabled={!isAdmin} placeholder="https://example.com" />
          <TextField label={t.companyIndustryLabel} value={form.industry} onChange={v => update('industry', v)} disabled={!isAdmin} />
          <TextField label={t.companySizeLabel} value={form.companySizeRange} onChange={v => update('companySizeRange', v)} disabled={!isAdmin} placeholder="0-50" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationAddressLabel}</label>
          <AddressFields value={address} onChange={setAddress} disabled={!isAdmin} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader title={t.companyTaxSection} />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label={t.companyNpwp15Label} value={form.npwp15} onChange={v => update('npwp15', v)} disabled={!isAdmin} />
          <TextField label={t.companyNpwp16Label} value={form.npwp16} onChange={v => update('npwp16', v)} disabled={!isAdmin} />
          <TextField label={t.companyNitkuLabel} value={form.nitku} onChange={v => update('nitku', v)} disabled={!isAdmin} />
          <TextField label={t.companyTaxableDateLabel} value={form.taxableDate} onChange={v => update('taxableDate', v)} disabled={!isAdmin} type="date" />
          <TextField label={t.companyTaxPersonNameLabel} value={form.taxPersonName} onChange={v => update('taxPersonName', v)} disabled={!isAdmin} />
          <TextField label={t.companyTaxPersonNpwp15Label} value={form.taxPersonNpwp15} onChange={v => update('taxPersonNpwp15', v)} disabled={!isAdmin} />
          <TextField label={t.companyTaxPersonNpwp16Label} value={form.taxPersonNpwp16} onChange={v => update('taxPersonNpwp16', v)} disabled={!isAdmin} />
          <TextField label={t.companyKluCodeLabel} value={form.kluCode} onChange={v => update('kluCode', v)} disabled={!isAdmin} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeader title={t.companyOperationsSection} />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField label={t.companyRegistrationNumberLabel} value={form.companyRegistrationNumber} onChange={v => update('companyRegistrationNumber', v)} disabled={!isAdmin} />
          <TextField label={t.companyBusinessLicenseNumberLabel} value={form.businessLicenseNumber} onChange={v => update('businessLicenseNumber', v)} disabled={!isAdmin} />
          <TextField label={t.companyBpjsKetenagakerjaanLabel} value={form.bpjsKetenagakerjaanNumber} onChange={v => update('bpjsKetenagakerjaanNumber', v)} disabled={!isAdmin} />
          <TextField label={t.companyJkkRateLabel} value={form.jkkRate} onChange={v => update('jkkRate', v)} disabled={!isAdmin} placeholder="0.24%" />
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.payDayLabel}</label>
            <select
              value={form.payDayOfMonth}
              onChange={e => update('payDayOfMonth', e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={isAdmin ? inputStyle : disabledInputStyle()}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <option key={day} value={String(day)}>
                  {lang === 'id' ? `Tanggal ${day}` : ordinal(day)}
                </option>
              ))}
              <option value="0">{t.payDayOptionLast}</option>
            </select>
            {payDayValid && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t.payDayPreview.replace(
                  '{date}',
                  new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(nextCloseDate(parsedPayDay, todayInWIB())),
                )}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.timezoneLabel}</label>
            <select
              value={form.timezone}
              onChange={e => update('timezone', e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={isAdmin ? inputStyle : disabledInputStyle()}
            >
              <option value="Asia/Jakarta">{t.timezoneWib}</option>
              <option value="Asia/Makassar">{t.timezoneWita}</option>
              <option value="Asia/Jayapura">{t.timezoneWit}</option>
            </select>
          </div>
        </div>
      </section>
    </form>
  )
}

type DepartmentSection = 'departments' | 'branch_table'
type SavingTarget = CompanyReferenceKind | DepartmentSection | null

/** A user who is also linked to an employee record — eligible to be set as
 *  a department's manager. We require the user link because the manager
 *  needs to be able to log in and act on approval items. */
type ManagerCandidate = { employee_id: string; user_name: string; employee_name: string }

// Branded loading state for the structure tab: a hint strip + a two-column grid
// of section-card placeholders matching the departments/branches layout.
function CompanyStructureSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <Skeleton className="mb-6 h-12 w-full rounded-lg" />
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-2 h-2.5 w-2/3" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompanyStructureTab({ user }: { user: User }) {
  const { t } = useLang()
  const { canWrite } = useBilling()
  const [values, setValues] = useState<CompanyReferenceValue[]>([])
  const [branches, setBranches] = useState<CompanyBranch[]>([])
  const [departments, setDepartments] = useState<CompanyDepartment[]>([])
  const [departmentCounts, setDepartmentCounts] = useState<Map<string, number>>(new Map())
  const [managerCandidates, setManagerCandidates] = useState<ManagerCandidate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKind, setSavingKind] = useState<SavingTarget>(null)
  const [addNames, setAddNames] = useState<Record<CompanyReferenceKind, string>>({
    job_position: '',
    job_level: '',
    employee_class: '',
  })
  const [branchName, setBranchName] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [message, setMessage] = useState('')

  const configs: KindConfig[] = useMemo(() => [
    { kind: 'job_position', title: t.companyJobPositionsTitle, description: t.companyJobPositionsDesc },
    { kind: 'job_level', title: t.companyJobLevelsTitle, description: t.companyJobLevelsDesc },
    { kind: 'employee_class', title: t.companyEmployeeClassesTitle, description: t.companyEmployeeClassesDesc },
  ], [t])

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    setLoading(true)
    const [valueResult, branchResult, departmentResult, deptLinkResult, employeeResult, managerResult] = await Promise.all([
      supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
      supabase.from('company_branches').select('*').eq('org_id', user.org_id).order('name'),
      supabase.from('company_departments').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
      supabase.from('employee_departments').select('department_id, employee_id, employee:employees!inner(org_id)').eq('employee.org_id', user.org_id),
      supabase.from('employees').select('*').eq('org_id', user.org_id),
      // Eligible department managers: users in this org who are linked to an
      // employee record. The manager_employee_id FK on company_departments
      // points at the employee, but only those with a login can act on
      // approval items.
      supabase.from('users')
        .select('name, employee_id, employee:employees!inner(id, name, org_id)')
        .eq('org_id', user.org_id)
        .not('employee_id', 'is', null),
    ])
    setValues(valueResult.data || [])
    setBranches(branchResult.data || [])
    setDepartments(departmentResult.data || [])
    const counts = new Map<string, number>()
    for (const link of deptLinkResult.data || []) {
      counts.set(link.department_id, (counts.get(link.department_id) ?? 0) + 1)
    }
    setDepartmentCounts(counts)
    setEmployees(employeeResult.data || [])
    const candidates: ManagerCandidate[] = []
    for (const row of (managerResult.data ?? []) as Array<{ name: string | null; employee_id: string | null; employee: { id: string; name: string; org_id: string } | null }>) {
      if (row.employee_id && row.employee) {
        candidates.push({
          employee_id: row.employee_id,
          user_name: row.name ?? row.employee.name,
          employee_name: row.employee.name,
        })
      }
    }
    candidates.sort((a, b) => a.user_name.localeCompare(b.user_name))
    setManagerCandidates(candidates)
    setLoading(false)
  }

  const buckets = bucketReferenceValues(values)
  const usageByKind = useMemo(() => {
    const next = new Map<CompanyReferenceKind, Map<string, number>>()
    for (const kind of COMPANY_REFERENCE_KINDS) {
      next.set(kind, getReferenceUsage(kind, employees))
    }
    return next
  }, [employees])

  function isTaken(kind: CompanyReferenceKind, name: string, exceptId?: string) {
    const clean = name.trim().toLowerCase()
    return values.some(v => v.kind === kind && v.id !== exceptId && v.name.trim().toLowerCase() === clean)
  }

  function branchTaken(name: string, exceptId?: string) {
    const clean = name.trim().toLowerCase()
    return branches.some(b => b.id !== exceptId && b.name.trim().toLowerCase() === clean)
  }

  async function handleAdd(kind: CompanyReferenceKind) {
    if (!canWrite) return
    const name = addNames[kind].trim()
    if (!name) return
    if (isTaken(kind, name)) {
      alert(t.companyReferenceTaken)
      return
    }
    setSavingKind(kind)
    const displayOrder = buckets[kind].length
    const { error } = await supabase.from('company_reference_values').insert({
      org_id: user.org_id,
      kind,
      name,
      display_order: displayOrder,
    })
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setAddNames(prev => ({ ...prev, [kind]: '' }))
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function updateEmployeeValues(kind: CompanyReferenceKind, oldName: string, nextName: string | null) {
    const column = employeeColumnForKind(kind)
    if (!column) return
    await supabase.from('employees').update({ [column]: nextName } as Partial<Employee>).eq('org_id', user.org_id).eq(column, oldName)
  }

  async function handleRename(value: CompanyReferenceValue) {
    if (!canWrite) return
    const kind = value.kind as CompanyReferenceKind
    const nextName = prompt(t.companyReferenceRenamePrompt(value.name), value.name)?.trim()
    if (!nextName || nextName === value.name) return
    if (isTaken(kind, nextName, value.id)) {
      alert(t.companyReferenceTaken)
      return
    }

    setSavingKind(kind)
    const { error } = await supabase.from('company_reference_values').update({ name: nextName }).eq('id', value.id)
    if (!error) await updateEmployeeValues(kind, value.name, nextName)
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleDelete(value: CompanyReferenceValue) {
    if (!canWrite) return
    const kind = value.kind as CompanyReferenceKind
    const usage = usageByKind.get(kind)?.get(value.name.toLowerCase()) ?? 0
    const { count: audienceCount } = await supabase
      .from('sop_audience')
      .select('id', { count: 'exact', head: true })
      .eq('reference_id', value.id)
    const ok = confirm(buildDeleteConfirmMessage(value.name, usage, audienceCount ?? 0))
    if (!ok) return

    // The new RPC handles audience detach + employee column null-out
    // + the actual delete transactionally, so the previous two-step
    // (delete + updateEmployeeValues) is replaced by a single call.
    setSavingKind(kind)
    const { error } = await supabase.rpc('delete_reference_value', { p_id: value.id })
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  function departmentTaken(name: string, exceptId?: string) {
    const clean = name.trim().toLowerCase()
    return departments.some(d => d.id !== exceptId && d.name.trim().toLowerCase() === clean)
  }

  async function handleAddDepartment() {
    if (!canWrite) return
    const name = departmentName.trim()
    if (!name) return
    if (departmentTaken(name)) {
      alert(t.companyReferenceTaken)
      return
    }
    setSavingKind('departments')
    const { error } = await supabase.from('company_departments').insert({
      org_id: user.org_id,
      name,
      display_order: departments.length,
    })
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setDepartmentName('')
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleRenameDepartment(dept: CompanyDepartment) {
    if (!canWrite) return
    const nextName = prompt(t.companyReferenceRenamePrompt(dept.name), dept.name)?.trim()
    if (!nextName || nextName === dept.name) return
    if (departmentTaken(nextName, dept.id)) {
      alert(t.companyReferenceTaken)
      return
    }
    setSavingKind('departments')
    const { error } = await supabase.from('company_departments').update({ name: nextName }).eq('id', dept.id)
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleSetDepartmentManager(dept: CompanyDepartment, employeeId: string | null) {
    if (!canWrite) return
    setSavingKind('departments')
    const { error } = await supabase
      .from('company_departments')
      .update({ manager_employee_id: employeeId })
      .eq('id', dept.id)
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleDeleteDepartment(dept: CompanyDepartment) {
    if (!canWrite) return
    const usage = departmentCounts.get(dept.id) ?? 0
    const [audienceRes, ownerRes] = await Promise.all([
      supabase.from('sop_audience').select('id', { count: 'exact', head: true }).eq('department_id', dept.id),
      supabase.from('sops').select('id', { count: 'exact', head: true }).eq('owner_department_id', dept.id).is('deleted_at', null),
    ])
    const ok = confirm(buildDeleteConfirmMessage(dept.name, usage, audienceRes.count ?? 0, ownerRes.count ?? 0))
    if (!ok) return
    setSavingKind('departments')
    // delete_department RPC detaches sop_audience rows transactionally
    // before the DELETE; owner_department_id is ON DELETE SET NULL so
    // owning SOPs auto-detach. employee_departments has its own
    // ON DELETE CASCADE.
    const { error } = await supabase.rpc('delete_department', { p_id: dept.id })
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleAddBranch() {
    if (!canWrite) return
    const name = branchName.trim()
    if (!name) return
    if (branchTaken(name)) {
      alert(t.companyReferenceTaken)
      return
    }
    setSavingKind('branch_table')
    const { error } = await supabase.from('company_branches').insert({ org_id: user.org_id, name })
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setBranchName('')
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleRenameBranch(branch: CompanyBranch) {
    if (!canWrite) return
    const nextName = prompt(t.companyReferenceRenamePrompt(branch.name), branch.name)?.trim()
    if (!nextName || nextName === branch.name) return
    if (branchTaken(nextName, branch.id)) {
      alert(t.companyReferenceTaken)
      return
    }
    setSavingKind('branch_table')
    const { error } = await supabase.from('company_branches').update({ name: nextName }).eq('id', branch.id)
    if (!error) await supabase.from('employees').update({ branch_name: nextName }).eq('org_id', user.org_id).eq('branch_name', branch.name)
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  async function handleDeleteBranch(branch: CompanyBranch) {
    if (!canWrite) return
    const usage = employees.filter(e => sameName(e.branch_name || '', branch.name)).length
    const { count: audienceCount } = await supabase
      .from('sop_audience')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branch.id)
    const ok = confirm(buildDeleteConfirmMessage(branch.name, usage, audienceCount ?? 0))
    if (!ok) return
    setSavingKind('branch_table')
    // delete_branch RPC detaches sop_audience rows + nulls employee
    // branch_name + deletes the branch row in one transaction.
    const { error } = await supabase.rpc('delete_branch', { p_id: branch.id })
    setSavingKind(null)
    if (error) {
      alert(error.message)
      return
    }
    setMessage(t.companyReferenceSaved)
    loadData()
  }

  if (loading) return <CompanyStructureSkeleton />

  return (
    <div>
      <div className="mb-6 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
        {t.companySetupHint}
      </div>

      {message && (
        <div className="mb-4 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)', color: 'var(--color-success)' }}>
          {message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <DepartmentSection
          departments={departments}
          counts={departmentCounts}
          managerCandidates={managerCandidates}
          addName={departmentName}
          saving={savingKind === 'departments'}
          disabled={!canWrite}
          title={t.companyDepartmentsTitle}
          description={t.companyDepartmentsDesc}
          onAdd={handleAddDepartment}
          onAddNameChange={setDepartmentName}
          onRename={handleRenameDepartment}
          onDelete={handleDeleteDepartment}
          onSetManager={handleSetDepartmentManager}
        />
        <BranchSection
          branches={branches}
          employees={employees}
          addName={branchName}
          saving={savingKind === 'branch_table'}
          disabled={!canWrite}
          onAdd={handleAddBranch}
          onAddNameChange={setBranchName}
          onRename={handleRenameBranch}
          onDelete={handleDeleteBranch}
        />
        {configs.map(config => (
          <ReferenceSection
            key={config.kind}
            config={config}
            values={buckets[config.kind]}
            usage={usageByKind.get(config.kind) ?? new Map()}
            addName={addNames[config.kind]}
            saving={savingKind === config.kind}
            disabled={!canWrite}
            onAdd={() => handleAdd(config.kind)}
            onAddNameChange={name => setAddNames(prev => ({ ...prev, [config.kind]: name }))}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

function DepartmentSection({
  departments,
  counts,
  managerCandidates,
  addName,
  saving,
  disabled,
  title,
  description,
  onAdd,
  onAddNameChange,
  onRename,
  onDelete,
  onSetManager,
}: {
  departments: CompanyDepartment[]
  counts: Map<string, number>
  managerCandidates: ManagerCandidate[]
  addName: string
  saving: boolean
  disabled: boolean
  title: string
  description: string
  onAdd: () => void
  onAddNameChange: (name: string) => void
  onRename: (dept: CompanyDepartment) => void
  onDelete: (dept: CompanyDepartment) => void
  onSetManager: (dept: CompanyDepartment, employeeId: string | null) => void
}) {
  const { t } = useLang()
  return (
    <SimpleListSection
      title={title}
      description={description}
      empty={t.companyReferenceEmpty}
      addName={addName}
      saving={saving}
      disabled={disabled}
      onAdd={onAdd}
      onAddNameChange={onAddNameChange}
    >
      {departments.map(dept => {
        const used = counts.get(dept.id) ?? 0
        return (
          <DepartmentRow
            key={dept.id}
            dept={dept}
            subtitle={used > 0 ? t.companyReferenceInUseCount(used) : t.companyReferenceUnused}
            managerCandidates={managerCandidates}
            disabled={disabled}
            onRename={() => onRename(dept)}
            onDelete={() => onDelete(dept)}
            onSetManager={employeeId => onSetManager(dept, employeeId)}
          />
        )
      })}
    </SimpleListSection>
  )
}

function DepartmentRow({
  dept,
  subtitle,
  managerCandidates,
  disabled,
  onRename,
  onDelete,
  onSetManager,
}: {
  dept: CompanyDepartment
  subtitle: string
  managerCandidates: ManagerCandidate[]
  disabled: boolean
  onRename: () => void
  onDelete: () => void
  onSetManager: (employeeId: string | null) => void
}) {
  const { t } = useLang()
  const noCandidates = managerCandidates.length === 0
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{dept.name}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onRename} disabled={disabled} className="rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40" style={{ color: 'var(--color-primary)' }}>
            {t.edit}
          </button>
          <button type="button" onClick={onDelete} disabled={disabled} className="rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40" style={{ color: 'var(--color-danger)' }}>
            {t.delete}
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span style={{ color: 'var(--color-text-tertiary)' }}>{t.companyDepartmentManagerLabel}</span>
        <select
          value={dept.manager_employee_id ?? ''}
          onChange={e => onSetManager(e.target.value || null)}
          disabled={disabled || noCandidates}
          className="min-w-0 max-w-[60%] truncate rounded-md border px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          aria-label={t.companyDepartmentManagerLabel}
        >
          <option value="">{noCandidates ? t.companyDepartmentManagerNoCandidates : t.companyDepartmentManagerNone}</option>
          {managerCandidates.map(c => (
            <option key={c.employee_id} value={c.employee_id}>{c.user_name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function BranchSection({
  branches,
  employees,
  addName,
  saving,
  disabled,
  onAdd,
  onAddNameChange,
  onRename,
  onDelete,
}: {
  branches: CompanyBranch[]
  employees: Employee[]
  addName: string
  saving: boolean
  disabled: boolean
  onAdd: () => void
  onAddNameChange: (name: string) => void
  onRename: (value: CompanyBranch) => void
  onDelete: (value: CompanyBranch) => void
}) {
  const { t } = useLang()
  const usage = new Map<string, number>()
  for (const employee of employees) {
    if (!employee.branch_name) continue
    const key = employee.branch_name.toLowerCase()
    usage.set(key, (usage.get(key) ?? 0) + 1)
  }

  return (
    <SimpleListSection
      title={t.companyBranchesTitle}
      description={t.companyBranchesDesc}
      empty={t.companyReferenceEmpty}
      addName={addName}
      saving={saving}
      disabled={disabled}
      onAdd={onAdd}
      onAddNameChange={onAddNameChange}
    >
      {branches.map(branch => {
        const used = usage.get(branch.name.toLowerCase()) ?? 0
        return (
          <ValueRow
            key={branch.id}
            name={branch.name}
            subtitle={used > 0 ? t.companyReferenceInUseCount(used) : t.companyReferenceUnused}
            disabled={disabled}
            onRename={() => onRename(branch)}
            onDelete={() => onDelete(branch)}
          />
        )
      })}
    </SimpleListSection>
  )
}

function ReferenceSection({
  config,
  values,
  usage,
  addName,
  saving,
  disabled,
  onAdd,
  onAddNameChange,
  onRename,
  onDelete,
}: {
  config: KindConfig
  values: CompanyReferenceValue[]
  usage: Map<string, number>
  addName: string
  saving: boolean
  disabled: boolean
  onAdd: () => void
  onAddNameChange: (name: string) => void
  onRename: (value: CompanyReferenceValue) => void
  onDelete: (value: CompanyReferenceValue) => void
}) {
  const { t } = useLang()
  return (
    <SimpleListSection
      title={config.title}
      description={config.description}
      empty={t.companyReferenceEmpty}
      addName={addName}
      saving={saving}
      disabled={disabled}
      onAdd={onAdd}
      onAddNameChange={onAddNameChange}
    >
      {values.map(value => {
        const used = usage.get(value.name.toLowerCase()) ?? 0
        return (
          <ValueRow
            key={value.id}
            name={value.name}
            subtitle={used > 0 ? t.companyReferenceInUseCount(used) : t.companyReferenceUnused}
            disabled={disabled}
            onRename={() => onRename(value)}
            onDelete={() => onDelete(value)}
          />
        )
      })}
    </SimpleListSection>
  )
}

function SimpleListSection({
  title,
  description,
  empty,
  addName,
  saving,
  disabled,
  onAdd,
  onAddNameChange,
  children,
}: {
  title: string
  description: string
  empty: string
  addName: string
  saving: boolean
  disabled: boolean
  onAdd: () => void
  onAddNameChange: (name: string) => void
  children: React.ReactNode
}) {
  const { t } = useLang()
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <div className="mb-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={addName}
          disabled={disabled}
          onChange={e => onAddNameChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAdd()
            }
          }}
          placeholder={t.companyReferenceAddPlaceholder}
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled || saving || !addName.trim()}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {saving ? t.saving : t.add}
        </button>
      </div>

      {hasChildren ? (
        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>{children}</div>
      ) : (
        <p className="py-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{empty}</p>
      )}
    </section>
  )
}

function ValueRow({ name, subtitle, disabled, onRename, onDelete }: {
  name: string
  subtitle: string
  disabled: boolean
  onRename: () => void
  onDelete: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{name}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{subtitle}</p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onRename} disabled={disabled} className="rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40" style={{ color: 'var(--color-primary)' }}>
          {t.edit}
        </button>
        <button type="button" onClick={onDelete} disabled={disabled} className="rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40" style={{ color: 'var(--color-danger)' }}>
          {t.delete}
        </button>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="relative px-4 py-2 text-sm font-medium transition-colors" style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
      {children}
      {active && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />}
    </button>
  )
}

function SectionHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      {actions}
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  required,
  help,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  required?: boolean
  help?: string
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        readOnly={disabled}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={disabled ? disabledInputStyle() : inputStyle}
      />
      {help && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{help}</p>}
    </div>
  )
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{body}</p>
    </div>
  )
}

function emptyProfileForm(): ProfileForm {
  return {
    orgName: '',
    displayName: '',
    orgPhone: '',
    companyEmail: '',
    websiteUrl: '',
    industry: '',
    companySizeRange: '',
    npwp15: '',
    npwp16: '',
    nitku: '',
    taxableDate: '',
    taxPersonName: '',
    taxPersonNpwp15: '',
    taxPersonNpwp16: '',
    bpjsKetenagakerjaanNumber: '',
    jkkRate: '',
    kluCode: '',
    companyRegistrationNumber: '',
    businessLicenseNumber: '',
    payDayOfMonth: '1',
    timezone: 'Asia/Jakarta',
  }
}

function profileFormFromOrg(org: Organization): ProfileForm {
  return {
    orgName: org.name,
    displayName: org.display_name || '',
    orgPhone: org.phone || '',
    companyEmail: org.company_email || '',
    websiteUrl: org.website_url || '',
    industry: org.industry || '',
    companySizeRange: org.company_size_range || '',
    npwp15: org.npwp_15 || '',
    npwp16: org.npwp_16 || '',
    nitku: org.nitku || '',
    taxableDate: org.taxable_date || '',
    taxPersonName: org.tax_person_name || '',
    taxPersonNpwp15: org.tax_person_npwp_15 || '',
    taxPersonNpwp16: org.tax_person_npwp_16 || '',
    bpjsKetenagakerjaanNumber: org.bpjs_ketenagakerjaan_number || '',
    jkkRate: org.jkk_rate || '',
    kluCode: org.klu_code || '',
    companyRegistrationNumber: org.company_registration_number || '',
    businessLicenseNumber: org.business_license_number || '',
    payDayOfMonth: String(org.pay_day_of_month ?? 1),
    timezone: org.timezone || 'Asia/Jakarta',
  }
}

function addressFromOrg(org: Organization): AddressValue {
  return {
    street: org.address_street || '',
    city: org.address_city || '',
    province: org.address_province || '',
    postal_code: org.address_postal_code || '',
    country: org.address_country || 'ID',
  }
}

function profileDirty(org: Organization, form: ProfileForm, address: AddressValue): boolean {
  const original = profileFormFromOrg(org)
  const addressDirty =
    address.street !== (org.address_street || '') ||
    address.city !== (org.address_city || '') ||
    address.province !== (org.address_province || '') ||
    address.postal_code !== (org.address_postal_code || '') ||
    address.country !== (org.address_country || 'ID')
  return addressDirty || Object.keys(original).some(key => original[key as keyof ProfileForm] !== form[key as keyof ProfileForm])
}

function disabledInputStyle(): React.CSSProperties {
  return { ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function todayInWIB(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = Number(parts.find(p => p.type === 'year')!.value)
  const m = Number(parts.find(p => p.type === 'month')!.value)
  const d = Number(parts.find(p => p.type === 'day')!.value)
  return new Date(y, m - 1, d)
}

function nextCloseDate(payDay: number, today: Date): Date {
  if (payDay === 0) {
    const lastOfCurrent = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    if (lastOfCurrent < today) return new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return lastOfCurrent
  }
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), payDay)
  if (thisMonth >= today) return thisMonth
  return new Date(today.getFullYear(), today.getMonth() + 1, payDay)
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function employeeColumnForKind(kind: CompanyReferenceKind): keyof Employee | null {
  switch (kind) {
    case 'job_position': return 'job_position'
    case 'job_level': return 'job_level'
    case 'employee_class': return 'class'
  }
}
