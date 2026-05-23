import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { useBilling } from '../../contexts/BillingContext'
import { normalizePhone, isValidE164 } from '../../lib/phone'
import { getAvatarGradient } from '../../lib/avatar'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { setEmployeePrimaryDepartment, type DepartmentOption } from '../../lib/departments'
import { primaryDept, type EmpDeptShape } from '../../lib/employee'
import { profileCompletionPercentFromEmployee } from '../../lib/candidateProfile'
import {
  CANDIDATE_SOURCE_OPTIONS,
  candidateSourceLabel,
  type CandidateSourceOption,
} from '../../lib/candidateProfile'
import { PhoneInput } from '../../components/PhoneInput'
import { EmployeeAttachments } from '../../components/EmployeeAttachments'
import { DeleteEmployeeModal } from '../../components/DeleteEmployeeModal'
import type { Employee, Organization, User } from '../../types/aliases'
import type { Translations } from '../../lib/translations'

type RecruitmentStage = 'prospective' | 'shortlisted' | 'offered' | 'signed' | 'talent_pool' | 'no_show'
type Candidate = Employee & EmpDeptShape

const CANDIDATE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

const MAX_PHOTO_SIZE = 2 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const STAGE_TONES: Record<RecruitmentStage, { bg: string; text: string; dot: string }> = {
  prospective: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 14%, transparent)', text: 'var(--color-text-secondary)', dot: 'var(--color-text-tertiary)' },
  shortlisted: { bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)', text: 'var(--color-warning)', dot: 'var(--color-warning)' },
  offered: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', text: 'var(--color-primary)', dot: 'var(--color-primary)' },
  signed: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', text: 'var(--color-success)', dot: 'var(--color-success)' },
  talent_pool: { bg: 'color-mix(in srgb, var(--color-text-tertiary) 10%, transparent)', text: 'var(--color-text-tertiary)', dot: 'var(--color-text-tertiary)' },
  no_show: { bg: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', text: 'var(--color-danger)', dot: 'var(--color-danger)' },
}

function stageLabel(stage: RecruitmentStage, t: Translations): string {
  switch (stage) {
    case 'prospective': return t.hiringStageProspective
    case 'shortlisted': return t.hiringStageShortlisted
    case 'offered': return t.hiringStageOffered
    case 'signed': return t.hiringStageSigned
    case 'talent_pool': return t.hiringStageTalentPool
    case 'no_show': return t.hiringStageNoShow
  }
}

type PublishedJd = {
  id: string
  title: string
  department_id: string | null
  hiring_request_id: string | null
  department_name: string | null
}

