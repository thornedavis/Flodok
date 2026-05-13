// Job-description authoring page.
//
//   /dashboard/hiring/jds/new                  → new draft (blank or seeded
//                                                  from ?from_request=<id>)
//   /dashboard/hiring/jds/:id/edit             → edit draft / view published /
//                                                  view archived
//
// Drafts are fully editable. Published JDs are read-only: to make a change,
// archive and start a new draft. Archived JDs can be restored to draft.
//
// Publish writes a snapshot row to job_description_versions and flips
// status via the publish_job_description RPC. Saving a draft just updates
// the live row in place — no version churn while you're still iterating.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { docAsJson, type DocumentDoc, type ViewMode } from '../../lib/documentDoc'
import {
  archiveJobDescription, buildJobDescriptionSeedDoc, isJdEditable,
  publishJobDescription, suggestDocVersion,
  type JobDescriptionStatus,
} from '../../lib/jobDescriptions'
import type { User, JobDescription, CompanyDepartment, HiringRequest } from '../../types/aliases'

type DepartmentOption = Pick<CompanyDepartment, 'id' | 'name'>

type FormState = {
  title: string
  department_id: string
  reporting_line: string
  job_level: string
  supervised_team: string
  work_location: string
  effective_date: string  // YYYY-MM-DD
  doc_version: string
}

const DEFAULT_FORM: FormState = {
  title: '',
  department_id: '',
  reporting_line: '',
  job_level: '',
  supervised_team: '',
  work_location: '',
  effective_date: '',
  doc_version: '',
}

