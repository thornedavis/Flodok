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
import { activeWorkforceEmployees, withLinkedEmployee } from '../../lib/lifecycle'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useSaveFlash } from '../../hooks/useSaveFlash'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { DocumentEditShell, EDITOR_STICKY_TOP_PX } from '../../components/editor/DocumentEditShell'
import { SaveAsTemplateModal } from '../../components/SaveAsTemplateButton'
import { ToolbarButton } from '../../components/editor/ToolbarButton'
import { ToolbarMoreMenu, type ToolbarMenuItem } from '../../components/editor/ToolbarMoreMenu'
import { buildExportMenuItem } from '../../components/editor/exportMenuItem'
import { DateTimePicker } from '../../components/DateTimePicker'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { type EmpDeptShape } from '../../lib/employee'
import { docAsJson, type DocumentDoc, type LanguageMode, type ViewMode } from '../../lib/documentDoc'
import { documentEditPath, documentHistoryPath } from '../../lib/documentTypes'
import {
  archiveJobDescription, buildJobDescriptionSeedDoc, isJdEditable,
  publishJobDescription, suggestDocVersion,
  type JobDescriptionStatus,
} from '../../lib/jobDescriptions'
import { trashDocument } from '../../lib/trash'
import { exportDocumentPdf, type ExportDocumentPdfOptions } from '../../lib/pdfExport'
import type { User, JobDescription, CompanyDepartment, HiringRequest, Employee } from '../../types/aliases'

type DepartmentOption = Pick<CompanyDepartment, 'id' | 'name'>

type EmployeeWithDepartments = Employee & EmpDeptShape


