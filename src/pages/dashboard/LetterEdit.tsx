import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { activeWorkforceEmployees, withLinkedEmployee } from '../../lib/lifecycle'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { DocumentEditShell, EDITOR_STICKY_TOP_PX } from '../../components/editor/DocumentEditShell'
import { SaveAsTemplateModal } from '../../components/SaveAsTemplateButton'
import { ToolbarButton } from '../../components/editor/ToolbarButton'
import { ToolbarMoreMenu, type ToolbarMenuItem } from '../../components/editor/ToolbarMoreMenu'
import { buildExportMenuItem } from '../../components/editor/exportMenuItem'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { DateTimePicker } from '../../components/DateTimePicker'
import { useLang } from '../../contexts/LanguageContext'
import { type EmpDeptShape } from '../../lib/employee'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useDocumentViewPref } from '../../hooks/useDocumentViewPref'
import { useSaveFlash } from '../../hooks/useSaveFlash'
import { emptyDocumentDoc, type DocumentDoc, type LanguageMode } from '../../lib/documentDoc'
import { useBilling } from '../../contexts/BillingContext'
import { documentHistoryPath } from '../../lib/documentTypes'
import { trashDocument } from '../../lib/trash'
import { exportDocumentPdf, type ExportDocumentPdfOptions } from '../../lib/pdfExport'
import type { User, Tag, Employee, Organization } from '../../types/aliases'
import type { Database } from '../../types/database'

type Letter = Database['public']['Tables']['letters']['Row']
type LetterUpdate = Database['public']['Tables']['letters']['Update']
type EmployeeWithDepartments = Employee & EmpDeptShape


// Slim user shape for the Sender dropdown — just what we need to render the option label.
interface SenderUser {
  id: string
  name: string
  title: string | null
}

