// Hiring-request form. Two entry points share this component:
//   - /dashboard/hiring/new      → new draft, insert on first save
//   - /dashboard/hiring/:id/edit → edit an existing draft
//
// Submit goes through the submit_hiring_request RPC, which handles the
// self-request shortcut (auto-stamps the manager step if the requester
// IS the department manager).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { DateTimePicker } from '../../components/DateTimePicker'
import { formatIdrDigits } from '../../lib/credits'
import {
  ALLOWANCE_OPTIONS, CANDIDATE_SOURCES, EMPLOYMENT_TYPES, FUND_SOURCES, REQUEST_CATEGORIES,
  emitHiringRequestEvent, submitHiringRequest,
  type AllowanceOption, type CandidateSource, type EmploymentType, type FundSource, type RequestCategory,
} from '../../lib/hiringRequests'
import type { Translations } from '../../lib/translations'
import type { User, CompanyDepartment, Employee, HiringRequest } from '../../types/aliases'

type FormState = {
  department_id: string
  employment_type: EmploymentType
  category: RequestCategory
  replacing_employee_id: string | null
  source_of_candidate: CandidateSource
  position_name: string
  required_qualifications_md: string
  expected_hiring_date: string  // "YYYY-MM-DD" or ""
  supporting_reason: string
  source_of_fund: FundSource
  source_of_fund_justification: string
  base_salary_min: string  // raw number string so empty stays empty
  base_salary_max: string
  allowances: AllowanceOption[]
  allowance_other: string
  other_benefits: string
}

const DEFAULT_FORM: FormState = {
  department_id: '',
  employment_type: 'permanent',
  category: 'new_hire',
  replacing_employee_id: null,
  source_of_candidate: 'external',
  position_name: '',
  required_qualifications_md: '',
  expected_hiring_date: '',
  supporting_reason: '',
  source_of_fund: 'budgeted',
  source_of_fund_justification: '',
  base_salary_min: '',
  base_salary_max: '',
  allowances: [],
  allowance_other: '',
  other_benefits: '',
}

type DepartmentOption = Pick<CompanyDepartment, 'id' | 'name' | 'manager_employee_id'>
type SeparatedOption = Pick<Employee, 'id' | 'name' | 'job_position' | 'resign_date'>

