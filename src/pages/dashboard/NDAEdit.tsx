import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { DocumentEditShell } from '../../components/editor/DocumentEditShell'
import { SaveAsTemplateModal } from '../../components/SaveAsTemplateButton'
import { ToolbarButton } from '../../components/editor/ToolbarButton'
import { ToolbarMoreMenu, type ToolbarMenuItem } from '../../components/editor/ToolbarMoreMenu'
import { buildExportMenuItem } from '../../components/editor/exportMenuItem'
import { useLang } from '../../contexts/LanguageContext'
import { type EmpDeptShape } from '../../lib/employee'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useDocumentViewPref } from '../../hooks/useDocumentViewPref'
import { useSaveFlash } from '../../hooks/useSaveFlash'
import { exportDocumentPdf, type ExportDocumentPdfOptions } from '../../lib/pdfExport'
import { formatIdrDigits } from '../../lib/credits'
import { writeSnapshot } from '../../lib/snapshotApi'
import { emptyDocumentDoc, type DocumentDoc, type LanguageMode } from '../../lib/documentDoc'
import { buildContractDocumentHash, captureSignatureIp, currentAuthToken, getUserAgent } from '../../lib/signatureFingerprint'
import { SIGNATURE_FONTS, ensureSignatureFontsLoaded } from '../../lib/signatureFonts'
import { DateTimePicker } from '../../components/DateTimePicker'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { useBilling } from '../../contexts/BillingContext'
import { documentHistoryPath } from '../../lib/documentTypes'
import { trashDocument } from '../../lib/trash'
import type { User, Nda, Tag, Employee, Organization } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

ensureSignatureFontsLoaded()

const SURVIVAL_OPTIONS = [1, 2, 3, 5]

function NdaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <rect x="8" y="12" width="8" height="6" rx="1" />
      <path d="M10 12v-2a2 2 0 0 1 4 0v2" />
    </svg>
  )
}