type FormState = {
  title: string
  assignee_employee_id: string
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
  assignee_employee_id: '',
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
  const [tplOpen, setTplOpen] = useState(false)
  const { flash: savedFlash, show: showSaved } = useSaveFlash()
  const { canWrite } = useBilling()
  const { id } = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const fromRequestId = searchParams.get('from_request')
  const templateId = searchParams.get('template')
  const isNew = !id

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [employees, setEmployees] = useState<EmployeeWithDepartments[]>([])
  const [content, setContent] = useState<DocumentDoc>(buildJobDescriptionSeedDoc)
  const [status, setStatus] = useState<JobDescriptionStatus>('draft')
  const [currentVersion, setCurrentVersion] = useState(1)
  const [hiringRequestId, setHiringRequestId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('side_by_side')
  // language_mode read/written via cast — database.ts not regenerated yet.
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bilingual')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [exportingDocx, setExportingDocx] = useState(false)
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
      const empsPromise = activeWorkforceEmployees(user.org_id)

      if (isNew) {
        // For new JDs, optionally seed from an approved hiring request and/or
        // a JD template. Request seeds title/department/qualifications;
        // template seeds the body doc + position. If both are present, the
        // request data wins for the fields it covers.
        const reqPromise = fromRequestId
          ? supabase.from('hiring_requests')
              .select('id, status, position_name, department_id, required_qualifications_md')
              .eq('id', fromRequestId)
              .single()
          : Promise.resolve({ data: null as Partial<HiringRequest> | null, error: null })
        const tplPromise = templateId
          ? supabase.from('document_templates')
              .select('*')
              .eq('id', templateId)
              .eq('type', 'job_description')
              .single()
          : Promise.resolve({ data: null as { title: string; template_for_position: string | null; content_doc: unknown } | null, error: null })

        const [deptsResult, empsResult, reqResult, tplResult] = await Promise.all([deptsPromise, empsPromise, reqPromise, tplPromise])
        if (cancelled) return

        setDepartments(deptsResult.data ?? [])
        setEmployees((empsResult.data ?? []) as unknown as EmployeeWithDepartments[])

        // Start from either the template's content_doc or the seed doc.
        const seeded = (tplResult.data?.content_doc as DocumentDoc | null) ?? buildJobDescriptionSeedDoc()
        // A monolingual template instantiates monolingual — carry its flag so
        // the off-side clears on first save (matches the eager types' applyMode).
        if (tplResult.data) {
          setLanguageMode((tplResult.data as { language_mode?: LanguageMode }).language_mode ?? 'bilingual')
        }

        if (reqResult.data && (reqResult.data as Partial<HiringRequest>).status === 'approved') {
          const req = reqResult.data as Partial<HiringRequest>
          const dept = deptsResult.data?.find(d => d.id === req.department_id)
          setHiringRequestId(req.id ?? null)
          setForm(prev => ({
            ...prev,
            // Template's title is a less specific fallback when no request.
            title: req.position_name ?? tplResult.data?.title ?? prev.title,
            department_id: req.department_id ?? '',
            doc_version: suggestDocVersion(dept?.name ?? null),
          }))
          // Drop the request's qualifications text into the seed/template's
          // "General Requirements" section (last section). Only the seed has
          // that section reliably; for templates it may not be the last,
          // but the heuristic is good enough to make the data discoverable.
          if (req.required_qualifications_md && req.required_qualifications_md.trim()) {
            const lastSection = seeded.content?.[seeded.content.length - 1]
            if (lastSection?.content?.[0]?.content) {
              const enBody = lastSection.content[0].content[0]
              if (enBody?.content) {
                enBody.content = [{ type: 'paragraph', content: [{ type: 'text', text: req.required_qualifications_md.trim() }] }]
              }
            }
          }
          setContent(seeded)
        } else if (tplResult.data) {
          // Template-only path — pre-fill title from the template name.
          setForm(prev => ({ ...prev, title: tplResult.data!.title }))
          setContent(seeded)
        } else {
          setContent(seeded)
        }
        setLoading(false)
        return
      }

      // Existing JD
      const [deptsResult, empsResult, jdResult] = await Promise.all([
        deptsPromise,
        empsPromise,
        supabase.from('job_descriptions').select('*').eq('id', id!).single(),
      ])
      if (cancelled) return

      setDepartments(deptsResult.data ?? [])
      // Scope to the real workforce; union the JD's current assignee back in so
      // an assignment to a now-separated/recruit employee still displays.
      setEmployees(await withLinkedEmployee(
        (empsResult.data ?? []) as unknown as EmployeeWithDepartments[],
        jdResult.data?.assignee_employee_id,
      ))

      if (jdResult.error || !jdResult.data) {
        setError(jdResult.error?.message ?? t.jdNotFound)
        setLoading(false)
        return
      }
      const jd = jdResult.data as JobDescription
      setStatus(jd.status as JobDescriptionStatus)
      setLanguageMode((jd as { language_mode?: LanguageMode }).language_mode ?? 'bilingual')
      setCurrentVersion(jd.current_version)
      setHiringRequestId(jd.hiring_request_id)
      setForm({
        title: jd.title,
        assignee_employee_id: jd.assignee_employee_id ?? '',
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
  }, [id, isNew, fromRequestId, templateId, user.org_id, t.jdNotFound])

  // Unsaved-changes guard (matches the other doc editors). Snapshot
  // {form, content} once the initial fetch settles; any later divergence
  // means there are unsaved edits. Re-capture on every (re)load so the
  // /new → /:id/edit swap after the first save — which refetches — doesn't
  // read as dirty. The guard turns navigating away (including the shell's
  // Cancel button) into a discard confirm.
  const currentSnapshot = useMemo(() => JSON.stringify({ form, content, languageMode }), [form, content, languageMode])
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  useEffect(() => { if (loading) setSavedSnapshot(null) }, [loading])
  useEffect(() => {
    if (loading || savedSnapshot !== null) return
    setSavedSnapshot(currentSnapshot)
  }, [loading, currentSnapshot, savedSnapshot])
  const hasChanges = savedSnapshot !== null && currentSnapshot !== savedSnapshot
  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

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
      assignee_employee_id: form.assignee_employee_id || null,
      department_id: form.department_id || null,
      reporting_line: form.reporting_line.trim() || null,
      job_level: form.job_level.trim() || null,
      supervised_team: form.supervised_team.trim() || null,
      work_location: form.work_location.trim() || null,
      effective_date: form.effective_date || null,
      doc_version: form.doc_version.trim() || null,
      content_doc: docAsJson(content),
      // Not in the generated type yet (cast at the .insert/.update call sites);
      // carried here so both the draft save and the version snapshot record it.
      language_mode: languageMode,
    }
  }

  async function persist(): Promise<string | null> {
    if (isNew) {
      const { data, error } = await supabase
        .from('job_descriptions')
        // language_mode isn't in the generated Insert type yet → cast.
        .insert({
          ...payloadFromForm(),
          org_id: user.org_id,
          created_by: user.id,
          hiring_request_id: hiringRequestId,
        } as never)
        .select('id')
        .single()
      if (error) { setError(error.message); return null }
      return data!.id
    }
    const { error } = await supabase
      .from('job_descriptions')
      .update(payloadFromForm() as never)
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
    if (!newId) return
    // Saved — rebaseline so the page is no longer "dirty".
    setSavedSnapshot(currentSnapshot)
    showSaved(false)
    // Stay in the editor — saving is decoupled from navigation. A brand-new
    // JD was just inserted on the `/new` URL, so route to its real edit path
    // (flips isNew off) instead of re-inserting on the next save. Carry the
    // `?from=` origin through so the breadcrumb keeps pointing where the user
    // came from (Documents vs. Hiring).
    if (isNew) {
      const from = searchParams.get('from')
      const editPath = documentEditPath('job_description', newId)
      // Intentional in-editor navigation to the real edit URL; the reload
      // there re-captures the baseline, so skip the guard for this one hop.
      bypassUnsavedWarning()
      navigate(from ? `${editPath}?from=${from}` : editPath)
    }
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
      assignee_employee_id: form.assignee_employee_id || null,
      department_id: form.department_id || null,
      reporting_line: form.reporting_line.trim() || null,
      job_level: form.job_level.trim() || null,
      supervised_team: form.supervised_team.trim() || null,
      work_location: form.work_location.trim() || null,
      effective_date: form.effective_date || null,
      doc_version: form.doc_version.trim() || null,
      content_doc: docAsJson(content),
      changed_by: user.id,
      // Record the mode in the version row too (column not in the generated
      // type yet → cast). Without this the history row would default to
      // 'bilingual' even for a monolingual JD.
      language_mode: languageMode,
    } as never)
    if (versionError) {
      setSaving(false)
      setError(versionError.message)
      return
    }
    try {
      await publishJobDescription(newId)
      // Publishing makes a JD read-only, so this is a terminal action —
      // return to the unified documents dashboard. Already persisted, so
      // skip the unsaved-changes guard.
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
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
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
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
    try {
      await trashDocument(id, 'job_description')
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function buildExportArgs(): ExportDocumentPdfOptions {
    // JDs carry no merge-field pills (the editor doesn't expose the picker),
    // so a minimal context is enough to render the bilingual body.
    return {
      doc: content,
      title: form.title || t.documentTypeJobDescription,
      view,
      languageMode,
      contextEn: { today: new Date(), lang: 'en' },
      contextId: { today: new Date(), lang: 'id' },
    }
  }

  async function handleDownloadPdf() {
    if (downloading || exportingDocx) return
    setDownloading(true)
    try {
      await exportDocumentPdf(buildExportArgs())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    }
    setDownloading(false)
  }

  async function handleDownloadDocx() {
    if (downloading || exportingDocx) return
    setExportingDocx(true)
    try {
      const { exportDocumentDocx } = await import('../../lib/docxExport')
      await exportDocumentDocx(buildExportArgs())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word export failed')
    }
    setExportingDocx(false)
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

  const statusColors: Record<JobDescriptionStatus, string> = {
    draft: 'var(--color-warning)',
    published: 'var(--color-success)',
    archived: 'var(--color-text-tertiary)',
  }

  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: 'var(--color-border)', color: statusColors[status], backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
      {statusBadgeText(status, t)}
    </span>
  )

  const menuItems: ToolbarMenuItem[] = [
    buildExportMenuItem({ onPdf: handleDownloadPdf, onDocx: handleDownloadDocx, exporting: downloading ? 'pdf' : exportingDocx ? 'docx' : null, t }),
  ]
  if (!isNew && (status === 'draft' || status === 'published')) {
    menuItems.push({ key: 'template', icon: 'template', label: t.contractSaveAsTemplate, onClick: () => setTplOpen(true), disabled: !canWrite, title: writeDisabledTitle })
  }
  if (!isNew) {
    menuItems.push({ key: 'history', icon: 'history', label: t.historyLinkLabel, to: documentHistoryPath('job_description', id!) })
  }
  if (!isNew && status === 'draft') {
    menuItems.push({ key: 'delete', icon: 'trash', label: t.jdActionDelete, onClick: handleDelete, danger: true, disabled: saving || !canWrite, title: writeDisabledTitle })
  }

  const actions = (
    <>
      <ToolbarMoreMenu items={menuItems} />
      {status === 'draft' && (
        <>
          <ToolbarButton
            variant="save"
            onClick={handleSaveDraft}
            disabled={saving || !canWrite}
            title={writeDisabledTitle}
            loading={saving}
          >
            {saving ? t.jdSaving : t.jdActionSaveDraft}
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={handlePublish}
            disabled={saving || !canWrite}
            title={writeDisabledTitle}
          >
            {t.jdActionPublish}
          </ToolbarButton>
        </>
      )}
      {status === 'published' && (
        <ToolbarButton
          variant="ghost"
          onClick={handleArchive}
          disabled={saving || !canWrite}
          title={writeDisabledTitle}
        >
          {t.jdActionArchive}
        </ToolbarButton>
      )}
      {tplOpen && (
        <SaveAsTemplateModal
          orgId={user.org_id}
          defaultTitle={form.title}
          source={{ type: 'job_description', contentDoc: content }}
          onClose={() => setTplOpen(false)}
        />
      )}
    </>
  )

  const sidebar = (
    <>
      {/* Title lives in the page top bar as an inline-editable heading. */}
      <Field label={t.jdFieldAssignee}>
        <EmployeeSelect
          value={form.assignee_employee_id || null}
          onChange={v => update('assignee_employee_id', v ?? '')}
          employees={employees}
          disabled={readOnly}
          emptyLabel={t.jdFieldAssigneeNone}
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
        <DateTimePicker
          mode="date"
          value={form.effective_date}
          onChange={v => update('effective_date', v)}
          disabled={readOnly}
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
    </>
  )

  return (
    <DocumentEditShell
      storageKey="jdEdit"
      icon={<JdIcon />}
      accent="var(--color-text-secondary)"
      typeLabel={t.documentTypeJobDescription}
      title={form.title}
      onTitleChange={v => update('title', v)}
      titlePlaceholder={t.jdFieldTitlePlaceholder}
      canEditTitle={!readOnly && canWrite}
      badge={badge}
      backTo="/dashboard/documents"
      dirty={hasChanges}
      savedFlash={savedFlash}
      actions={actions}
      error={error}
      sidebar={sidebar}
      outlineDoc={content}
    >
      <div className={readOnly ? 'pointer-events-none opacity-90' : ''}>
        <DocumentEditor
          initialDoc={content}
          onChange={handleDocChange}
          view={view}
          onViewChange={setView}
          languageMode={languageMode}
          onLanguageModeChange={setLanguageMode}
          stickyToolbar
          stickyToolbarOffset={`${EDITOR_STICKY_TOP_PX}px`}
          aiGenerate={readOnly ? undefined : { docType: 'job_description', title: form.title }}
        />
      </div>
    </DocumentEditShell>
  )
}

function JdIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
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

function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
    </div>
  )
}