export function HiringRequestEdit({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const { id } = useParams<{ id?: string }>()
  const isNew = !id

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  // Snapshot of the form as it was when loaded — for new requests, after any
  // auto-fill (e.g. the user's solo-managed department); for edits, the saved
  // row. Used to compute `isDirty` so we can disable "Save as draft" when the
  // user hasn't actually changed anything.
  const [initialForm, setInitialForm] = useState<FormState>(DEFAULT_FORM)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [separated, setSeparated] = useState<SeparatedOption[]>([])
  const [userEmployeeId, setUserEmployeeId] = useState<string | null>(user.employee_id ?? null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useBreadcrumbTrailing(isNew ? t.hiringRequestsNewTitle : t.hiringRequestsEditTitle)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [deptsResult, requestResult] = await Promise.all([
        supabase.from('company_departments')
          .select('id, name, manager_employee_id')
          .eq('org_id', user.org_id)
          .order('display_order')
          .order('name'),
        isNew
          ? Promise.resolve({ data: null as HiringRequest | null, error: null })
          : supabase.from('hiring_requests').select('*').eq('id', id!).single(),
      ])
      if (cancelled) return

      setDepartments(deptsResult.data ?? [])

      if (!isNew) {
        if (requestResult.error || !requestResult.data) {
          setError(requestResult.error?.message ?? 'Request not found')
          setLoading(false)
          return
        }
        const r = requestResult.data
        // Defensive: editing only makes sense for drafts the caller owns. RLS
        // will block writes anyway, but a clear early redirect avoids a
        // half-loaded form that the user can't actually save.
        if (r.status !== 'draft' || r.hiring_manager_id !== user.id) {
          navigate(`/dashboard/hiring`, { replace: true })
          return
        }
        const loaded = rowToForm(r)
        setForm(loaded)
        setInitialForm(loaded)
      } else if (deptsResult.data && deptsResult.data.length > 0) {
        // Sensible default: if this user manages exactly one department,
        // pre-select it. Otherwise leave blank to force a deliberate choice.
        const linkedEmp = user.employee_id
        if (linkedEmp) {
          const managed = deptsResult.data.filter(d => d.manager_employee_id === linkedEmp)
          if (managed.length === 1) {
            const seeded = { ...DEFAULT_FORM, department_id: managed[0].id }
            setForm(seeded)
            setInitialForm(seeded)
          }
        }
      }

      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id, isNew, user.id, user.org_id, user.employee_id, navigate])

  // Whenever the (department, category) pair makes "replacing" relevant, pull
  // separated employees for that department so the picker has options ready.
  // Bias toward most-recently-separated by sorting on resign_date desc.
  useEffect(() => {
    let cancelled = false
    if (form.category !== 'replacement' || !form.department_id) {
      setSeparated([])
      return
    }
    async function load() {
      const { data } = await supabase
        .from('employees')
        .select('id, name, job_position, resign_date, employee_departments!inner(department_id)')
        .eq('org_id', user.org_id)
        .eq('lifecycle_stage', 'separated')
        .eq('employee_departments.department_id', form.department_id)
        .order('resign_date', { ascending: false, nullsFirst: false })
        .limit(50)
      if (cancelled) return
      setSeparated((data ?? []) as SeparatedOption[])
    }
    load()
    return () => { cancelled = true }
  }, [form.category, form.department_id, user.org_id])

  // Resolve the requester's linked employee id once, so we can tell them
  // they'll trigger the self-request shortcut on submit.
  useEffect(() => {
    if (userEmployeeId !== null || !user.id) return
    let cancelled = false
    supabase.from('users').select('employee_id').eq('id', user.id).single().then(({ data }) => {
      if (!cancelled && data) setUserEmployeeId(data.employee_id ?? null)
    })
    return () => { cancelled = true }
  }, [user.id, userEmployeeId])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleAllowance(option: AllowanceOption) {
    setForm(prev => {
      const next = prev.allowances.includes(option)
        ? prev.allowances.filter(a => a !== option)
        : [...prev.allowances, option]
      // Clear the "other" free-text if "other" was just removed, so we don't
      // persist orphaned text on save.
      const allowance_other = next.includes('other') ? prev.allowance_other : ''
      return { ...prev, allowances: next, allowance_other }
    })
  }

  // Self-request shortcut detection — mirrors the server logic in
  // submit_hiring_request. Surfaced as a small banner on the form so the
  // requester isn't surprised when their submit skips the manager step.
  const willAutoApprove = useMemo(() => {
    if (!userEmployeeId || !form.department_id) return false
    const dept = departments.find(d => d.id === form.department_id)
    return !!dept && dept.manager_employee_id === userEmployeeId
  }, [userEmployeeId, form.department_id, departments])

  function validate(forSubmit: boolean): string | null {
    if (!form.department_id) return t.hiringRequestsValidationDepartment
    if (!form.position_name.trim()) return t.hiringRequestsValidationPosition
    if (form.category === 'replacement' && !form.replacing_employee_id) {
      return t.hiringRequestsValidationReplacing
    }
    if (form.source_of_fund === 'non_budgeted' && !form.source_of_fund_justification.trim()) {
      return t.hiringRequestsValidationFundJustification
    }
    if (form.allowances.includes('other') && !form.allowance_other.trim()) {
      return t.hiringRequestsValidationAllowanceOther
    }
    const min = parseSalary(form.base_salary_min)
    const max = parseSalary(form.base_salary_max)
    if (min !== null && max !== null && min > max) {
      return t.hiringRequestsValidationSalaryRange
    }
    if (forSubmit && !form.expected_hiring_date) {
      return t.hiringRequestsValidationExpectedDate
    }
    return null
  }

  /** Persist current form state. Inserts on isNew, otherwise updates the
   *  draft. Returns the row id on success, null on failure (error already
   *  surfaced via setError). */
  async function persist(): Promise<string | null> {
    const payload = formToPayload(form)
    if (isNew) {
      const { data, error } = await supabase
        .from('hiring_requests')
        .insert({ ...payload, org_id: user.org_id, hiring_manager_id: user.id })
        .select('id')
        .single()
      if (error) { setError(error.message); return null }
      return data!.id
    }
    const { error } = await supabase
      .from('hiring_requests')
      .update(payload)
      .eq('id', id!)
    if (error) { setError(error.message); return null }
    return id!
  }

  async function handleSaveDraft() {
    setError('')
    const v = validate(false)
    if (v) { setError(v); return }
    setSaving(true)
    const newId = await persist()
    setSaving(false)
    if (newId) navigate('/dashboard/hiring')
  }

  async function handleSubmitForApproval() {
    setError('')
    const v = validate(true)
    if (v) { setError(v); return }
    if (!confirm(t.hiringRequestsSubmitConfirm)) return
    setSaving(true)
    const newId = await persist()
    if (!newId) { setSaving(false); return }
    try {
      const updated = await submitHiringRequest(newId)
      const deptName = departments.find(d => d.id === updated.department_id)?.name ?? null
      const requester = user.name ?? null
      // Always emit the "submitted" event. If the self-request shortcut fired
      // server-side (auto-approve manager step), also emit the manager_approved
      // event so the audit trail reflects both transitions.
      const positionName = updated.position_name
      const submittedDesc = [
        requester ? `Submitted by ${requester}` : null,
        deptName,
      ].filter(Boolean).join(' · ') || null
      await emitHiringRequestEvent({ orgId: user.org_id, kind: 'submitted', request: updated, positionName, description: submittedDesc })
      if (updated.manager_auto_approved) {
        await emitHiringRequestEvent({
          orgId: user.org_id,
          kind: 'manager_approved',
          request: updated,
          positionName,
          description: requester ? `Auto-approved (${requester} manages this department)` : 'Auto-approved (requester manages this department)',
        })
      }
      navigate('/dashboard/hiring')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  }

  const noDepartments = departments.length === 0
  // Derived button-state flags. validate() is cheap and we want the disabled
  // state to track the form live, so compute on every render rather than
  // gating behind useMemo.
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm)
  const draftValid = validate(false) === null
  const submitValid = validate(true) === null
  // Save-as-draft only fires when (a) there's something new to save and
  // (b) validation passes. Submit-for-approval doesn't require isDirty —
  // a saved-and-unchanged draft is a legitimate "submit it as-is" path.
  const canSaveDraft = isDirty && draftValid
  const canSubmit = submitValid
  const showReplacing = form.category === 'replacement'
  const showFundJustification = form.source_of_fund === 'non_budgeted'
  const showAllowanceOther = form.allowances.includes('other')
  const writeDisabledTitle = !canWrite ? t.dunningWriteBlocked : undefined

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {isNew ? t.hiringRequestsNewTitle : t.hiringRequestsEditTitle}
        </h1>
        {/* Action buttons live in the header to match the rest of the app
            (detail view, JD editor, employee edit, etc.). Order is left→right:
            destructive/cancel → save draft → primary action, mirroring the
            JobDescriptionEdit header. */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard/hiring')}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || !canWrite || noDepartments || !canSaveDraft}
            title={writeDisabledTitle}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', opacity: (saving || !canWrite || noDepartments || !canSaveDraft) ? 0.5 : 1 }}
          >
            {t.hiringRequestsActionSaveDraft}
          </button>
          <button
            type="button"
            onClick={handleSubmitForApproval}
            disabled={saving || !canWrite || noDepartments || !canSubmit}
            title={writeDisabledTitle}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)', opacity: (saving || !canWrite || noDepartments || !canSubmit) ? 0.5 : 1 }}
          >
            {t.hiringRequestsActionSubmit}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {noDepartments && (
        <div className="mb-4 rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {t.hiringRequestsDepartmentsEmpty}
        </div>
      )}

      <div className="space-y-6">
        <Section title={t.hiringRequestsSectionPosition}>
          <Field
            label={t.hiringRequestsFieldDepartment}
            required
            action={<ManageButton label={t.hiringFieldManage} onClick={() => navigate('/dashboard/company?tab=structure')} />}
          >
            <select
              value={form.department_id}
              onChange={e => update('department_id', e.target.value)}
              disabled={noDepartments}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{t.hiringRequestsFieldDepartmentPlaceholder}</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>

          <Field label={t.hiringRequestsFieldEmploymentType} required>
            <select
              value={form.employment_type}
              onChange={e => update('employment_type', e.target.value as EmploymentType)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {EMPLOYMENT_TYPES.map(et => (
                <option key={et} value={et}>{employmentTypeLabel(et, t)}</option>
              ))}
            </select>
          </Field>

          <Field label={t.hiringRequestsFieldCategory} required>
            <div className="space-y-2">
              {REQUEST_CATEGORIES.map(c => (
                <Radio
                  key={c}
                  checked={form.category === c}
                  onChange={() => update('category', c)}
                  label={categoryLabel(c, t)}
                />
              ))}
            </div>
          </Field>

          {showReplacing && (
            <Field
              label={t.hiringRequestsFieldReplacing}
              hint={form.department_id ? t.hiringRequestsFieldReplacingHint : undefined}
              required
            >
              {!form.department_id ? (
                <p className="text-xs italic" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.hiringRequestsFieldDepartmentPlaceholder}
                </p>
              ) : separated.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.hiringRequestsFieldReplacingEmpty}
                </p>
              ) : (
                <select
                  value={form.replacing_employee_id ?? ''}
                  onChange={e => update('replacing_employee_id', e.target.value || null)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                >
                  <option value="">{t.hiringRequestsFieldReplacingPlaceholder}</option>
                  {separated.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {formatSeparatedOption(emp)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label={t.hiringRequestsFieldSource} required>
            <div className="space-y-2">
              {CANDIDATE_SOURCES.map(s => (
                <Radio
                  key={s}
                  checked={form.source_of_candidate === s}
                  onChange={() => update('source_of_candidate', s)}
                  label={sourceLabel(s, t)}
                />
              ))}
            </div>
          </Field>

          <Field label={t.hiringRequestsFieldPosition} required>
            <input
              type="text"
              value={form.position_name}
              onChange={e => update('position_name', e.target.value)}
              placeholder={t.hiringRequestsFieldPositionPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>

          <Field label={t.hiringRequestsFieldQualifications} hint={t.hiringRequestsFieldQualificationsHint}>
            <textarea
              value={form.required_qualifications_md}
              onChange={e => update('required_qualifications_md', e.target.value)}
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>

          <Field label={t.hiringRequestsFieldExpectedDate}>
            <DateTimePicker
              mode="date"
              value={form.expected_hiring_date}
              onChange={v => update('expected_hiring_date', v)}
            />
          </Field>

          <Field label={t.hiringRequestsFieldReason} hint={t.hiringRequestsFieldReasonHint}>
            <textarea
              value={form.supporting_reason}
              onChange={e => update('supporting_reason', e.target.value)}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
        </Section>

        <Section title={t.hiringRequestsSectionRemuneration}>
          <Field label={t.hiringRequestsFieldFund} required>
            <div className="space-y-2">
              {FUND_SOURCES.map(f => (
                <Radio
                  key={f}
                  checked={form.source_of_fund === f}
                  onChange={() => update('source_of_fund', f)}
                  label={fundLabel(f, t)}
                />
              ))}
            </div>
          </Field>

          {showFundJustification && (
            <Field
              label={t.hiringRequestsFieldFundJustification}
              hint={t.hiringRequestsFieldFundJustificationHint}
              required
            >
              <textarea
                value={form.source_of_fund_justification}
                onChange={e => update('source_of_fund_justification', e.target.value)}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.hiringRequestsFieldSalaryMin} hint={t.hiringRequestsFieldSalaryHint}>
              <IdrInput
                value={form.base_salary_min}
                onChange={v => update('base_salary_min', v)}
                idrLabel={t.idr}
              />
            </Field>
            <Field label={t.hiringRequestsFieldSalaryMax}>
              <IdrInput
                value={form.base_salary_max}
                onChange={v => update('base_salary_max', v)}
                idrLabel={t.idr}
              />
            </Field>
          </div>

          <Field label={t.hiringRequestsFieldAllowances}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALLOWANCE_OPTIONS.map(a => (
                <Checkbox
                  key={a}
                  label={allowanceLabel(a, t)}
                  checked={form.allowances.includes(a)}
                  onChange={() => toggleAllowance(a)}
                />
              ))}
            </div>
          </Field>

          {showAllowanceOther && (
            <Field label={t.hiringRequestsFieldAllowanceOther} required>
              <input
                type="text"
                value={form.allowance_other}
                onChange={e => update('allowance_other', e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </Field>
          )}

          <Field label={t.hiringRequestsFieldOtherBenefits} hint={t.hiringRequestsFieldOtherBenefitsHint}>
            <textarea
              value={form.other_benefits}
              onChange={e => update('other_benefits', e.target.value)}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
        </Section>

        {willAutoApprove && (
          <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
            {t.hiringRequestsAutoApproveHint}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Form ↔ row mapping ─────────────────────────────────────────────────

function rowToForm(r: HiringRequest): FormState {
  return {
    department_id: r.department_id,
    employment_type: r.employment_type as EmploymentType,
    category: r.category as RequestCategory,
    replacing_employee_id: r.replacing_employee_id,
    source_of_candidate: r.source_of_candidate as CandidateSource,
    position_name: r.position_name,
    required_qualifications_md: r.required_qualifications_md ?? '',
    expected_hiring_date: r.expected_hiring_date ?? '',
    supporting_reason: r.supporting_reason ?? '',
    source_of_fund: r.source_of_fund as FundSource,
    source_of_fund_justification: r.source_of_fund_justification ?? '',
    base_salary_min: r.base_salary_min === null ? '' : String(r.base_salary_min),
    base_salary_max: r.base_salary_max === null ? '' : String(r.base_salary_max),
    allowances: (r.allowances ?? []) as AllowanceOption[],
    allowance_other: r.allowance_other ?? '',
    other_benefits: r.other_benefits ?? '',
  }
}

function formToPayload(f: FormState) {
  return {
    department_id: f.department_id,
    employment_type: f.employment_type,
    category: f.category,
    // Strip the incumbent FK when the category isn't replacement, so a
    // requester who toggles back to "new hire" doesn't leave a stale link.
    replacing_employee_id: f.category === 'replacement' ? f.replacing_employee_id : null,
    source_of_candidate: f.source_of_candidate,
    position_name: f.position_name.trim(),
    required_qualifications_md: f.required_qualifications_md,
    expected_hiring_date: f.expected_hiring_date || null,
    supporting_reason: f.supporting_reason,
    source_of_fund: f.source_of_fund,
    source_of_fund_justification: f.source_of_fund === 'non_budgeted'
      ? f.source_of_fund_justification.trim() || null
      : null,
    base_salary_min: parseSalary(f.base_salary_min),
    base_salary_max: parseSalary(f.base_salary_max),
    allowances: f.allowances,
    allowance_other: f.allowances.includes('other') ? (f.allowance_other.trim() || null) : null,
    other_benefits: f.other_benefits.trim() || null,
  }
}

function parseSalary(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function formatSeparatedOption(emp: SeparatedOption): string {
  const parts = [emp.name]
  if (emp.job_position) parts.push(emp.job_position)
  if (emp.resign_date) parts.push(`(${emp.resign_date})`)
  return parts.join(' — ')
}

// ─── Enum → label helpers ───────────────────────────────────────────────

function employmentTypeLabel(et: EmploymentType, t: Translations): string {
  switch (et) {
    case 'freelance': return t.hiringRequestsEmpTypeFreelance
    case 'fixed_contract': return t.hiringRequestsEmpTypeFixedContract
    case 'permanent': return t.hiringRequestsEmpTypePermanent
  }
}

function categoryLabel(c: RequestCategory, t: Translations): string {
  switch (c) {
    case 'new_hire': return t.hiringRequestsCategoryNewHire
    case 'replacement': return t.hiringRequestsCategoryReplacement
  }
}

function sourceLabel(s: CandidateSource, t: Translations): string {
  switch (s) {
    case 'internal': return t.hiringRequestsSourceInternal
    case 'external': return t.hiringRequestsSourceExternal
  }
}

function fundLabel(f: FundSource, t: Translations): string {
  switch (f) {
    case 'budgeted': return t.hiringRequestsFundBudgeted
    case 'non_budgeted': return t.hiringRequestsFundNonBudgeted
  }
}

function allowanceLabel(a: AllowanceOption, t: Translations): string {
  switch (a) {
    case 'meal': return t.hiringRequestsAllowanceMeal
    case 'transport': return t.hiringRequestsAllowanceTransport
    case 'overtime': return t.hiringRequestsAllowanceOvertime
    case 'incentive': return t.hiringRequestsAllowanceIncentive
    case 'bonus': return t.hiringRequestsAllowanceBonus
    case 'other': return t.hiringRequestsAllowanceOther
  }
}

// ─── UI primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, required, action, children }: {
  label: string
  hint?: string
  required?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {label}
          {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
    </div>
  )
}

// IDR-formatted text input. Mirrors the wage-input pattern used by
// ContractEdit (formatIdrDigits → thousands separators on display, raw
// digits in state). State stays a digit string so existing parseSalary +
// payload conversion work unchanged.
function IdrInput({ value, onChange, idrLabel }: {
  value: string
  onChange: (next: string) => void
  idrLabel: string
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={formatIdrDigits(value)}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{idrLabel}</span>
    </div>
  )
}

// Visually mirrors the Recruitment page's ManageButton (small primary-coloured
// inline link with a chevron) so HR users see one consistent affordance for
// "jump to settings to add the option you're missing."
function ManageButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium hover:underline"
      style={{ color: 'var(--color-primary)' }}
    >
      {label}
    </button>
  )
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
      <input type="radio" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