export function LetterEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tplOpen, setTplOpen] = useState(false)
  const { flash: savedFlash, show: showSaved } = useSaveFlash()
  const { canWrite } = useBilling()
  const { view, setView } = useDocumentViewPref('letter', id ?? null)
  // language_mode read/written via cast — database.ts not regenerated yet.
  // Letters save via a plain .update() (no snapshot translate), so the
  // off-side is never auto-filled regardless; the mode only drives rendering.
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bilingual')
  const [savedLanguageMode, setSavedLanguageMode] = useState<LanguageMode>('bilingual')
  const [downloading, setDownloading] = useState(false)
  const [exportingDocx, setExportingDocx] = useState(false)

  const [letter, setLetter] = useState<Letter | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeWithDepartments[]>([])
  const [senderCandidates, setSenderCandidates] = useState<SenderUser[]>([])

  const [title, setTitle] = useState('')
  const [contentDoc, setContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [savedContentDoc, setSavedContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [status, setStatus] = useState<'draft' | 'issued' | 'archived'>('draft')

  // Letter-specific fields
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [senderUserId, setSenderUserId] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [subject, setSubject] = useState('')
  const [responseByDate, setResponseByDate] = useState('')
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false)

  const [saving, setSaving] = useState(false)
  const [savingMode, setSavingMode] = useState<'draft' | 'issue' | null>(null)
  const [error, setError] = useState('')

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  const applyLetter = useCallback((row: Letter) => {
    setLetter(row)
    setTitle(row.title)
    {
      // applyLetter runs on load AND after each save, so it doubles as the
      // dirty-tracking baseline reset for language_mode.
      const loadedMode = (row as { language_mode?: LanguageMode }).language_mode ?? 'bilingual'
      setLanguageMode(loadedMode)
      setSavedLanguageMode(loadedMode)
    }
    const loadedDoc = (row.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
    setContentDoc(loadedDoc)
    setSavedContentDoc(loadedDoc)
    setStatus(row.status as typeof status)
    setEmployeeId(row.employee_id)
    setSenderUserId(row.sender_user_id)
    setCategory(row.category ?? '')
    setTypeCode(row.type_code ?? '')
    setReferenceNumber(row.reference_number ?? '')
    setSubject(row.subject ?? '')
    setResponseByDate(row.response_by_date ?? '')
    setRequiresAcknowledgement(row.requires_acknowledgement)
  }, [])

  useEffect(() => {
    async function load() {
      const [letterResult, tagsResult, letterTagsResult, empsResult, orgResult, usersResult] = await Promise.all([
        supabase.from('letters').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('letter_tags').select('tag_id').eq('letter_id', id!),
        activeWorkforceEmployees(user.org_id),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('users').select('id, name, title').eq('org_id', user.org_id).order('name'),
      ])

      // Scope to the real workforce; union any already-linked employee (incl.
      // a recruit or separated staffer) so the letter still shows its addressee.
      const loadedEmployees = await withLinkedEmployee(
        (empsResult.data || []) as unknown as EmployeeWithDepartments[],
        letterResult.data?.employee_id,
      )
      setAllEmployees(loadedEmployees)
      setOrganization(orgResult.data)
      setSenderCandidates((usersResult.data || []) as SenderUser[])

      if (letterResult.data) {
        applyLetter(letterResult.data)
        // Default the sender to the current user if the row hasn't been
        // touched (sender_user_id == null) — saves a click for the
        // common "I am issuing this myself" case.
        if (!letterResult.data.sender_user_id) {
          setSenderUserId(user.id)
        }
      }

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((letterTagsResult.data || []).map(lt => lt.tag_id)))
    }
    load()
  }, [id, user.org_id, user.id, applyLetter])

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
    const { data, error: tagErr } = await supabase
      .from('tags')
      .insert({ org_id: user.org_id, name })
      .select()
      .single()
    if (tagErr) { alert(tagErr.message); return }
    if (data) {
      setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTagIds(prev => new Set([...prev, data.id]))
      setNewTagName('')
    }
  }

  const docChanged = useMemo(
    () => JSON.stringify(contentDoc) !== JSON.stringify(savedContentDoc),
    [contentDoc, savedContentDoc],
  )

  // Required fields for Issue. Shown as a small red dot next to each
  // missing label so the user can see at a glance why the Issue button
  // is disabled, instead of having to hover for the tooltip.
  const missingRequiredFields: { key: string; label: string }[] = useMemo(() => {
    if (!letter || letter.is_template) return []
    const out: { key: string; label: string }[] = []
    if (!employeeId) out.push({ key: 'employee', label: 'Recipient' })
    if (!senderUserId) out.push({ key: 'sender', label: 'Sender' })
    return out
  }, [letter, employeeId, senderUserId])
  const missingKeys = new Set(missingRequiredFields.map(f => f.key))

  const modeChanged = languageMode !== savedLanguageMode
  const hasChanges = letter ? (
    docChanged || modeChanged ||
    title !== letter.title ||
    employeeId !== letter.employee_id ||
    senderUserId !== letter.sender_user_id ||
    category !== (letter.category ?? '') ||
    typeCode !== (letter.type_code ?? '') ||
    referenceNumber !== (letter.reference_number ?? '') ||
    subject !== (letter.subject ?? '') ||
    responseByDate !== (letter.response_by_date ?? '') ||
    requiresAcknowledgement !== letter.requires_acknowledgement
  ) : false

  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  // Save the live letter row + sync tags. Doesn't write to letter_versions —
  // version snapshots are written by the issue_letter RPC. Post-issue edits
  // currently update the live row in place; richer post-issue versioning is
  // a follow-up.
  async function persistLetter(): Promise<Letter | null> {
    if (!letter) return null
    setError('')
    setSaving(true)

    const update: LetterUpdate = {
      title,
      employee_id: employeeId,
      sender_user_id: senderUserId,
      category: category || null,
      type_code: typeCode || null,
      reference_number: referenceNumber || null,
      subject: subject || null,
      response_by_date: responseByDate || null,
      requires_acknowledgement: requiresAcknowledgement,
      content_doc: contentDoc as Letter['content_doc'],
      updated_at: new Date().toISOString(),
    }
    const { data, error: updateError } = await supabase
      .from('letters')
      // language_mode isn't in the generated LetterUpdate type yet → cast the payload.
      .update({ ...update, language_mode: languageMode } as LetterUpdate)
      .eq('id', letter.id)
      .select()
      .single()

    if (updateError || !data) {
      setError(updateError?.message ?? 'Save failed')
      setSaving(false)
      return null
    }

    // Sync tags — delete-all-then-insert mirrors the sop_tags / contract_tags pattern.
    await supabase.from('letter_tags').delete().eq('letter_id', letter.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('letter_tags').insert(
        [...selectedTagIds].map(tag_id => ({ letter_id: letter.id, tag_id }))
      )
    }

    applyLetter(data)
    setSaving(false)
    return data
  }

  async function handleSaveAsDraft() {
    setSavingMode('draft')
    try {
      const saved = await persistLetter()
      if (saved) showSaved(false)
    } finally { setSavingMode(null) }
  }

  async function handleIssue() {
    if (!letter) return
    setSavingMode('issue')
    try {
      // Save any pending edits before issuing so the snapshot reflects them.
      const saved = await persistLetter()
      if (!saved) return
      const { data, error: rpcError } = await supabase.rpc('issue_letter', { p_letter_id: letter.id })
      if (rpcError) { setError(rpcError.message); return }
      if (data) applyLetter(data as unknown as Letter)
    } finally {
      setSavingMode(null)
    }
  }

  if (!letter) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties
  // Required-but-empty fields get a red border (same condition as the
  // missing-field dot) so the "fill me before issuing" cue is unmissable.
  const fieldStyle = (key: string): React.CSSProperties =>
    missingKeys.has(key) ? { ...inputStyle, borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)' } : inputStyle

  const isIssued = status === 'issued'
  const isArchived = status === 'archived'
  // Issue is only meaningful for drafts that have both an employee and a sender.
  const canIssue = status === 'draft' && !!employeeId && !!senderUserId

  function missingDot(key: string) {
    if (!missingKeys.has(key)) return null
    return (
      <span
        aria-hidden="true"
        title={t.letterRequiredDotHint}
        className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
        style={{ backgroundColor: 'var(--color-danger, #b91c1c)' }}
      />
    )
  }

  const statusColors: Record<string, string> = {
    draft: 'var(--color-warning)',
    issued: 'var(--color-success)',
    archived: 'var(--color-text-tertiary)',
  }
  const statusLabel: Record<string, string> = {
    draft: t.statusDraft,
    issued: t.statusIssued,
    archived: t.statusArchived,
  }

  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: 'var(--color-border)', color: statusColors[status], backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
      {statusLabel[status]}
    </span>
  )

  async function handleDelete() {
    if (!id) return
    if (!confirm(t.deleteDocumentConfirm(title))) return
    setSaving(true)
    setError('')
    try {
      await trashDocument(id, 'letter')
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function buildExportArgs(): ExportDocumentPdfOptions {
    // Same merge context the editor uses (recipient + sender + org), so the
    // PDF/Word resolves the letter's pills exactly as shown on screen.
    const baseCtx = {
      employee: employeeId ? (allEmployees.find(e => e.id === employeeId) ?? null) : null,
      organization,
      today: new Date(),
      signer: senderRow ? { name: senderRow.name, title: senderRow.title } : null,
    }
    return {
      doc: contentDoc,
      title: title || t.letterTypeLabel,
      view,
      languageMode,
      contextEn: { ...baseCtx, lang: 'en' },
      contextId: { ...baseCtx, lang: 'id' },
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

  const menuItems: ToolbarMenuItem[] = [
    buildExportMenuItem({ onPdf: handleDownloadPdf, onDocx: handleDownloadDocx, exporting: downloading ? 'pdf' : exportingDocx ? 'docx' : null, t }),
    { key: 'template', icon: 'template', label: t.contractSaveAsTemplate, onClick: () => setTplOpen(true), disabled: !canWrite, title: !canWrite ? t.dunningWriteBlocked : undefined },
    { key: 'history', icon: 'history', label: t.historyLinkLabel, to: documentHistoryPath('letter', letter.id) },
    { key: 'delete', icon: 'trash', label: t.delete, onClick: handleDelete, danger: true, disabled: saving || !canWrite, title: !canWrite ? t.dunningWriteBlocked : undefined },
  ]

  const actions = (
    <>
      <ToolbarMoreMenu items={menuItems} />
      <ToolbarButton
        variant="save"
        onClick={handleSaveAsDraft}
        disabled={saving || !canWrite || (!hasChanges && status === 'draft')}
        title={!canWrite ? t.dunningWriteBlocked : undefined}
        loading={savingMode === 'draft'}
      >
        {savingMode === 'draft' ? t.saving : t.saveAsDraft}
      </ToolbarButton>
      <ToolbarButton
        variant="primary"
        onClick={handleIssue}
        disabled={saving || !canWrite || !canIssue}
        title={
          !canWrite ? t.dunningWriteBlocked :
          !employeeId ? t.letterIssueDisabledNoEmployee :
          !senderUserId ? t.letterIssueDisabledNoSender :
          isIssued ? t.letterIssueDisabledAlreadyIssued :
          isArchived ? t.letterIssueDisabledArchived :
          undefined
        }
        loading={savingMode === 'issue'}
      >
        {savingMode === 'issue' ? t.letterIssuing : isIssued ? t.letterIssuedButton : t.letterIssueButton}
      </ToolbarButton>
      {tplOpen && (
        <SaveAsTemplateModal
          orgId={user.org_id}
          defaultTitle={title}
          source={{ type: 'letter', contentDoc }}
          onClose={() => setTplOpen(false)}
        />
      )}
    </>
  )

  const sidebar = (
    <>
      {/* Employee — nullable. Tagging enables but does not auto-fire the Issue action. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterRecipientLabel}{missingDot('employee')}</label>
        <EmployeeSelect
          invalid={missingKeys.has('employee')}
          value={employeeId}
          onChange={setEmployeeId}
          employees={allEmployees}
          disabled={!canWrite || isIssued || isArchived}
          emptyLabel={t.letterNoRecipient}
        />
      </div>

      {/* Sender — required for issuing. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterSenderLabel}{missingDot('sender')}</label>
        <div className="relative">
          <select
            value={senderUserId || ''}
            onChange={e => setSenderUserId(e.target.value || null)}
            disabled={!canWrite || isIssued || isArchived}
            className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm disabled:opacity-50"
            style={fieldStyle('sender')}
          >
            <option value="">{t.letterNoSender}</option>
            {senderCandidates.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}{u.title ? ` · ${u.title}` : ''}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Category — display label, eventually populated by template choice. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterCategoryLabel}</label>
        <input
          type="text"
          value={category}
          onChange={e => setCategory(e.target.value)}
          disabled={!canWrite || isIssued || isArchived}
          placeholder={t.letterCategoryPlaceholder}
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          style={inputStyle}
        />
      </div>

      {/* Type code — short code substituted into the reference number template. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterTypeCodeLabel}</label>
        <input
          type="text"
          value={typeCode}
          onChange={e => setTypeCode(e.target.value.toUpperCase())}
          disabled={!canWrite || isIssued || isArchived}
          placeholder="OL"
          maxLength={6}
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          style={inputStyle}
        />
      </div>

      {/* Reference number — auto-generated on issue if blank; editable otherwise. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterReferenceNumberLabel}</label>
        <input
          type="text"
          value={referenceNumber}
          onChange={e => setReferenceNumber(e.target.value)}
          disabled={!canWrite || isArchived}
          placeholder={status === 'draft' ? t.letterReferenceNumberAutoPlaceholder : ''}
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          style={inputStyle}
        />
      </div>

      {/* Subject. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterSubjectLabel}</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          disabled={!canWrite || isIssued || isArchived}
          placeholder={t.letterSubjectPlaceholder}
          className="w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          style={inputStyle}
        />
      </div>

      {/* Response-by date — optional deadline shown in the portal. */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.letterResponseByLabel}</label>
        <DateTimePicker
          value={responseByDate}
          onChange={setResponseByDate}
          mode="date"
          disabled={!canWrite || isArchived}
          placeholder={t.letterResponseByPlaceholder}
        />
      </div>

      {/* Acknowledgement toggle — opt-in "I read this" flow. */}
      <div>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={requiresAcknowledgement}
            onChange={e => setRequiresAcknowledgement(e.target.checked)}
            disabled={!canWrite || isArchived}
            className="mt-0.5"
          />
          <span className="text-xs" style={{ color: 'var(--color-text)' }}>
            {t.letterRequiresAckLabel}
            <span className="block text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.letterRequiresAckHelp}
            </span>
          </span>
        </label>
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
                disabled={!canWrite}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all disabled:opacity-50"
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
              disabled={!canWrite}
              className="w-20 rounded-full border px-2.5 py-0.5 text-[11px] outline-none disabled:opacity-50"
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
    </>
  )

  // Pick the sender row for merge context — letters often reference
  // the sender's name and title in the body (e.g. "[Sender], [Position]").
  const senderRow = senderUserId ? senderCandidates.find(u => u.id === senderUserId) ?? null : null

  return (
    <DocumentEditShell
      storageKey="letterEdit"
      icon={<LetterIcon />}
      accent="var(--color-text-secondary)"
      typeLabel={t.letterTypeLabel}
      title={title}
      onTitleChange={setTitle}
      canEditTitle={canWrite && !isIssued && !isArchived}
      badge={badge}
      backTo="/dashboard/documents"
      dirty={hasChanges}
      savedFlash={savedFlash}
      actions={actions}
      error={error}
      sidebar={sidebar}
      outlineDoc={contentDoc}
    >
      <DocumentEditor
        initialDoc={contentDoc}
        onChange={setContentDoc}
        view={view}
        onViewChange={setView}
        languageMode={languageMode}
        onLanguageModeChange={setLanguageMode}
        stickyToolbar
        stickyToolbarOffset={`${EDITOR_STICKY_TOP_PX}px`}
        mergeFields={{
          scope: 'letter',
          getContext: () => ({
            employee: employeeId ? (allEmployees.find(e => e.id === employeeId) ?? null) : null,
            organization,
            today: new Date(),
            lang: 'en',
            signer: senderRow ? { name: senderRow.name, title: senderRow.title } : null,
          }),
        }}
        aiGenerate={{ docType: 'sop', title }}
      />
    </DocumentEditShell>
  )
}

function LetterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}