export function NDAEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tplOpen, setTplOpen] = useState(false)
  const { flash: savedFlash, show: showSaved } = useSaveFlash()
  const { canWrite } = useBilling()
  const { view, setView } = useDocumentViewPref('nda', id ?? null)
  // language_mode read/written via cast — database.ts not regenerated yet.
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bilingual')
  const [savedLanguageMode, setSavedLanguageMode] = useState<LanguageMode>('bilingual')
  const [nda, setNda] = useState<Nda | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeWithDepartments[]>([])
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [contentDoc, setContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [savedContentDoc, setSavedContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [translating, setTranslating] = useState(false)
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('draft')
  const [effectiveDate, setEffectiveDate] = useState<string>('')
  const [survivalYears, setSurvivalYears] = useState<string>('')
  const [penaltyIdr, setPenaltyIdr] = useState<string>('')
  const [documentNumber, setDocumentNumber] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [savingMode, setSavingMode] = useState<'draft' | 'activate' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [exportingDocx, setExportingDocx] = useState(false)
  const [error, setError] = useState('')

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  // Activate & sign flow — mirrors contracts: save first, reveal the panel,
  // write the employer signature row, flip status to active.
  const [showSignPanel, setShowSignPanel] = useState(false)
  const [signerName, setSignerName] = useState(user.name)
  const [signerTitle, setSignerTitle] = useState(user.title || '')
  const [signerFont, setSignerFont] = useState(user.signature_font || SIGNATURE_FONTS[0].name)
  const [signing, setSigning] = useState(false)
  // Live version number that carries a signature (supersede notice — see 168).
  const [signedAtVersion, setSignedAtVersion] = useState<number | null>(null)
  const signPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const [ndaResult, tagsResult, ndaTagsResult, empsResult, orgResult, sigsResult] = await Promise.all([
        supabase.from('ndas').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('nda_tags').select('tag_id').eq('nda_id', id!),
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).order('name'),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('nda_signatures').select('version_number').eq('nda_id', id!),
      ])

      setAllEmployees((empsResult.data || []) as EmployeeWithDepartments[])
      setOrganization(orgResult.data)

      if (ndaResult.data) {
        setNda(ndaResult.data)
        const signedVersions = new Set((sigsResult.data || []).map(s => s.version_number))
        setSignedAtVersion(signedVersions.has(ndaResult.data.current_version) ? ndaResult.data.current_version : null)
        setTitle(ndaResult.data.title)
        {
          const loadedMode = (ndaResult.data as { language_mode?: LanguageMode }).language_mode ?? 'bilingual'
          setLanguageMode(loadedMode)
          setSavedLanguageMode(loadedMode)
        }
        const loadedDoc = (ndaResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(loadedDoc)
        setSavedContentDoc(loadedDoc)
        setStatus(ndaResult.data.status as typeof status)
        setEmployeeId(ndaResult.data.employee_id)
        setEffectiveDate(ndaResult.data.effective_date ?? '')
        setSurvivalYears(ndaResult.data.survival_years?.toString() ?? '')
        setPenaltyIdr(ndaResult.data.penalty_idr?.toString() ?? '')
        setDocumentNumber(ndaResult.data.document_number ?? '')
      }

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((ndaTagsResult.data || []).map(nt => nt.tag_id)))
    }
    load()
  }, [id, user.org_id])

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId)
      return next
    })
  }

  async function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) return
    const { data, error } = await supabase.from('tags').insert({ org_id: user.org_id, name }).select().single()
    if (error) { alert(error.message); return }
    if (data) {
      setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTagIds(prev => new Set([...prev, data.id]))
      setNewTagName('')
    }
  }

  const parsedSurvival = survivalYears.trim() === '' ? null : Number(survivalYears)
  const parsedPenalty = penaltyIdr.trim() === '' ? null : Number(penaltyIdr)

  const docChanged = useMemo(
    () => JSON.stringify(contentDoc) !== JSON.stringify(savedContentDoc),
    [contentDoc, savedContentDoc],
  )
  const structuralChanged = nda ? (
    employeeId !== nda.employee_id ||
    (effectiveDate || null) !== (nda.effective_date || null) ||
    parsedSurvival !== nda.survival_years ||
    parsedPenalty !== nda.penalty_idr ||
    (documentNumber || null) !== (nda.document_number || null)
  ) : false

  // Legal-floor fields before an NDA can be activated & signed: a title, the
  // receiving-party employee, and the effective date.
  const missingRequiredFields: { key: string; label: string }[] = useMemo(() => {
    const out: { key: string; label: string }[] = []
    if (!title.trim()) out.push({ key: 'title', label: t.titleLabel })
    if (!employeeId) out.push({ key: 'employee', label: t.employeeLabel })
    if (!effectiveDate) out.push({ key: 'effectiveDate', label: t.ndaEffectiveDateLabel })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, employeeId, effectiveDate])

  const missingKeys = new Set(missingRequiredFields.map(f => f.key))
  const modeChanged = languageMode !== savedLanguageMode

  const hasChanges = nda ? (
    docChanged || structuralChanged || modeChanged ||
    title !== nda.title ||
    status !== nda.status
  ) : false

  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  async function persistNda(nextStatus: 'active' | 'draft' | 'archived'): Promise<{ versionNumber: number | null } | null> {
    if (!nda) return null
    setError('')
    setSaving(true)

    const snapshotNeeded = docChanged || structuralChanged || modeChanged

    const { error: updateError } = await supabase
      .from('ndas')
      .update({
        title,
        status: nextStatus,
        employee_id: employeeId,
        effective_date: effectiveDate || null,
        survival_years: parsedSurvival,
        penalty_idr: parsedPenalty,
        document_number: documentNumber || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', nda.id)

    if (updateError) { setError(updateError.message); setSaving(false); return null }

    await supabase.from('nda_tags').delete().eq('nda_id', nda.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('nda_tags').insert(
        [...selectedTagIds].map(tag_id => ({ nda_id: nda.id, tag_id })),
      )
    }

    setStatus(nextStatus)

    if (!snapshotNeeded) {
      setNda({
        ...nda,
        title,
        status: nextStatus,
        employee_id: employeeId,
        effective_date: effectiveDate || null,
        survival_years: parsedSurvival,
        penalty_idr: parsedPenalty,
        document_number: documentNumber || null,
      })
      setSaving(false)
      showSaved(false)
      return { versionNumber: null }
    }

    setTranslating(true)
    let result
    try {
      result = await writeSnapshot({
        table: 'ndas',
        doc_id: nda.id,
        new_content_doc: contentDoc,
        language_mode: languageMode,
        change_summary: null,
        changed_by: user.id,
      })
    } catch (err) {
      setTranslating(false)
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Snapshot failed')
      return null
    }
    setTranslating(false)

    const finalDoc = (result.content_doc as DocumentDoc | null) ?? contentDoc
    setContentDoc(finalDoc)
    setSavedContentDoc(finalDoc)
    setNda({
      ...nda,
      title,
      status: nextStatus,
      content_markdown: result.content_markdown,
      content_markdown_id: result.content_markdown_id,
      content_doc: result.content_doc as Nda['content_doc'],
      current_version: result.version_number,
      employee_id: employeeId,
      effective_date: effectiveDate || null,
      survival_years: parsedSurvival,
      penalty_idr: parsedPenalty,
      document_number: documentNumber || null,
    })

    setSaving(false)

    if (result.translation_status === 'failed') {
      setError(t.snapshotTranslationFailed)
      return { versionNumber: result.version_number }
    }

    setSavedLanguageMode(languageMode)
    showSaved(languageMode === 'bilingual')
    return { versionNumber: result.version_number }
  }

  async function handleSaveAsDraft() {
    setSavingMode('draft')
    try {
      await persistNda('draft')
    } finally {
      setSavingMode(null)
    }
  }

  function buildExportArgs(): ExportDocumentPdfOptions {
    const baseCtx = {
      employee: allEmployees.find(e => e.id === employeeId) ?? null,
      organization,
      nda: { effective_date: effectiveDate || null, survival_years: parsedSurvival, penalty_idr: parsedPenalty },
      today: new Date(),
      signer: { name: user.name, title: user.title },
    }
    return {
      doc: contentDoc,
      title: title || 'NDA',
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

  async function handleActivateAndSign() {
    setSavingMode('activate')
    try {
      await runActivateAndSign()
    } finally {
      setSavingMode(null)
    }
  }

  async function runActivateAndSign() {
    if (hasChanges) {
      const result = await persistNda('draft')
      if (!result) return
    }
    setShowSignPanel(true)
    setTimeout(() => signPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  async function handleConfirmSign() {
    if (!nda || !signerName.trim() || signing) return
    setSigning(true)
    setError('')

    const documentHash = await buildContractDocumentHash(nda.content_markdown ?? '', nda.current_version)
    const { data: sigRow, error: sigError } = await supabase
      .from('nda_signatures')
      .insert({
        nda_id: nda.id,
        version_number: nda.current_version,
        signer_role: 'employer',
        signer_user_id: user.id,
        signer_title: signerTitle.trim() || null,
        typed_name: signerName.trim(),
        signature_font: signerFont,
        consent_text: t.ndaEmployerSignConsent,
        document_hash: documentHash,
        user_agent: getUserAgent(),
        signer_email: user.email || null,
      })
      .select()
      .single()

    if (sigError || !sigRow) { setError(sigError?.message || 'sign failed'); setSigning(false); return }

    const token = await currentAuthToken()
    if (token) captureSignatureIp(sigRow.id, { type: 'jwt', token }, 'nda')

    const { error: statusError } = await supabase
      .from('ndas')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', nda.id)

    if (statusError) { setError(statusError.message); setSigning(false); return }

    setStatus('active')
    setNda({ ...nda, status: 'active' })
    setSigning(false)
    setShowSignPanel(false)
  }

  async function handleDelete() {
    if (!nda) return
    if (!confirm(t.deleteDocumentConfirm(title))) return
    setSaving(true)
    setError('')
    try {
      await trashDocument(nda.id, 'nda')
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!nda) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  const activateDisabled = saving || signing || !canWrite || missingRequiredFields.length > 0
  const activateTitle = !canWrite
    ? t.dunningWriteBlocked
    : missingRequiredFields.length > 0
      ? t.activateMissingFieldsTooltip(missingRequiredFields.map(f => f.label).join(', '))
      : undefined

  function missingDot(key: string) {
    if (!missingKeys.has(key)) return null
    return (
      <span
        aria-hidden="true"
        title={t.activateMissingFieldHint}
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: 'var(--color-danger)' }}
      />
    )
  }

  const badge = (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: 'var(--color-border)', color: statusColors[status], backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
      {status === 'active' ? t.statusActive : status === 'archived' ? t.statusArchived : t.statusDraft}
    </span>
  )

  const detailsBadge = missingRequiredFields.length > 0 ? (
    <span
      className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
      style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}
    >
      {missingRequiredFields.length}
    </span>
  ) : undefined

  const menuItems: ToolbarMenuItem[] = [
    buildExportMenuItem({ onPdf: handleDownloadPdf, onDocx: handleDownloadDocx, exporting: downloading ? 'pdf' : exportingDocx ? 'docx' : null, t }),
    { key: 'template', icon: 'template', label: t.contractSaveAsTemplate, onClick: () => setTplOpen(true), disabled: !canWrite, title: !canWrite ? t.dunningWriteBlocked : undefined },
    { key: 'history', icon: 'history', label: t.historyLinkLabel, to: documentHistoryPath('nda', nda.id) },
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
        {savingMode === 'draft' ? (translating ? t.savingTranslating : t.saving) : t.saveAsDraft}
      </ToolbarButton>
      <ToolbarButton
        variant="primary"
        onClick={handleActivateAndSign}
        disabled={activateDisabled}
        title={activateTitle}
        loading={savingMode === 'activate'}
      >
        {savingMode === 'activate'
          ? (translating ? t.savingTranslating : t.saving)
          : missingRequiredFields.length > 0
            ? t.activateNeedsFields(missingRequiredFields.length)
            : t.activateAndSign}
      </ToolbarButton>
      {tplOpen && (
        <SaveAsTemplateModal
          orgId={user.org_id}
          defaultTitle={title}
          source={{ type: 'nda', contentDoc }}
          onClose={() => setTplOpen(false)}
        />
      )}
    </>
  )

  const sidebar = (
    <>
      {/* Employee — the Receiving Party. */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.ndaReceivingPartyLabel}
          {missingDot('employee')}
        </label>
        <EmployeeSelect
          invalid={missingKeys.has('employee')}
          value={employeeId}
          onChange={next => setEmployeeId(next)}
          employees={allEmployees}
        />
      </div>

      {/* Effective date */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.ndaEffectiveDateLabel}
          {missingDot('effectiveDate')}
        </label>
        <DateTimePicker mode="date" value={effectiveDate} onChange={setEffectiveDate} invalid={missingKeys.has('effectiveDate')} />
      </div>

      {/* Survival period */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.ndaSurvivalLabel}</label>
        <select
          value={survivalYears}
          onChange={e => setSurvivalYears(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={inputStyle}
        >
          <option value="">—</option>
          {SURVIVAL_OPTIONS.map(y => (
            <option key={y} value={y}>{t.ndaSurvivalOption(y)}</option>
          ))}
        </select>
      </div>

      {/* Penalty / liquidated damages */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.ndaPenaltyLabel}</label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={formatIdrDigits(penaltyIdr)}
            onChange={e => setPenaltyIdr(e.target.value.replace(/\D/g, ''))}
            placeholder={t.amountIdrPlaceholder}
            className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
            style={inputStyle}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
        </div>
      </div>

      {/* Document number */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.ndaDocumentNumberLabel}</label>
        <input
          type="text"
          value={documentNumber}
          onChange={e => setDocumentNumber(e.target.value)}
          placeholder={t.ndaDocumentNumberPlaceholder}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={inputStyle}
        />
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.tagsLabel}</label>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map(tag => {
            const active = selectedTagIds.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                }}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            type="text"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
            placeholder={t.newTagPlaceholder}
            className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={handleCreateTag}
            className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.addTag}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <DocumentEditShell
      storageKey="ndaEdit"
      icon={<NdaIcon />}
      accent="var(--color-text-secondary)"
      typeLabel={t.documentTypeNda}
      title={title}
      onTitleChange={setTitle}
      canEditTitle={canWrite}
      badge={badge}
      detailsBadge={detailsBadge}
      backTo="/dashboard/documents"
      dirty={hasChanges}
      savedFlash={savedFlash}
      actions={actions}
      error={error}
      sidebar={sidebar}
      outlineDoc={contentDoc}
    >
      {signedAtVersion !== null && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
        >
          {t.signedSupersedeNotice.replace('{v}', String(signedAtVersion))}
        </div>
      )}
      <DocumentEditor
        initialDoc={contentDoc}
        onChange={setContentDoc}
        view={view}
        onViewChange={setView}
        languageMode={languageMode}
        onLanguageModeChange={setLanguageMode}
        mergeFields={{
          scope: 'nda',
          getContext: () => ({
            employee: allEmployees.find(e => e.id === employeeId) ?? null,
            organization,
            nda: { effective_date: effectiveDate || null, survival_years: parsedSurvival, penalty_idr: parsedPenalty },
            today: new Date(),
            lang: 'en',
            signer: { name: user.name, title: user.title },
          }),
        }}
      />

      {showSignPanel && (
        <div ref={signPanelRef} className="mt-6 rounded-xl border p-5" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
          <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.signAsEmployer}</h3>
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.signAsEmployerDesc}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.signerNameLabel}</label>
              <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.signerTitleLabel}</label>
              <input type="text" value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder={t.signerTitlePlaceholder} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
            </div>
          </div>
          <p className="mb-2 mt-4 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.chooseSignatureStyle}</p>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {SIGNATURE_FONTS.map(font => (
              <button
                key={font.name}
                type="button"
                onClick={() => setSignerFont(font.name)}
                className="rounded-xl border px-4 py-3 text-left transition-colors"
                style={{
                  borderColor: signerFont === font.name ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: signerFont === font.name ? 'var(--color-bg)' : 'transparent',
                }}
              >
                <span className="block truncate text-xl" style={{ fontFamily: `'${font.name}', cursive`, color: 'var(--color-text)' }}>
                  {signerName || user.name}
                </span>
                <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{font.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleConfirmSign} disabled={signing || !signerName.trim()}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}>
              {signing && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>}
              {signing ? t.signing : t.confirmAndActivate}
            </button>
            <button onClick={() => setShowSignPanel(false)} disabled={signing} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </DocumentEditShell>
  )
}