export function JobDescriptionEdit({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const { id } = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const fromRequestId = searchParams.get('from_request')
  const isNew = !id

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [content, setContent] = useState<DocumentDoc>(buildJobDescriptionSeedDoc)
  const [status, setStatus] = useState<JobDescriptionStatus>('draft')
  const [currentVersion, setCurrentVersion] = useState(1)
  const [hiringRequestId, setHiringRequestId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('stacked')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Whether the user has typed/clicked something in the doc_version field
  // since the form opened. If they have, we leave it alone; otherwise we
  // re-suggest when the department picker changes (only matters for new JDs).
  const docVersionEditedRef = useRef(false)

  useBreadcrumbTrailing(isNew ? t.jdNewTitle : (form.title || t.jdEditTitle))

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const deptsPromise = supabase.from('company_departments')
        .select('id, name')
        .eq('org_id', user.org_id)
        .order('display_order')
        .order('name')

      if (isNew) {
        // For new JDs, optionally seed from an approved hiring request. The
        // ?from_request=<id> query param is set by the "Draft from request"
        // button on the request detail page.
        const reqPromise = fromRequestId
          ? supabase.from('hiring_requests')
              .select('id, status, position_name, department_id, required_qualifications_md')
              .eq('id', fromRequestId)
              .single()
          : Promise.resolve({ data: null as Partial<HiringRequest> | null, error: null })

        const [deptsResult, reqResult] = await Promise.all([deptsPromise, reqPromise])
        if (cancelled) return

        setDepartments(deptsResult.data ?? [])

        if (reqResult.data && (reqResult.data as Partial<HiringRequest>).status === 'approved') {
          const req = reqResult.data as Partial<HiringRequest>
          const dept = deptsResult.data?.find(d => d.id === req.department_id)
          setHiringRequestId(req.id ?? null)
          setForm(prev => ({
            ...prev,
            title: req.position_name ?? '',
            department_id: req.department_id ?? '',
            doc_version: suggestDocVersion(dept?.name ?? null),
          }))
          // If the request has qualifications text, drop it into the body
          // doc's "General Requirements" section (last section in the seed).
          const seeded = buildJobDescriptionSeedDoc()
          if (req.required_qualifications_md && req.required_qualifications_md.trim()) {
            const generalReqSection = seeded.content?.[seeded.content.length - 1]
            if (generalReqSection?.content?.[0]?.content) {
              // Replace the empty bilingual block's English body paragraph with
              // the requirements text. Indonesian side stays blank for HR to
              // translate. Plain-text drop — markdown structure isn't preserved.
              const enBody = generalReqSection.content[0].content[0]
              if (enBody?.content) {
                enBody.content = [{ type: 'paragraph', content: [{ type: 'text', text: req.required_qualifications_md.trim() }] }]
              }
            }
          }
          setContent(seeded)
        } else {
          setContent(buildJobDescriptionSeedDoc())
        }
        setLoading(false)
        return
      }

      // Existing JD
      const [deptsResult, jdResult] = await Promise.all([
        deptsPromise,
        supabase.from('job_descriptions').select('*').eq('id', id!).single(),
      ])
      if (cancelled) return

      setDepartments(deptsResult.data ?? [])

      if (jdResult.error || !jdResult.data) {
        setError(jdResult.error?.message ?? t.jdNotFound)
        setLoading(false)
        return
      }
      const jd = jdResult.data as JobDescription
      setStatus(jd.status as JobDescriptionStatus)
      setCurrentVersion(jd.current_version)
      setHiringRequestId(jd.hiring_request_id)
      setForm({
        title: jd.title,
        department_id: jd.department_id ?? '',
        reporting_line: jd.reporting_line ?? '',
        job_level: jd.job_level ?? '',
        supervised_team: jd.supervised_team ?? '',
        work_location: jd.work_location ?? '',
        effective_date: jd.effective_date ?? '',
        doc_version: jd.doc_version ?? '',
      })
      // doc_version is whatever HR set; don't auto-resuggest on edits.
      docVersionEditedRef.current = true
      setContent((jd.content_doc as DocumentDoc | null) ?? buildJobDescriptionSeedDoc())
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id, isNew, fromRequestId, user.org_id, t.jdNotFound])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'doc_version') docVersionEditedRef.current = true
    // Re-suggest doc_version when the department changes on a new, untouched
    // form. Editing an existing JD or one where the user has already touched
    // doc_version leaves the field alone.
    if (key === 'department_id' && isNew && !docVersionEditedRef.current) {
      const dept = departments.find(d => d.id === value)
      setForm(prev => ({ ...prev, doc_version: suggestDocVersion(dept?.name ?? null) }))
    }
  }

  const handleDocChange = useCallback((next: DocumentDoc) => {
    setContent(next)
  }, [])

  const readOnly = !isJdEditable(status)

  function validate(): string | null {
    if (!form.title.trim()) return t.jdValidationTitle
    if (!form.department_id) return t.jdValidationDepartment
    return null
  }

  function payloadFromForm() {
    return {
      title: form.title.trim(),
      department_id: form.department_id || null,
      reporting_line: form.reporting_line.trim() || null,
      job_level: form.job_level.trim() || null,
      supervised_team: form.supervised_team.trim() || null,
      work_location: form.work_location.trim() || null,
      effective_date: form.effective_date || null,
      doc_version: form.doc_version.trim() || null,
      content_doc: docAsJson(content),
    }
  }

  async function persist(): Promise<string | null> {
    if (isNew) {
      const { data, error } = await supabase
        .from('job_descriptions')
        .insert({
          ...payloadFromForm(),
          org_id: user.org_id,
          created_by: user.id,
          hiring_request_id: hiringRequestId,
        })
        .select('id')
        .single()
      if (error) { setError(error.message); return null }
      return data!.id
    }
    const { error } = await supabase
      .from('job_descriptions')
      .update(payloadFromForm())
      .eq('id', id!)
    if (error) { setError(error.message); return null }
    return id!
  }

  async function handleSaveDraft() {
    setError('')
    const v = validate()
    if (v) { setError(v); return }
    setSaving(true)
    const newId = await persist()
    setSaving(false)
    if (newId) navigate('/dashboard/hiring?view=jds')
  }

  async function handlePublish() {
    setError('')
    const v = validate()
    if (v) { setError(v); return }
    if (!confirm(t.jdConfirmPublish)) return
    setSaving(true)
    const newId = await persist()
    if (!newId) { setSaving(false); return }
    // Snapshot the current state into job_description_versions before flipping
    // status, so the published version has a frozen record.
    const { error: versionError } = await supabase.from('job_description_versions').insert({
      job_description_id: newId,
      version_number: currentVersion,
      title: form.title.trim(),
      department_id: form.department_id || null,
      reporting_line: form.reporting_line.trim() || null,
      job_level: form.job_level.trim() || null,
      supervised_team: form.supervised_team.trim() || null,
      work_location: form.work_location.trim() || null,
      effective_date: form.effective_date || null,
      doc_version: form.doc_version.trim() || null,
      content_doc: docAsJson(content),
      changed_by: user.id,
    })
    if (versionError) {
      setSaving(false)
      setError(versionError.message)
      return
    }
    try {
      await publishJobDescription(newId)
      navigate('/dashboard/hiring?view=jds')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!id) return
    if (!confirm(t.jdConfirmArchive)) return
    setSaving(true)
    setError('')
    try {
      await archiveJobDescription(id)
      navigate('/dashboard/hiring?view=jds')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm(t.jdConfirmDelete)) return
    setSaving(true)
    const { error } = await supabase.from('job_descriptions').delete().eq('id', id)
    setSaving(false)
    if (error) { setError(error.message); return }
    navigate('/dashboard/hiring?view=jds')
  }

  const writeDisabledTitle = !canWrite ? t.dunningWriteBlocked : undefined

  const departmentNameForDocSuggestion = useMemo(() =>
    departments.find(d => d.id === form.department_id)?.name ?? null,
    [departments, form.department_id])

  // Surface the live doc-number suggestion next to the field for new JDs
  // when the user hasn't typed there yet. Avoids touching `form` until the
  // user actually commits to a value.
  const docVersionPlaceholder = isNew && !docVersionEditedRef.current
    ? suggestDocVersion(departmentNameForDocSuggestion)
    : undefined

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            {statusBadgeText(status, t)}
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
            {isNew ? t.jdNewTitle : (form.title || t.jdEditTitle)}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard/hiring?view=jds')}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.cancel}
          </button>
          {status === 'draft' && (
            <>
              {!isNew && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving || !canWrite}
                  title={writeDisabledTitle}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
                >
                  {t.jdActionDelete}
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || !canWrite}
                title={writeDisabledTitle}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                {saving ? t.jdSaving : t.jdActionSaveDraft}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={saving || !canWrite}
                title={writeDisabledTitle}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t.jdActionPublish}
              </button>
            </>
          )}
          {status === 'published' && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={saving || !canWrite}
              title={writeDisabledTitle}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.jdActionArchive}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <Section title={t.jdSectionMetadata}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.jdFieldTitle} required>
            <input
              type="text"
              value={form.title}
              onChange={e => update('title', e.target.value)}
              placeholder={t.jdFieldTitlePlaceholder}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.jdFieldDepartment} required>
            <select
              value={form.department_id}
              onChange={e => update('department_id', e.target.value)}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{t.jdFieldDepartmentPlaceholder}</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label={t.jdFieldReportingLine}>
            <input
              type="text"
              value={form.reporting_line}
              onChange={e => update('reporting_line', e.target.value)}
              placeholder={t.jdFieldReportingLinePlaceholder}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.jdFieldJobLevel}>
            <input
              type="text"
              value={form.job_level}
              onChange={e => update('job_level', e.target.value)}
              placeholder={t.jdFieldJobLevelPlaceholder}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.jdFieldSupervisedTeam}>
            <input
              type="text"
              value={form.supervised_team}
              onChange={e => update('supervised_team', e.target.value)}
              placeholder={t.jdFieldSupervisedTeamPlaceholder}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.jdFieldWorkLocation}>
            <input
              type="text"
              value={form.work_location}
              onChange={e => update('work_location', e.target.value)}
              placeholder={t.jdFieldWorkLocationPlaceholder}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.jdFieldEffectiveDate}>
            <input
              type="date"
              value={form.effective_date}
              onChange={e => update('effective_date', e.target.value)}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.jdFieldDocVersion} hint={t.jdFieldDocVersionHint}>
            <input
              type="text"
              value={form.doc_version}
              onChange={e => update('doc_version', e.target.value)}
              placeholder={docVersionPlaceholder}
              disabled={readOnly}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
        </div>
      </Section>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdSectionBody}</h2>
        <div className={readOnly ? 'pointer-events-none opacity-90' : ''}>
          <DocumentEditor
            initialDoc={content}
            onChange={handleDocChange}
            view={view}
            onViewChange={setView}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function statusBadgeText(status: JobDescriptionStatus, t: { jdStatusDraft: string; jdStatusPublished: string; jdStatusArchived: string }): string {
  switch (status) {
    case 'draft': return t.jdStatusDraft
    case 'published': return t.jdStatusPublished
    case 'archived': return t.jdStatusArchived
  }
}

// ─── UI primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</h2>
      <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
    </div>
  )
}