export function CandidateEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id: candidateId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const isNew = searchParams.get('new') === '1'

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [jobPositions, setJobPositions] = useState<string[]>([])
  const [availableDepartments, setAvailableDepartments] = useState<DepartmentOption[]>([])
  const [publishedJds, setPublishedJds] = useState<PublishedJd[]>([])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [initialDepartment, setInitialDepartment] = useState('')
  const [appliedForJdId, setAppliedForJdId] = useState('')
  const [source, setSource] = useState<CandidateSourceOption | ''>('')
  const [notes, setNotes] = useState('')

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  useBreadcrumbTrailing(candidate?.name ?? null)

  useEffect(() => {
    if (!candidateId) return
    const id = candidateId
    let cancelled = false
    async function load() {
      const [candResult, orgResult, refResult, departmentsResult, jdResult] = await Promise.all([
        supabase.from('employees').select(CANDIDATE_WITH_DEPTS_SELECT).eq('id', id).single(),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
        supabase.from('company_departments').select('id, name').eq('org_id', user.org_id).order('display_order').order('name'),
        supabase
          .from('job_descriptions')
          .select('id, title, department_id, hiring_request_id, department:company_departments!job_descriptions_department_id_fkey(name)')
          .eq('org_id', user.org_id)
          .eq('status', 'published')
          .order('updated_at', { ascending: false }),
      ])
      if (cancelled) return
      const cand = candResult.data as Candidate | null
      if (cand) {
        setCandidate(cand)
        setName(cand.name || '')
        setPhone(cand.phone || '')
        setPosition(cand.job_position || '')
        const dept = primaryDept(cand) ?? ''
        setDepartment(dept)
        setInitialDepartment(dept)
        setAppliedForJdId(cand.applied_for_jd_id || '')
        setSource((cand.source as CandidateSourceOption | null) ?? '')
        setNotes(cand.notes || '')
      }
      setOrg(orgResult.data || null)
      if (refResult.data) {
        const buckets = bucketReferenceValues(refResult.data)
        setJobPositions(referenceNames(buckets.job_position))
      }
      if (departmentsResult.data) setAvailableDepartments(departmentsResult.data)
      setPublishedJds((jdResult.data ?? []).map(d => ({
        id: d.id,
        title: d.title,
        department_id: d.department_id,
        hiring_request_id: d.hiring_request_id,
        department_name: Array.isArray(d.department)
          ? (d.department[0] as { name: string } | undefined)?.name ?? null
          : ((d.department as { name: string } | null)?.name ?? null),
      })))
    }
    load()
    return () => { cancelled = true }
  }, [candidateId, user.org_id])

  const orgCountryCode = org?.default_country_code || '+62'
  const phoneNormalized = normalizePhone(phone, orgCountryCode)
  const phoneValid = !phone || isValidE164(phoneNormalized)
  const canSubmit = name.trim().length > 0 && phoneValid && !saving && canWrite
  const positionsEmpty = jobPositions.length === 0
  const departmentsEmpty = availableDepartments.length === 0
  const departmentNames = useMemo(() => availableDepartments.map(d => d.name), [availableDepartments])

  function goBack() {
    navigate('/dashboard/recruitment')
  }

  function handleAppliedForJdChange(jdId: string) {
    setAppliedForJdId(jdId)
    if (!jdId) return
    const jd = publishedJds.find(j => j.id === jdId)
    if (!jd) return
    setPosition(jd.title)
    if (jd.department_name) setDepartment(jd.department_name)
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !candidateId) return
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) { setError(t.avatarInvalidType); return }
    if (file.size > MAX_PHOTO_SIZE) { setError(t.avatarTooLarge); return }
    setError('')
    setUploading(true)
    const result = await uploadPhoto(candidateId, file)
    if (!result.url) { setUploading(false); setError(result.error || t.hiringPhotoUploadError); return }
    const { error: updateError } = await supabase.from('employees').update({ photo_url: result.url }).eq('id', candidateId)
    setUploading(false)
    if (updateError) { setError(updateError.message); return }
    setCandidate(prev => prev ? { ...prev, photo_url: result.url } : prev)
  }

  async function handlePhotoRemove() {
    if (!candidate || !candidateId || !candidate.photo_url) return
    setUploading(true)
    const match = candidate.photo_url.match(/\/avatars\/([^?]+)/)
    if (match) await supabase.storage.from('avatars').remove([match[1]])
    const { error: updateError } = await supabase.from('employees').update({ photo_url: null }).eq('id', candidateId)
    setUploading(false)
    if (updateError) { setError(updateError.message); return }
    setCandidate(prev => prev ? { ...prev, photo_url: null } : prev)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !candidateId) return
    setSaving(true)
    setError('')

    const pickedJd = appliedForJdId ? publishedJds.find(j => j.id === appliedForJdId) : null
    const payload = {
      name: name.trim(),
      phone: phoneNormalized || '',
      job_position: position || null,
      notes: notes.trim() || null,
      applied_for_jd_id: pickedJd?.id ?? null,
      source_request_id: pickedJd?.hiring_request_id ?? null,
      source: source || null,
    }

    const { error: updateError } = await supabase.from('employees').update(payload).eq('id', candidateId)
    if (updateError) { setSaving(false); setError(updateError.message || t.hiringSaveError); return }

    if (department.trim() !== initialDepartment) {
      const result = await setEmployeePrimaryDepartment({
        employeeId: candidateId,
        orgId: user.org_id,
        name: department.trim() || null,
        available: availableDepartments,
      })
      if (result.error) { setSaving(false); setError(result.error); return }
    }

    if (isNew) {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }

    setSaving(false)
    goBack()
  }

  async function handleCancel() {
    if (isNew && candidate) {
      if (!confirm(t.empDiscardNewConfirm)) return
      await supabase.from('employees').delete().eq('id', candidate.id)
    }
    goBack()
  }

  function handleDelete() {
    if (!candidate) return
    setDeleteOpen(true)
  }

  function onManageReferences() {
    navigate('/dashboard/company?tab=structure')
  }

  if (!candidate || !candidateId) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  }

  const stage = candidate.lifecycle_stage as RecruitmentStage
  const tone = STAGE_TONES[stage] ?? STAGE_TONES.prospective
  const completionPct = profileCompletionPercentFromEmployee(candidate)
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?'

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {isNew ? t.hiringAddCandidateTitle : t.hiringEditCandidateTitle}
        </h1>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.cancel}
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Summary sidebar */}
          <aside className="w-full shrink-0 md:w-64">
            <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              <div className="flex flex-col items-center text-center">
                <div
                  className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-lg font-semibold text-white"
                  style={{ background: candidate.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(candidate.id) }}
                >
                  {candidate.photo_url ? <img src={candidate.photo_url} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                <div className="mt-3 truncate text-base font-semibold" style={{ color: 'var(--color-text)' }}>{name || candidate.name}</div>
                <span
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: tone.bg, color: tone.text }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
                  {stageLabel(stage, t)}
                </span>
                {(stage === 'prospective' || stage === 'shortlisted') && (
                  <span className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.hiringCompletionChip(completionPct)}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-2">
                <label
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors ${uploading ? 'pointer-events-none opacity-50' : 'hover:bg-[var(--color-bg-tertiary)]'}`}
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {candidate.photo_url ? t.hiringPhotoChange : t.hiringPhotoUpload}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} disabled={uploading} className="hidden" />
                </label>
                {candidate.photo_url && (
                  <button type="button" onClick={handlePhotoRemove} disabled={uploading} className="text-xs" style={{ color: 'var(--color-danger)' }}>
                    {t.hiringPhotoRemove}
                  </button>
                )}
              </div>

              {!isNew && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="mt-4 w-full rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
                >
                  {t.delete}
                </button>
              )}
            </div>
          </aside>

          {/* Main form */}
          <main className="min-w-0 flex-1 space-y-6">
            <Section title={t.candidateSectionDetails}>
              <Field label={t.hiringFieldName} required>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus={isNew}
                  required
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                />
              </Field>
              <Field label={t.hiringFieldPhone}>
                <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={orgCountryCode} />
              </Field>
              <Field label={t.hiringFieldPosition} action={<ManageButton label={t.hiringFieldManage} onClick={onManageReferences} />}>
                <select
                  value={position}
                  onChange={e => setPosition(e.target.value)}
                  disabled={positionsEmpty}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">{positionsEmpty ? t.hiringPositionEmpty : t.hiringFieldPositionPlaceholder}</option>
                  {jobPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field
                label={t.hiringFieldDepartments}
                help={t.hiringFieldDepartmentsHelp}
                action={<ManageButton label={t.hiringFieldManage} onClick={onManageReferences} />}
              >
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  disabled={departmentsEmpty}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">{departmentsEmpty ? t.hiringDepartmentEmpty : t.hiringFieldDepartmentPlaceholder}</option>
                  {departmentNames.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </Section>

            <Section title={t.candidateSectionApplication}>
              <Field label={t.candidateFieldAppliedForJd} help={publishedJds.length === 0 ? t.candidateNoPublishedJds : t.candidateFieldAppliedForJdHelp}>
                <select
                  value={appliedForJdId}
                  onChange={e => handleAppliedForJdChange(e.target.value)}
                  disabled={publishedJds.length === 0}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">{t.candidateFieldAppliedForJdPlaceholder}</option>
                  {publishedJds.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.department_name ? `${j.title} — ${j.department_name}` : j.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.candidateFieldSource} help={t.candidateFieldSourceHelp}>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value as CandidateSourceOption | '')}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">{t.candidateFieldSourcePlaceholder}</option>
                  {CANDIDATE_SOURCE_OPTIONS.map(s => (
                    <option key={s} value={s}>{candidateSourceLabel(s, t)}</option>
                  ))}
                </select>
              </Field>
            </Section>

            <Section title={t.candidateSectionDocuments}>
              <EmployeeAttachments employeeId={candidateId} disabled={!canWrite} />
            </Section>

            <Section title={t.candidateSectionNotes}>
              <Field label={t.hiringFieldNotes}>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder={t.hiringFieldNotesPlaceholder}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                />
              </Field>
            </Section>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </main>
        </div>
      </form>

      <DeleteEmployeeModal
        open={deleteOpen}
        target={deleteOpen && candidate ? { kind: 'single', id: candidate.id, name: candidate.name } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={goBack}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, required, help, action, children }: { label: string; required?: boolean; help?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {label}{required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
        </label>
        {action}
      </div>
      {children}
      {help && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{help}</p>}
    </div>
  )
}

function ManageButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
      style={{ color: 'var(--color-primary)' }}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </button>
  )
}

async function uploadPhoto(employeeId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${employeeId}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) return { url: null, error: error.message }
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  return { url: `${publicUrl}?t=${Date.now()}`, error: null }
}
