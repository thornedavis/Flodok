import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { useLang } from '../../contexts/LanguageContext'
import { primaryDept, type EmpDeptShape } from '../../lib/employee'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useDocumentViewPref } from '../../hooks/useDocumentViewPref'
import { writeSnapshot } from '../../lib/snapshotApi'
import { emptyDocumentDoc, type DocumentDoc } from '../../lib/documentDoc'
import { exportDocumentPdf } from '../../lib/pdfExport'
import { useBilling } from '../../contexts/BillingContext'
import { documentHistoryPath } from '../../lib/documentTypes'
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
  const [, setEmployee] = useState<EmployeeWithDepartments | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeWithDepartments[]>([])
  const [employeeId, setEmployeeId] = useState<string | null>(null)
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

  useEffect(() => {
    async function load() {
      const [sopResult, tagsResult, sopTagsResult, empsResult, orgResult] = await Promise.all([
        supabase.from('sops').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('sop_tags').select('tag_id').eq('sop_id', id!),
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).order('name'),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
      ])

      setAllEmployees((empsResult.data || []) as EmployeeWithDepartments[])
      setOrganization(orgResult.data)

      if (sopResult.data) {
        setSOP(sopResult.data)
        setTitle(sopResult.data.title)
        const loadedDoc = (sopResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(loadedDoc)
        setSavedContentDoc(loadedDoc)
        setStatus(sopResult.data.status as typeof status)
        setEmployeeId(sopResult.data.employee_id)

        if (sopResult.data.employee_id) {
          const emp = ((empsResult.data || []) as EmployeeWithDepartments[]).find(e => e.id === sopResult.data.employee_id)
          if (emp) setEmployee(emp)
        }
      }

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((sopTagsResult.data || []).map(st => st.tag_id)))
    }
    load()
  }, [id, user.org_id])

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
  const employeeChanged = sop ? employeeId !== sop.employee_id : false
  const hasChanges = sop ? (
    docChanged || employeeChanged ||
    title !== sop.title ||
    status !== sop.status ||
    changeSummary !== ''
  ) : false

  // Registers the navigation guard; the header exit link trips it when
  // there are unsaved changes.
  useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  // Persists the SOP at the given target status. Same shape as the contract
  // editor: replaces the old status dropdown + Save with explicit
  // "Save as draft" and "Publish" actions, both of which call this.
  async function persistSOP(nextStatus: 'active' | 'draft' | 'archived') {
    if (!sop) return
    setError('')
    setSaving(true)

    // Write metadata (title, status, employee_id) first so the snapshot
    // helper — which re-reads the row to render merge fields — sees the
    // about-to-be-saved employee. The snapshot helper then owns the
    // structured doc, derived markdown columns, and current_version.
    const { error: updateError } = await supabase
      .from('sops')
      .update({
        title,
        employee_id: employeeId,
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

    setStatus(nextStatus)

    if (!docChanged) {
      setSOP({ ...sop, title, employee_id: employeeId, status: nextStatus })
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
    setSOP({ ...sop, content_markdown: result.content_markdown, content_markdown_id: result.content_markdown_id, content_doc: result.content_doc as Sop['content_doc'], current_version: result.version_number, title, employee_id: employeeId, status: nextStatus })

    if (employeeId) {
      await supabase.from('feed_events').insert({
        org_id: user.org_id,
        employee_id: employeeId,
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
        employee: allEmployees.find(e => e.id === employeeId) ?? null,
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.editSopTitle}</h1>
          {/* Read-only status pill — the old dropdown lied because flipping
              it didn't actually save anything. Status now advances via the
              explicit Save as draft / Publish buttons. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: 'var(--color-border)', color: statusColors[status], backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
            {status === 'active' ? t.statusActive : status === 'archived' ? t.statusArchived : t.statusDraft}
          </span>
          {status === 'active' && hasChanges && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.editingActiveWillBumpVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={documentHistoryPath('sop', sop.id)}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.historyLinkLabel}
          </Link>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {downloading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {downloading ? t.generatingPdf : t.downloadPdf}
          </button>
          <button
            onClick={() => navigate('/dashboard/documents')}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.backToDocuments}
          </button>
          <button
            onClick={handleSaveAsDraft}
            disabled={saving || !canWrite || (!hasChanges && status === 'draft')}
            title={!canWrite ? t.dunningWriteBlocked : undefined}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {savingMode === 'draft' ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {translating ? t.savingTranslating : t.saving}
              </>
            ) : t.saveAsDraft}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || !canWrite || (!hasChanges && status === 'active')}
            title={!canWrite ? t.dunningWriteBlocked : undefined}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {savingMode === 'active' ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {translating ? t.savingTranslating : t.publishing}
              </>
            ) : t.publish}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Title + Employee + Tags row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.employeeLabel}</label>
            <div className="relative">
              <select
                value={employeeId || ''}
                onChange={e => {
                  const val = e.target.value
                  setEmployeeId(val || null)
                  setEmployee(allEmployees.find(emp => emp.id === val) || null)
                }}
                className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm"
                style={inputStyle}
              >
                <option value="">{t.noEmployeeLinked}</option>
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{primaryDept(emp) ? ` (${primaryDept(emp)})` : ''}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tagsLabel}</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const isSelected = selectedTagIds.has(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-all"
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
                  className="w-24 rounded-full border px-3 py-1 text-xs outline-none"
                  style={inputStyle}
                />
                {newTagName.trim() && (
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="rounded-full px-2 py-1 text-xs font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {t.addShort}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contentLabel}</label>
          </div>
          {/* Bilingual editor — both EN and ID slots authored side-by-side
              within the same canvas. The old EN/ID switcher and whole-doc
              translate button are gone; per-block translation arrives in
              Phase E (BubbleMenu). AI generation will return as a
              structured-doc producer in a follow-up. */}
          <DocumentEditor
            initialDoc={contentDoc}
            onChange={setContentDoc}
            view={view}
            onViewChange={setView}
            mergeFields={{
              scope: 'sop',
              getContext: () => ({
                employee: allEmployees.find(e => e.id === employeeId) ?? null,
                organization,
                today: new Date(),
                lang: 'en',
              }),
            }}
            aiGenerate={{ docType: 'sop', title }}
          />
        </div>
      </div>
    </div>
  )
}
