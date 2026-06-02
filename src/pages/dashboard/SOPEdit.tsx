import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { DocumentEditShell, EDITOR_STICKY_TOP_PX } from '../../components/editor/DocumentEditShell'
import { SaveAsTemplateButton } from '../../components/SaveAsTemplateButton'
import { AudiencePicker, type AudienceTarget, type AudienceEmployee, type NamedRef } from '../../components/AudiencePicker'
import { SopSignatureProgress, type SignatureProgressData } from '../../components/SopSignatureProgress'
import { useLang } from '../../contexts/LanguageContext'
import { primaryDept, type EmpDeptShape } from '../../lib/employee'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useDocumentViewPref } from '../../hooks/useDocumentViewPref'
import { writeSnapshot } from '../../lib/snapshotApi'
import { emptyDocumentDoc, type DocumentDoc } from '../../lib/documentDoc'
import { exportDocumentPdf } from '../../lib/pdfExport'
import { useBilling } from '../../contexts/BillingContext'
import { documentHistoryPath } from '../../lib/documentTypes'
import { trashDocument } from '../../lib/trash'
import type { User, Sop, Tag, Employee, Organization } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

export function SOPEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const { view, setView } = useDocumentViewPref('sop', id ?? null)
  const [sop, setSOP] = useState<Sop | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeWithDepartments[]>([])
  const [title, setTitle] = useState('')
  // Phase C source of truth: the full structured document. Local
  // `contentDoc` mirrors the editor state; `savedContentDoc` captures
  // the last persisted shape so we can detect unsaved changes via
  // deep-equality. Markdown derivation happens server-side on save.
  const [contentDoc, setContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [savedContentDoc, setSavedContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [translating, setTranslating] = useState(false)
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('draft')
  const [changeSummary] = useState('')
  const [saving, setSaving] = useState(false)
  // Which save action is currently running. Distinct from `saving`
  // (a generic boolean) so only the clicked button shows the spinner
  // and "Translating…" label rather than both buttons mirroring it.
  const [savingMode, setSavingMode] = useState<'draft' | 'active' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  // Audience targeting (sop_audience) + owner department (sops.owner_department_id).
  // When the audience is a single 'employee' target we mirror it into
  // sops.employee_id (compatEmployeeId, below) so legacy PDF merge context
  // and feed events keep working for the 1:1 case.
  const [audienceTargets, setAudienceTargets] = useState<AudienceTarget[]>([])
  const [savedAudienceTargets, setSavedAudienceTargets] = useState<AudienceTarget[]>([])
  const [ownerDepartmentId, setOwnerDepartmentId] = useState<string | null>(null)
  const [savedOwnerDepartmentId, setSavedOwnerDepartmentId] = useState<string | null>(null)
  const [departments, setDepartments] = useState<NamedRef[]>([])
  const [branches, setBranches] = useState<NamedRef[]>([])
  const [jobPositions, setJobPositions] = useState<NamedRef[]>([])
  const [jobLevels, setJobLevels] = useState<NamedRef[]>([])
  const [employeeClasses, setEmployeeClasses] = useState<NamedRef[]>([])
  const [sigProgress, setSigProgress] = useState<SignatureProgressData | null>(null)
  const [sigProgressLoading, setSigProgressLoading] = useState(true)

  // Fetch the signature progress for the current SOP version. Called on
  // mount and again after publish so the panel reflects the new version's
  // required-signer set without a full page reload. Wrapped in useCallback
  // so the load effect can list it as a dependency without re-firing.
  const loadSignatureProgress = useCallback(async () => {
    if (!id) return
    setSigProgressLoading(true)
    const { data, error } = await supabase.rpc('sop_signature_progress', { p_sop_id: id })
    if (!error && data) setSigProgress(data as unknown as SignatureProgressData)
    setSigProgressLoading(false)
  }, [id])

  useEffect(() => {
    async function load() {
      const [
        sopResult, tagsResult, sopTagsResult, empsResult, orgResult,
        deptsResult, branchesResult, refValuesResult, audienceResult,
      ] = await Promise.all([
        supabase.from('sops').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('sop_tags').select('tag_id').eq('sop_id', id!),
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).order('name'),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('company_departments').select('id, name').eq('org_id', user.org_id).order('name'),
        supabase.from('company_branches').select('id, name').eq('org_id', user.org_id).eq('is_active', true).order('name'),
        supabase.from('company_reference_values').select('id, name, kind').eq('org_id', user.org_id).in('kind', ['job_position', 'job_level', 'employee_class']).order('name'),
        supabase.from('sop_audience').select('*').eq('sop_id', id!),
      ])
      // Signature progress fetched separately — it depends on the audience
      // rows having been loaded above so calling it last keeps the
      // returned counts consistent with what we're about to render.
      loadSignatureProgress()

      const loadedEmps = (empsResult.data || []) as EmployeeWithDepartments[]
      setAllEmployees(loadedEmps)
      setOrganization(orgResult.data)
      setDepartments(deptsResult.data || [])
      setBranches(branchesResult.data || [])

      const refValues = (refValuesResult.data || []) as { id: string; name: string; kind: string }[]
      setJobPositions(refValues.filter(r => r.kind === 'job_position').map(r => ({ id: r.id, name: r.name })))
      setJobLevels(refValues.filter(r => r.kind === 'job_level').map(r => ({ id: r.id, name: r.name })))
      setEmployeeClasses(refValues.filter(r => r.kind === 'employee_class').map(r => ({ id: r.id, name: r.name })))

      if (sopResult.data) {
        setSOP(sopResult.data)
        setTitle(sopResult.data.title)
        const loadedDoc = (sopResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(loadedDoc)
        setSavedContentDoc(loadedDoc)
        setStatus(sopResult.data.status as typeof status)
        setOwnerDepartmentId(sopResult.data.owner_department_id)
        setSavedOwnerDepartmentId(sopResult.data.owner_department_id)
      }

      // Map sop_audience rows into the picker's AudienceTarget shape.
      const audienceRows = (audienceResult.data || []) as {
        target_type: string
        employee_id: string | null
        department_id: string | null
        branch_id: string | null
        reference_id: string | null
      }[]
      const empById = new Map(loadedEmps.map(e => [e.id, e.name]))
      const deptById = new Map((deptsResult.data || []).map(d => [d.id, d.name]))
      const branchById = new Map((branchesResult.data || []).map(b => [b.id, b.name]))
      const refById = new Map(refValues.map(r => [r.id, r.name]))
      const targets: AudienceTarget[] = audienceRows.flatMap((row): AudienceTarget[] => {
        switch (row.target_type) {
          case 'everyone':
            return [{ type: 'everyone', id: null, label: 'Everyone' }]
          case 'employee':
            return row.employee_id && empById.has(row.employee_id)
              ? [{ type: 'employee', id: row.employee_id, label: empById.get(row.employee_id)! }]
              : []
          case 'department':
            return row.department_id && deptById.has(row.department_id)
              ? [{ type: 'department', id: row.department_id, label: deptById.get(row.department_id)! }]
              : []
          case 'branch':
            return row.branch_id && branchById.has(row.branch_id)
              ? [{ type: 'branch', id: row.branch_id, label: branchById.get(row.branch_id)! }]
              : []
          case 'job_position':
          case 'job_level':
          case 'employee_class':
            return row.reference_id && refById.has(row.reference_id)
              ? [{ type: row.target_type, id: row.reference_id, label: refById.get(row.reference_id)! }]
              : []
          default:
            return []
        }
      })
      setAudienceTargets(targets)
      setSavedAudienceTargets(targets)

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((sopTagsResult.data || []).map(st => st.tag_id)))
    }
    load()
  }, [id, user.org_id, loadSignatureProgress])

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  async function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) return

    const { data, error } = await supabase
      .from('tags')
      .insert({ org_id: user.org_id, name })
      .select()
      .single()

    if (error) { alert(error.message); return }
    if (data) {
      setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTagIds(prev => new Set([...prev, data.id]))
      setNewTagName('')
    }
  }

  // Phase C.2 note: handleTranslate (whole-doc translation) and
  // handleGenerate (AI markdown generation) were removed when the
  // markdown editor was replaced. Per-block translation arrives in
  // Phase E (per-block dirty tracking + BubbleMenu). AI generation
  // will return as a structured-doc producer in a follow-up.

  // Deep-equality on the doc JSON catches structural changes (block
  // text, section titles, etc.) without false positives from the
  // editor handing us a fresh object on every keystroke.
  const docChanged = useMemo(
    () => JSON.stringify(contentDoc) !== JSON.stringify(savedContentDoc),
    [contentDoc, savedContentDoc],
  )
  const audienceChanged = useMemo(() => {
    if (audienceTargets.length !== savedAudienceTargets.length) return true
    const key = (t: AudienceTarget) => `${t.type}:${t.id ?? ''}`
    const a = new Set(audienceTargets.map(key))
    return savedAudienceTargets.some(t => !a.has(key(t)))
  }, [audienceTargets, savedAudienceTargets])
  const ownerDeptChanged = ownerDepartmentId !== savedOwnerDepartmentId
  const hasChanges = sop ? (
    docChanged || audienceChanged || ownerDeptChanged ||
    title !== sop.title ||
    status !== sop.status ||
    changeSummary !== ''
  ) : false

  // Project employees into the AudiencePicker's shape — primaryDept for
  // the sublabel display, departmentIds for client-side resolution.
  const audienceEmployees: AudienceEmployee[] = useMemo(
    () => allEmployees.map(e => ({
      id: e.id,
      name: e.name,
      branch_name: e.branch_name ?? null,
      job_position: e.job_position ?? null,
      job_level: e.job_level ?? null,
      class: e.class ?? null,
      departmentIds: (e.employee_departments ?? []).map(ed => ed.department?.id).filter((id): id is string => !!id),
      primaryDept: primaryDept(e),
    })),
    [allEmployees],
  )

  // Single-target compatibility shim: if the audience is exactly one
  // 'employee' target, mirror it into sops.employee_id so legacy PDF
  // merge context and feed events keep working for the 1:1 case.
  // Multi-target / group audiences write null and skip those legacy paths.
  const compatEmployeeId = useMemo(() => {
    if (audienceTargets.length === 1 && audienceTargets[0].type === 'employee' && audienceTargets[0].id) {
      return audienceTargets[0].id
    }
    return null
  }, [audienceTargets])

  // Registers the navigation guard; the header exit link trips it when
  // there are unsaved changes.
  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  // Persists the SOP at the given target status. Same shape as the contract
  // editor: replaces the old status dropdown + Save with explicit
  // "Save as draft" and "Publish" actions, both of which call this.
  async function persistSOP(nextStatus: 'active' | 'draft' | 'archived') {
    if (!sop) return
    setError('')
    setSaving(true)

    // Write metadata (title, status, employee_id, owner_department_id)
    // first so the snapshot helper — which re-reads the row to render merge
    // fields — sees the about-to-be-saved values. The snapshot helper then
    // owns the structured doc, derived markdown columns, and current_version.
    const { error: updateError } = await supabase
      .from('sops')
      .update({
        title,
        employee_id: compatEmployeeId,
        owner_department_id: ownerDepartmentId,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id)

    if (updateError) { setError(updateError.message); setSaving(false); return }

    // Sync tags (metadata — not part of the version snapshot).
    await supabase.from('sop_tags').delete().eq('sop_id', sop.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('sop_tags').insert(
        [...selectedTagIds].map(tag_id => ({ sop_id: sop.id, tag_id }))
      )
    }

    // Sync audience targets. Delete-all-then-insert mirrors the sop_tags
    // pattern above; cheap at the audience-row scale we expect.
    await supabase.from('sop_audience').delete().eq('sop_id', sop.id)
    if (audienceTargets.length > 0) {
      const rows = audienceTargets.map(target => ({
        sop_id: sop.id,
        target_type: target.type,
        employee_id: target.type === 'employee' ? target.id : null,
        department_id: target.type === 'department' ? target.id : null,
        branch_id: target.type === 'branch' ? target.id : null,
        reference_id:
          target.type === 'job_position' || target.type === 'job_level' || target.type === 'employee_class'
            ? target.id
            : null,
        added_by: user.id,
      }))
      const { error: audErr } = await supabase.from('sop_audience').insert(rows)
      if (audErr) { setError(audErr.message); setSaving(false); return }
    }
    setSavedAudienceTargets(audienceTargets)
    setSavedOwnerDepartmentId(ownerDepartmentId)

    // Audience changes (and a possible publish-side version bump below)
    // both shift the required-signer set. Refresh in the background; the
    // panel falls back to its current data until the new payload lands.
    loadSignatureProgress()

    setStatus(nextStatus)

    if (!docChanged) {
      setSOP({ ...sop, title, employee_id: compatEmployeeId, owner_department_id: ownerDepartmentId, status: nextStatus })
      setSaving(false)
      return
    }

    // Single round-trip: send the full structured doc; the helper
    // derives markdown for both languages, renders merge fields, bumps
    // current_version, and inserts the snapshot row.
    setTranslating(true)
    let result
    try {
      result = await writeSnapshot({
        table: 'sops',
        doc_id: sop.id,
        new_content_doc: contentDoc,
        change_summary: changeSummary || null,
        changed_by: user.id,
      })
    } catch (err) {
      setTranslating(false)
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Snapshot failed')
      return
    }
    setTranslating(false)

    // Sync local state to whatever the helper finalized so the form matches
    // the DB after a save (avoids "unsaved changes" reappearing).
    const finalDoc = (result.content_doc as DocumentDoc | null) ?? contentDoc
    setContentDoc(finalDoc)
    setSavedContentDoc(finalDoc)
    setSOP({ ...sop, content_markdown: result.content_markdown, content_markdown_id: result.content_markdown_id, content_doc: result.content_doc as Sop['content_doc'], current_version: result.version_number, title, employee_id: compatEmployeeId, owner_department_id: ownerDepartmentId, status: nextStatus })

    // Feed events only fire for the 1:1 case. Multi-target / group audiences
    // don't fan out individual inbox notifications in this phase.
    if (compatEmployeeId) {
      await supabase.from('feed_events').insert({
        org_id: user.org_id,
        employee_id: compatEmployeeId,
        event_type: 'sop_updated',
        title: title,
        description: `Version ${result.version_number}${changeSummary ? ' — ' + changeSummary : ''}`,
        metadata: { sop_id: sop.id, version: result.version_number },
      })
    }

    setSaving(false)

    // If the auto-translate failed the snapshot still landed — but surface
    // it inline rather than navigating away silently.
    if (result.translation_status === 'failed') {
      setError(t.snapshotTranslationFailed)
      return
    }

    // Persist and stay — saving is decoupled from navigation. Leaving is
    // an explicit action via the header exit link.
  }

  async function handleSaveAsDraft() {
    setSavingMode('draft')
    try { await persistSOP('draft') }
    finally { setSavingMode(null) }
  }
  async function handlePublish() {
    setSavingMode('active')
    try { await persistSOP('active') }
    finally { setSavingMode(null) }
  }

  async function handleDownloadPdf() {
    if (downloading) return
    setDownloading(true)
    try {
      // Same context object for both languages — merge fields that
      // resolve differently per language (signatures, dates) get the
      // lang override from the renderer side.
      const baseCtx = {
        employee: compatEmployeeId ? (allEmployees.find(e => e.id === compatEmployeeId) ?? null) : null,
        organization,
        today: new Date(),
      }
      await exportDocumentPdf({
        doc: contentDoc,
        title: title || 'SOP',
        view,
        contextEn: { ...baseCtx, lang: 'en' },
        contextId: { ...baseCtx, lang: 'id' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    }
    setDownloading(false)
  }

  if (!sop) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: 'var(--color-border)', color: statusColors[status], backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
      {status === 'active' ? t.statusActive : status === 'archived' ? t.statusArchived : t.statusDraft}
    </span>
  )

  async function handleDelete() {
    if (!id) return
    if (!confirm(t.deleteDocumentConfirm(title))) return
    setSaving(true)
    setError('')
    try {
      await trashDocument(id, 'sop')
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <>
      <button type="button" onClick={handleDelete} disabled={saving || !canWrite} title={!canWrite ? t.dunningWriteBlocked : undefined}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}>
        {t.delete}
      </button>
      <Link to={documentHistoryPath('sop', sop.id)} className="rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
        {t.historyLinkLabel}
      </Link>
      <button onClick={handleDownloadPdf} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
        {downloading && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        )}
        {downloading ? t.generatingPdf : t.downloadPdf}
      </button>
      <SaveAsTemplateButton
        orgId={user.org_id}
        defaultTitle={title}
        disabled={!canWrite}
        getSource={() => ({ type: 'sop', contentDoc })}
      />
      <button onClick={handleSaveAsDraft} disabled={saving || !canWrite || (!hasChanges && status === 'draft')} title={!canWrite ? t.dunningWriteBlocked : undefined}
        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
        {savingMode === 'draft' ? (
          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{translating ? t.savingTranslating : t.saving}</>
        ) : t.saveAsDraft}
      </button>
      <button onClick={handlePublish} disabled={saving || !canWrite || (!hasChanges && status === 'active')} title={!canWrite ? t.dunningWriteBlocked : undefined}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
        {savingMode === 'active' ? (
          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{translating ? t.savingTranslating : t.publishing}</>
        ) : t.publish}
      </button>
    </>
  )

  const sidebar = (
    <>
      {/* Title lives in the page top bar as an inline-editable heading. */}

      {/* Audience — who this SOP applies to. Replaces the single-employee
          dropdown; can target individuals, departments, branches, job
          positions, job levels, employee classes, or everyone. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Audience</label>
        <AudiencePicker
          value={audienceTargets}
          onChange={setAudienceTargets}
          employees={audienceEmployees}
          departments={departments}
          branches={branches}
          jobPositions={jobPositions}
          jobLevels={jobLevels}
          employeeClasses={employeeClasses}
          disabled={!canWrite}
        />
      </div>

      {/* Owner department — who maintains this SOP. Distinct from audience
          (who must read it). Free for filtering and "who do I bug about this". */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Owner department</label>
        <div className="relative">
          <select
            value={ownerDepartmentId || ''}
            onChange={e => setOwnerDepartmentId(e.target.value || null)}
            disabled={!canWrite}
            className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm disabled:opacity-50"
            style={inputStyle}
          >
            <option value="">No owner</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.tagsLabel}</label>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(tag => {
            const isSelected = selectedTagIds.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all"
                style={{
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                  color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                }}
              >
                {tag.name}
              </button>
            )
          })}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
              placeholder={t.newTagPlaceholder}
              className="w-20 rounded-full border px-2.5 py-0.5 text-[11px] outline-none"
              style={inputStyle}
            />
            {newTagName.trim() && (
              <button type="button" onClick={handleCreateTag} className="rounded-full px-1.5 py-0.5 text-[11px] font-medium" style={{ color: 'var(--color-primary)' }}>
                {t.addShort}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Signatures — required signers resolved from the audience above,
          with per-version sign status from sop_signatures. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Signatures</label>
        <SopSignatureProgress data={sigProgress} loading={sigProgressLoading} status={status} />
      </div>
    </>
  )

  return (
    <DocumentEditShell
      storageKey="sopEdit"
      icon={<SopIcon />}
      accent="var(--color-primary)"
      typeLabel={t.documentTypeSop}
      title={title}
      onTitleChange={setTitle}
      canEditTitle={canWrite}
      badge={badge}
      headerHint={status === 'active' && hasChanges ? t.editingActiveWillBumpVersion : undefined}
      backTo="/dashboard/documents"
      actions={actions}
      error={error}
      sidebar={sidebar}
      outlineDoc={contentDoc}
    >
      {/* Bilingual editor — both EN and ID slots authored side-by-side
          within the same canvas. */}
      <DocumentEditor
        initialDoc={contentDoc}
        onChange={setContentDoc}
        view={view}
        onViewChange={setView}
        stickyToolbar
        stickyToolbarOffset={`${EDITOR_STICKY_TOP_PX}px`}
        mergeFields={{
          scope: 'sop',
          getContext: () => ({
            employee: compatEmployeeId ? (allEmployees.find(e => e.id === compatEmployeeId) ?? null) : null,
            organization,
            today: new Date(),
            lang: 'en',
          }),
        }}
        aiGenerate={{ docType: 'sop', title }}
      />
    </DocumentEditShell>
  )
}

function SopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  )
}
