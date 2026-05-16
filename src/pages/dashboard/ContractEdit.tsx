import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { useLang } from '../../contexts/LanguageContext'
import { primaryDept, type EmpDeptShape } from '../../lib/employee'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useDocumentViewPref } from '../../hooks/useDocumentViewPref'
import { exportDocumentPdf } from '../../lib/pdfExport'
import { formatIdrDigits } from '../../lib/credits'
import { InfoTooltip } from '../../components/InfoTooltip'
import { writeSnapshot } from '../../lib/snapshotApi'
import { emptyDocumentDoc, type DocumentDoc } from '../../lib/documentDoc'
import { buildPkwtStarterDoc, type PkwtType } from '../../lib/pkwtStarterDoc'
import { buildContractDocumentHash, captureSignatureIp, currentAuthToken, getUserAgent } from '../../lib/signatureFingerprint'
import { SIGNATURE_FONTS, ensureSignatureFontsLoaded } from '../../lib/signatureFonts'
import { DateTimePicker } from '../../components/DateTimePicker'
import { useBilling } from '../../contexts/BillingContext'
import { documentHistoryPath, documentsIndexPath } from '../../lib/documentTypes'
import type { User, Contract, Tag, Employee, Organization } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

ensureSignatureFontsLoaded()

export function ContractEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const { view, setView } = useDocumentViewPref('contract', id ?? null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [, setEmployee] = useState<EmployeeWithDepartments | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeWithDepartments[]>([])
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  // Phase C source of truth: the full structured document. `contentDoc`
  // mirrors the editor state, `savedContentDoc` captures the last
  // persisted shape so we can deep-equality-detect unsaved changes
  // without false positives from the editor handing us a fresh object
  // each keystroke.
  const [contentDoc, setContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [savedContentDoc, setSavedContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [translating, setTranslating] = useState(false)
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('draft')
  const [baseWageIdr, setBaseWageIdr] = useState<string>('')
  const [allowanceIdr, setAllowanceIdr] = useState<string>('')
  const [hoursPerDay, setHoursPerDay] = useState<string>('')
  const [daysPerWeek, setDaysPerWeek] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [contractType, setContractType] = useState<PkwtType>('pkwt')
  const [annualLeaveDays, setAnnualLeaveDays] = useState<string>('')
  const [probationMonths, setProbationMonths] = useState<string>('')
  const [templateForPosition, setTemplateForPosition] = useState<string>('')
  const [jobPositions, setJobPositions] = useState<string[]>([])
  const [changeSummary] = useState('')
  const [saving, setSaving] = useState(false)
  // Which save action is currently running. Distinct from `saving`
  // (a generic boolean) so only the clicked button shows the spinner
  // and "Translating…" label rather than both buttons mirroring it.
  const [savingMode, setSavingMode] = useState<'draft' | 'activate' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  // Activate & sign flow. The signing panel sits below the editor, hidden
  // until the user clicks "Activate & sign" — at which point we save the
  // contract first, reveal the panel, and scroll to it. On confirm we write
  // the employer signature row and flip status to active.
  const [showSignPanel, setShowSignPanel] = useState(false)
  const [signerName, setSignerName] = useState(user.name)
  const [signerTitle, setSignerTitle] = useState(user.title || '')
  const [signerFont, setSignerFont] = useState(user.signature_font || SIGNATURE_FONTS[0].name)
  const [signing, setSigning] = useState(false)
  const signPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const [contractResult, tagsResult, contractTagsResult, empsResult, orgResult, refResult] = await Promise.all([
        supabase.from('contracts').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('contract_tags').select('tag_id').eq('contract_id', id!),
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).order('name'),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
      ])

      setAllEmployees((empsResult.data || []) as EmployeeWithDepartments[])
      setOrganization(orgResult.data)
      if (refResult.data) {
        const buckets = bucketReferenceValues(refResult.data)
        setJobPositions(referenceNames(buckets.job_position))
      }

      if (contractResult.data) {
        setContract(contractResult.data)
        setTitle(contractResult.data.title)
        const loadedDoc = (contractResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(loadedDoc)
        setSavedContentDoc(loadedDoc)
        setStatus(contractResult.data.status as typeof status)
        setEmployeeId(contractResult.data.employee_id)
        setBaseWageIdr(contractResult.data.base_wage_idr?.toString() ?? '')
        setAllowanceIdr(contractResult.data.allowance_idr?.toString() ?? '')
        setHoursPerDay(contractResult.data.hours_per_day?.toString() ?? '')
        setDaysPerWeek(contractResult.data.days_per_week?.toString() ?? '')
        setStartDate(contractResult.data.start_date ?? '')
        setEndDate(contractResult.data.end_date ?? '')
        setContractType((contractResult.data.contract_type === 'pkwtt' ? 'pkwtt' : 'pkwt') as PkwtType)
        setAnnualLeaveDays(contractResult.data.annual_leave_days?.toString() ?? '')
        setProbationMonths(contractResult.data.probation_months?.toString() ?? '')
        setTemplateForPosition(contractResult.data.template_for_position ?? '')

        if (contractResult.data.employee_id) {
          const emp = ((empsResult.data || []) as EmployeeWithDepartments[]).find(e => e.id === contractResult.data.employee_id)
          if (emp) setEmployee(emp)
        }
      }

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((contractTagsResult.data || []).map(ct => ct.tag_id)))
    }
    load()
  }, [id, user.org_id])

  // Flipping PKWT ↔ PKWTT swaps two whole sections of the starter doc
  // (the duration/probation block, plus any other type-conditional content).
  // We confirm before regenerating so manual prose edits aren't silently
  // overwritten. The regen replaces content_doc wholesale with the new
  // type's starter — which is what the user wants, but it does mean any
  // hand-edited prose in this contract is lost.
  function handleContractTypeChange(next: PkwtType) {
    if (next === contractType) return
    if (contract) {
      const confirmed = window.confirm(t.contractTypeFlipConfirm)
      if (!confirmed) return
    }
    setContractType(next)
    // PKWT contracts don't carry probation; PKWTT defaults to the legal max.
    if (next === 'pkwt') {
      setProbationMonths('')
      setEndDate(prev => prev) // keep end date input visible/editable
    } else {
      setProbationMonths(prev => prev.trim() === '' ? '3' : prev)
      setEndDate('')
    }
    // Regenerate the structured doc from the new starter. Merge-field tokens
    // inside resolve at render time from the current row values, so the user
    // sees their wage/leave/probation values reflected immediately without
    // a save round-trip.
    setContentDoc(buildPkwtStarterDoc(next))
  }

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

  // Phase C.2 note: handleTranslate (whole-doc) and handleGenerate
  // (AI markdown generation) were removed when the markdown editor was
  // replaced. Per-block translation comes back in Phase E; AI gen will
  // return as a structured-doc producer in a follow-up.

  const parsedBaseWage = baseWageIdr.trim() === '' ? null : Number(baseWageIdr)
  const parsedAllowance = allowanceIdr.trim() === '' ? null : Number(allowanceIdr)
  const parsedHoursPerDay = hoursPerDay.trim() === '' ? null : Number(hoursPerDay)
  const parsedDaysPerWeek = daysPerWeek.trim() === '' ? null : Number(daysPerWeek)
  const parsedAnnualLeave = annualLeaveDays.trim() === '' ? null : Number(annualLeaveDays)
  // PKWT contracts have no probation period; force-clear so a switched-from-PKWTT
  // contract doesn't carry stale probation data.
  const parsedProbationMonths = contractType === 'pkwt'
    ? null
    : (probationMonths.trim() === '' ? null : Number(probationMonths))
  const docChanged = useMemo(
    () => JSON.stringify(contentDoc) !== JSON.stringify(savedContentDoc),
    [contentDoc, savedContentDoc],
  )
  const employeeChanged = contract ? employeeId !== contract.employee_id : false
  const wagesChanged = contract ? (
    parsedBaseWage !== contract.base_wage_idr ||
    parsedAllowance !== contract.allowance_idr ||
    parsedHoursPerDay !== contract.hours_per_day ||
    parsedDaysPerWeek !== contract.days_per_week
  ) : false
  const datesChanged = contract ? (
    (startDate || null) !== (contract.start_date || null) ||
    (endDate || null) !== (contract.end_date || null)
  ) : false
  const structuredChanged = contract ? (
    contractType !== (contract.contract_type === 'pkwtt' ? 'pkwtt' : 'pkwt') ||
    parsedAnnualLeave !== contract.annual_leave_days ||
    parsedProbationMonths !== contract.probation_months
  ) : false
  const hasChanges = contract ? (
    docChanged || employeeChanged || wagesChanged || datesChanged || structuredChanged ||
    title !== contract.title ||
    status !== contract.status ||
    changeSummary !== ''
  ) : false

  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  // Persists the contract with the given target status. Used by both
  // "Save as draft" and "Activate & sign" — the latter passes 'draft' here
  // and only flips to 'active' once the signature is confirmed below.
  // Returns the new version number when a snapshot was created, else null.
  async function persistContract(nextStatus: 'active' | 'draft' | 'archived'): Promise<{ versionNumber: number | null } | null> {
    if (!contract) return null
    setError('')
    setSaving(true)

    // Contracts snapshot their structured wage/hours/employee state alongside
    // content. Without this, wage edits that leave the doc untouched would
    // silently overwrite the live row with no version trail. Contract-type /
    // leave / probation changes don't need a snapshot — they re-render the
    // existing merge-field tokens, the structured-doc representation is
    // unchanged.
    const structuralChanged = wagesChanged || employeeChanged
    const snapshotNeeded = docChanged || structuralChanged

    const baseWageValid = parsedBaseWage === null || (Number.isFinite(parsedBaseWage) && parsedBaseWage >= 0)
    const allowanceValid = parsedAllowance === null || (Number.isFinite(parsedAllowance) && parsedAllowance >= 0)
    if (!baseWageValid || !allowanceValid) {
      setError(t.contractInvalidWages)
      setSaving(false)
      return null
    }

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        title,
        status: nextStatus,
        start_date: startDate || null,
        end_date: endDate || null,
        contract_type: contractType,
        annual_leave_days: parsedAnnualLeave,
        probation_months: parsedProbationMonths,
        template_for_position: contract.is_template ? (templateForPosition || null) : contract.template_for_position,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)

    if (updateError) { setError(updateError.message); setSaving(false); return null }

    await supabase.from('contract_tags').delete().eq('contract_id', contract.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('contract_tags').insert(
        [...selectedTagIds].map(tag_id => ({ contract_id: contract.id, tag_id }))
      )
    }

    setStatus(nextStatus)

    if (!snapshotNeeded) {
      setContract({
        ...contract,
        title,
        status: nextStatus,
        start_date: startDate || null,
        end_date: endDate || null,
        contract_type: contractType,
        annual_leave_days: parsedAnnualLeave,
        probation_months: parsedProbationMonths,
      })
      setSaving(false)
      return { versionNumber: null }
    }

    setTranslating(true)
    let result
    try {
      result = await writeSnapshot({
        table: 'contracts',
        doc_id: contract.id,
        new_content_doc: docChanged ? contentDoc : undefined,
        change_summary: changeSummary || null,
        changed_by: user.id,
        employee_id: employeeId,
        base_wage_idr: parsedBaseWage,
        allowance_idr: parsedAllowance,
        hours_per_day: parsedHoursPerDay,
        days_per_week: parsedDaysPerWeek,
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
    setContract({
      ...contract,
      title,
      status: nextStatus,
      content_markdown: result.content_markdown,
      content_markdown_id: result.content_markdown_id,
      content_doc: result.content_doc as Contract['content_doc'],
      current_version: result.version_number,
      employee_id: employeeId,
      base_wage_idr: parsedBaseWage,
      allowance_idr: parsedAllowance,
      hours_per_day: parsedHoursPerDay,
      days_per_week: parsedDaysPerWeek,
      start_date: startDate || null,
      end_date: endDate || null,
      contract_type: contractType,
      annual_leave_days: parsedAnnualLeave,
      probation_months: parsedProbationMonths,
    })

    if (employeeId) {
      await supabase.from('feed_events').insert({
        org_id: user.org_id,
        employee_id: employeeId,
        event_type: 'contract_updated',
        title: title,
        description: `Version ${result.version_number}${changeSummary ? ' — ' + changeSummary : ''}`,
        metadata: { contract_id: contract.id, version: result.version_number },
      })
    }

    setSaving(false)

    if (result.translation_status === 'failed') {
      setError(t.snapshotTranslationFailed)
      return { versionNumber: result.version_number }
    }

    return { versionNumber: result.version_number }
  }

  async function handleSaveAsDraft() {
    setSavingMode('draft')
    try {
      const result = await persistContract('draft')
      if (!result) return
      bypassUnsavedWarning()
      navigate(documentsIndexPath('contract'))
    } finally {
      setSavingMode(null)
    }
  }

  async function handleDownloadPdf() {
    if (downloading) return
    setDownloading(true)
    try {
      const baseCtx = {
        employee: allEmployees.find(e => e.id === employeeId) ?? null,
        organization,
        contract: contract ? {
          ...contract,
          base_wage_idr: parsedBaseWage,
          allowance_idr: parsedAllowance,
          hours_per_day: parsedHoursPerDay,
          days_per_week: parsedDaysPerWeek,
          employee_id: employeeId,
          contract_type: contractType,
          annual_leave_days: parsedAnnualLeave,
          probation_months: parsedProbationMonths,
        } : null,
        today: new Date(),
        signer: { name: user.name, title: user.title },
      }
      await exportDocumentPdf({
        doc: contentDoc,
        title: title || 'Contract',
        view,
        contextEn: { ...baseCtx, lang: 'en' },
        contextId: { ...baseCtx, lang: 'id' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    }
    setDownloading(false)
  }

  // Editing an active contract auto-bumps to a new (draft) version on save.
  // The save here keeps status at 'draft' — only the signature confirmation
  // below flips it to 'active'. If there are no changes (e.g. the contract
  // was already a clean draft awaiting signature), skip straight to the panel.
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
      const result = await persistContract('draft')
      if (!result) return
    }
    setShowSignPanel(true)
    setTimeout(() => signPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  async function handleConfirmSign() {
    if (!contract || !signerName.trim() || signing) return
    setSigning(true)
    setError('')

    // Document hash signs the latest derived markdown projection — content
    // lives in content_markdown after the snapshot helper derives it from
    // content_doc on save. Phase F may switch this to hash content_doc
    // directly for clauses-level fidelity.
    const documentHash = await buildContractDocumentHash(contract.content_markdown ?? '', contract.current_version)
    const { data: sigRow, error: sigError } = await supabase
      .from('contract_signatures')
      .insert({
        contract_id: contract.id,
        version_number: contract.current_version,
        signer_role: 'employer',
        signer_user_id: user.id,
        signer_title: signerTitle.trim() || null,
        typed_name: signerName.trim(),
        signature_font: signerFont,
        consent_text: t.contractEmployerSignConsent,
        document_hash: documentHash,
        user_agent: getUserAgent(),
        signer_email: user.email || null,
      })
      .select()
      .single()

    if (sigError || !sigRow) { setError(sigError?.message || 'sign failed'); setSigning(false); return }

    // Best-effort: stamp the signer's public IP server-side.
    const token = await currentAuthToken()
    if (token) captureSignatureIp(sigRow.id, { type: 'jwt', token })

    const { error: statusError } = await supabase
      .from('contracts')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', contract.id)

    if (statusError) { setError(statusError.message); setSigning(false); return }

    setStatus('active')
    setSigning(false)
    bypassUnsavedWarning()
    navigate(documentsIndexPath('contract'))
  }

  if (!contract) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{contract.is_template ? t.editTemplateTitle : t.editContractTitle}</h1>
          {/* Read-only status pill — replaces the old dropdown. Status now
              advances via the explicit "Activate & sign" action below; the
              dropdown lied because flipping to active didn't actually sign. */}
          {contract.is_template ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}
            >
              {t.contractTemplateBadge}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              style={{ borderColor: 'var(--color-border)', color: statusColors[status], backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
              {status === 'active' ? t.statusActive : status === 'archived' ? t.statusArchived : t.statusDraft}
            </span>
          )}
          {status === 'active' && hasChanges && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.editingActiveWillBumpVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to={documentHistoryPath('contract', contract.id)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.historyLinkLabel}</Link>
          <button onClick={handleDownloadPdf} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {downloading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {downloading ? t.generatingPdf : t.downloadPdf}
          </button>
          <button onClick={() => navigate(documentsIndexPath('contract'))} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.cancel}</button>
          {contract.is_template ? (
            <button onClick={handleSaveAsDraft} disabled={saving || !canWrite || !hasChanges} title={!canWrite ? t.dunningWriteBlocked : undefined}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {savingMode === 'draft' ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{translating ? t.savingTranslating : t.saving}</>
              ) : t.saveTemplate}
            </button>
          ) : (
            <>
              <button onClick={handleSaveAsDraft} disabled={saving || !canWrite || (!hasChanges && status === 'draft')} title={!canWrite ? t.dunningWriteBlocked : undefined}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                {savingMode === 'draft' ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{translating ? t.savingTranslating : t.saving}</>
                ) : t.saveAsDraft}
              </button>
              <button onClick={handleActivateAndSign} disabled={saving || signing || !canWrite} title={!canWrite ? t.dunningWriteBlocked : undefined}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
                {savingMode === 'activate' ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{translating ? t.savingTranslating : t.saving}</>
                ) : t.activateAndSign}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{error}</div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>

          {contract?.is_template ? (
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contractTemplateForPositionLabel}</label>
              <div className="relative">
                <select
                  value={templateForPosition}
                  onChange={e => setTemplateForPosition(e.target.value)}
                  className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm"
                  style={inputStyle}
                >
                  <option value="">{t.contractTemplateNoneForPosition}</option>
                  {jobPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.contractTemplateForPositionHelp}</p>
            </div>
          ) : (
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
                    <option key={emp.id} value={emp.id}>{emp.name}{primaryDept(emp) ? ` (${primaryDept(emp)})` : ''}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tagsLabel}</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const isSelected = selectedTagIds.has(tag.id)
                return (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
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
                <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                  placeholder={t.newTagPlaceholder} className="w-24 rounded-full border px-3 py-1 text-xs outline-none" style={inputStyle} />
                {newTagName.trim() && (
                  <button type="button" onClick={handleCreateTag} className="rounded-full px-2 py-1 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>{t.addShort}</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="py-4">
          {/* Contract type — drives the starter-doc shape and whether the
              end-date / probation field below is meaningful. Flipping after
              creation prompts the user before regenerating the body. */}
          {!contract?.is_template && (
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contractTypeLabel}</label>
              <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => handleContractTypeChange('pkwt')}
                  aria-pressed={contractType === 'pkwt'}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: contractType === 'pkwt' ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                    color: contractType === 'pkwt' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  {t.contractTypeFixedTerm}
                </button>
                <button
                  type="button"
                  onClick={() => handleContractTypeChange('pkwtt')}
                  aria-pressed={contractType === 'pkwtt'}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: contractType === 'pkwtt' ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                    color: contractType === 'pkwtt' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  }}
                >
                  {t.contractTypePermanent}
                </button>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {contractType === 'pkwt' ? t.contractTypePkwtDesc : t.contractTypePkwttDesc}
              </p>
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.startDateLabel}</label>
              <DateTimePicker mode="date" value={startDate} onChange={setStartDate} />
            </div>
            {contractType === 'pkwt' ? (
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.endDateLabel}</label>
                <DateTimePicker mode="date" value={endDate} onChange={setEndDate} />
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.probationMonthsLabel}</label>
                <select
                  value={probationMonths}
                  onChange={e => setProbationMonths(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                >
                  <option value="">—</option>
                  <option value="1">{t.monthOption(1)}</option>
                  <option value="2">{t.monthOption(2)}</option>
                  <option value="3">{t.monthOption(3)}</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.baseWageLabel}
                <InfoTooltip text={t.baseWageHelp} />
                <a
                  href="https://satudata.kemnaker.go.id/data/kumpulan-data/3005"
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t.baseWageReferenceLink}
                  aria-label={t.baseWageReferenceLink}
                  className="ml-1 inline-flex items-center transition-opacity hover:opacity-70"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatIdrDigits(baseWageIdr)}
                  onChange={e => setBaseWageIdr(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.amountIdrPlaceholder}
                  className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
                  style={inputStyle}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.allowanceLabel}
                <InfoTooltip text={t.allowanceHelp} />
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatIdrDigits(allowanceIdr)}
                  onChange={e => setAllowanceIdr(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.amountIdrPlaceholder}
                  className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
                  style={inputStyle}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.hoursPerDayLabel}
                <InfoTooltip text={t.hoursPerDayHelp} />
              </label>
              <select
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">—</option>
                <option value="6">{t.hoursOption(6)}</option>
                <option value="7">{t.hoursOption(7)}</option>
                <option value="8">{t.hoursOption(8)}</option>
                <option value="9">{t.hoursOption(9)}</option>
                <option value="10">{t.hoursOption(10)}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.daysPerWeekLabel}
                <InfoTooltip text={t.daysPerWeekHelp} />
              </label>
              <select
                value={daysPerWeek}
                onChange={e => setDaysPerWeek(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">—</option>
                <option value="4">{t.daysOption(4)}</option>
                <option value="5">{t.daysOption(5)}</option>
                <option value="6">{t.daysOption(6)}</option>
                <option value="7">{t.daysOption(7)}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.annualLeaveLabel}</label>
              <select
                value={annualLeaveDays}
                onChange={e => setAnnualLeaveDays(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="">—</option>
                <option value="12">{t.annualLeaveOption(12)}</option>
                <option value="14">{t.annualLeaveOption(14)}</option>
                <option value="15">{t.annualLeaveOption(15)}</option>
                <option value="20">{t.annualLeaveOption(20)}</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contentLabel}</label>
          </div>
          {/* Bilingual editor — both EN and ID slots authored side-by-side
              within the same canvas. EN/ID switcher, whole-doc translate,
              and AI Generate are all gone in C.2; per-block translation
              returns in Phase E and AI gen will return as a structured-doc
              producer in a follow-up. */}
          <DocumentEditor
            initialDoc={contentDoc}
            onChange={setContentDoc}
            view={view}
            onViewChange={setView}
            mergeFields={{
              scope: 'contract',
              getContext: () => ({
                employee: allEmployees.find(e => e.id === employeeId) ?? null,
                organization,
                contract: contract ? {
                  ...contract,
                  base_wage_idr: parsedBaseWage,
                  allowance_idr: parsedAllowance,
                  hours_per_day: parsedHoursPerDay,
                  days_per_week: parsedDaysPerWeek,
                  employee_id: employeeId,
                  contract_type: contractType,
                  annual_leave_days: parsedAnnualLeave,
                  probation_months: parsedProbationMonths,
                } : null,
                today: new Date(),
                lang: 'en',
                signer: { name: user.name, title: user.title },
              }),
            }}
            aiGenerate={{ docType: 'contract', title }}
          />
        </div>

        {showSignPanel && (
          <div ref={signPanelRef} className="rounded-xl border p-5" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
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
                {signing && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
                {signing ? t.signing : t.confirmAndActivate}
              </button>
              <button onClick={() => setShowSignPanel(false)} disabled={signing} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {t.cancel}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
