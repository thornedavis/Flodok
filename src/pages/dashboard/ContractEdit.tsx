import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { DocumentEditShell, EDITOR_STICKY_TOP_PX } from '../../components/editor/DocumentEditShell'
import { SaveAsTemplateModal } from '../../components/SaveAsTemplateButton'
import { ToolbarButton } from '../../components/editor/ToolbarButton'
import { ToolbarMoreMenu, type ToolbarMenuItem } from '../../components/editor/ToolbarMoreMenu'
import { useLang } from '../../contexts/LanguageContext'
import { type EmpDeptShape } from '../../lib/employee'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useDocumentViewPref } from '../../hooks/useDocumentViewPref'
import { useSaveFlash } from '../../hooks/useSaveFlash'
import { exportDocumentPdf } from '../../lib/pdfExport'
import { formatIdrDigits } from '../../lib/credits'
import { InfoTooltip } from '../../components/InfoTooltip'
import { AllowanceComponentsEditor, type CompLine } from '../../components/AllowanceComponentsEditor'
import { writeSnapshot } from '../../lib/snapshotApi'
import { emptyDocumentDoc, type DocumentDoc, type LanguageMode } from '../../lib/documentDoc'
import { buildPkwtStarterDoc, type PkwtType } from '../../lib/pkwtStarterDoc'
import { buildContractDocumentHash, captureSignatureIp, currentAuthToken, getUserAgent } from '../../lib/signatureFingerprint'
import { SIGNATURE_FONTS, ensureSignatureFontsLoaded } from '../../lib/signatureFonts'
import { DateTimePicker } from '../../components/DateTimePicker'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { useBilling } from '../../contexts/BillingContext'
import { documentHistoryPath } from '../../lib/documentTypes'
import { trashDocument } from '../../lib/trash'
import type { User, Contract, Tag, Employee, Organization } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

ensureSignatureFontsLoaded()

// File shape with a signature scribble inside — the same icon used
// for contracts in the employee Portal (Portal.tsx:180). Repeated here
// rather than imported because Portal lives in a different routing
// tree and exposing its internal helpers would couple the two pages.
// SOPEdit / JDEdit will grow their own type-specific icons when they
// get the same edit-page treatment.
function ContractTypeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M7 16q2-3 4 0t4 0"/>
    </svg>
  )
}

export function ContractEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tplOpen, setTplOpen] = useState(false)
  const { flash: savedFlash, show: showSaved } = useSaveFlash()
  const { canWrite } = useBilling()
  const { view, setView } = useDocumentViewPref('contract', id ?? null)
  // language_mode read/written via cast — database.ts not regenerated yet.
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bilingual')
  const [savedLanguageMode, setSavedLanguageMode] = useState<LanguageMode>('bilingual')
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
  // Itemised allowance components (replaces the single allowance number).
  // contracts.allowance_idr is derived from the sum of these on save (DB
  // trigger). `savedComponents` mirrors the last persisted set for dirty
  // detection — a renamed line or a shifted amount counts as a change even
  // when the total is unchanged.
  const [components, setComponents] = useState<CompLine[]>([])
  const [savedComponents, setSavedComponents] = useState<CompLine[]>([])
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
      const [contractResult, tagsResult, contractTagsResult, empsResult, orgResult, refResult, compsResult] = await Promise.all([
        supabase.from('contracts').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('contract_tags').select('tag_id').eq('contract_id', id!),
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).order('name'),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
        supabase.from('contract_compensation_components').select('*').eq('contract_id', id!).eq('kind', 'earning').order('display_order'),
      ])

      const loadedComponents: CompLine[] = (compsResult.data || []).map(c => ({
        key: c.id,
        name: c.name,
        amount: c.amount_idr?.toString() ?? '',
        isFixed: c.is_fixed,
      }))
      setComponents(loadedComponents)
      setSavedComponents(loadedComponents)

      setAllEmployees((empsResult.data || []) as EmployeeWithDepartments[])
      setOrganization(orgResult.data)
      if (refResult.data) {
        const buckets = bucketReferenceValues(refResult.data)
        setJobPositions(referenceNames(buckets.job_position))
      }

      if (contractResult.data) {
        setContract(contractResult.data)
        setTitle(contractResult.data.title)
        {
          const loadedMode = (contractResult.data as { language_mode?: LanguageMode }).language_mode ?? 'bilingual'
          setLanguageMode(loadedMode)
          setSavedLanguageMode(loadedMode)
        }
        const loadedDoc = (contractResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(loadedDoc)
        setSavedContentDoc(loadedDoc)
        setStatus(contractResult.data.status as typeof status)
        setEmployeeId(contractResult.data.employee_id)
        setBaseWageIdr(contractResult.data.base_wage_idr?.toString() ?? '')
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
      setEndDate(prev => prev)
    } else {
      setProbationMonths(prev => prev.trim() === '' ? '3' : prev)
      setEndDate('')
    }
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

  const parsedBaseWage = baseWageIdr.trim() === '' ? null : Number(baseWageIdr)
  // Derived allowance = sum of the earning components (blank lines ignored).
  // Null (not 0) when there are no real lines, preserving the "no allowance
  // defined" vs "zero" split the DB relies on and matching what the trigger
  // computes after the edge function drops blank lines. This is what flows to
  // {{allowance_idr}}, the settlement engine, and the version snapshot.
  const nonBlankComponents = components.filter(c => c.name.trim() !== '' || c.amount.trim() !== '')
  const componentSum = nonBlankComponents.reduce((s, c) => s + (c.amount.trim() === '' ? 0 : (Number(c.amount) || 0)), 0)
  const parsedAllowance = nonBlankComponents.length === 0 ? null : componentSum
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
  // True when any allowance line changed — name, amount, or fixed/variable —
  // even if the total is unchanged. Drives the snapshot so each version
  // captures an honest breakdown.
  const componentsChanged = useMemo(() => {
    const norm = (list: CompLine[]) => list.map(c => ({ n: c.name.trim(), a: c.amount.trim(), f: c.isFixed }))
    return JSON.stringify(norm(components)) !== JSON.stringify(norm(savedComponents))
  }, [components, savedComponents])
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

  // Required-field gating for Activate & sign. Templates are exempt
  // because they're never activated — they only get saved as templates.
  // Legal-floor fields for an Indonesian employment contract: title,
  // linked employee, dates (end_date for PKWT, probation for PKWTT),
  // wage, hours, days. Annual leave defaults to 12 so it's effectively
  // always set.
  const missingRequiredFields: { key: string; label: string }[] = useMemo(() => {
    if (contract?.is_template) return []
    const out: { key: string; label: string }[] = []
    if (!title.trim()) out.push({ key: 'title', label: t.titleLabel })
    if (!employeeId) out.push({ key: 'employee', label: t.employeeLabel })
    if (!startDate) out.push({ key: 'startDate', label: t.startDateLabel })
    if (contractType === 'pkwt' && !endDate) out.push({ key: 'endDate', label: t.endDateLabel })
    if (contractType === 'pkwtt' && parsedProbationMonths === null) out.push({ key: 'probationMonths', label: t.probationMonthsLabel })
    if (parsedBaseWage === null) out.push({ key: 'baseWage', label: t.baseWageLabel })
    if (parsedHoursPerDay === null) out.push({ key: 'hoursPerDay', label: t.hoursPerDayLabel })
    if (parsedDaysPerWeek === null) out.push({ key: 'daysPerWeek', label: t.daysPerWeekLabel })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.is_template, title, employeeId, startDate, endDate, contractType, parsedProbationMonths, parsedBaseWage, parsedHoursPerDay, parsedDaysPerWeek])

  const missingKeys = new Set(missingRequiredFields.map(f => f.key))
  const modeChanged = languageMode !== savedLanguageMode

  const hasChanges = contract ? (
    docChanged || employeeChanged || wagesChanged || componentsChanged || datesChanged || structuredChanged || modeChanged ||
    title !== contract.title ||
    status !== contract.status ||
    changeSummary !== ''
  ) : false

  // Registers the beforeunload / in-app navigation guard. Exits go through
  // the header link, which trips this guard when there are unsaved changes.
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
    const structuralChanged = wagesChanged || componentsChanged || employeeChanged
    // A language-mode toggle needs the snapshot round-trip too (server clears
    // the off-side + persists the mode).
    const snapshotNeeded = docChanged || structuralChanged || modeChanged

    // Drop fully-blank lines; a half-filled line (name without amount, or vice
    // versa) is invalid and blocks the save.
    const cleanedComponents = components
      .map(c => ({ name: c.name.trim(), amount: c.amount.trim(), isFixed: c.isFixed }))
      .filter(c => c.name !== '' || c.amount !== '')
    const componentsValid = cleanedComponents.every(
      c => c.name !== '' && c.amount !== '' && Number.isFinite(Number(c.amount)) && Number(c.amount) >= 0,
    )

    const baseWageValid = parsedBaseWage === null || (Number.isFinite(parsedBaseWage) && parsedBaseWage >= 0)
    if (!baseWageValid || !componentsValid) {
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
      showSaved(false)
      return { versionNumber: null }
    }

    setTranslating(true)
    let result
    try {
      result = await writeSnapshot({
        table: 'contracts',
        doc_id: contract.id,
        // Pass the doc when the mode changed too, so the server's structured
        // path runs clearOffSide on the now-monolingual document.
        new_content_doc: (docChanged || modeChanged) ? contentDoc : undefined,
        language_mode: languageMode,
        change_summary: changeSummary || null,
        changed_by: user.id,
        employee_id: employeeId,
        base_wage_idr: parsedBaseWage,
        allowance_idr: parsedAllowance,
        hours_per_day: parsedHoursPerDay,
        days_per_week: parsedDaysPerWeek,
        compensation_components: cleanedComponents.map((c, i) => ({
          name: c.name,
          kind: 'earning' as const,
          is_fixed: c.isFixed,
          amount_idr: Number(c.amount),
          display_order: i,
        })),
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
    // Reflect exactly what was persisted (blank lines dropped) and reset the
    // dirty baseline so the breakdown isn't flagged as unsaved after a save.
    const persistedComponents: CompLine[] = cleanedComponents.map(c => ({
      key: crypto.randomUUID(), name: c.name, amount: c.amount, isFixed: c.isFixed,
    }))
    setComponents(persistedComponents)
    setSavedComponents(persistedComponents)
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

    setSavedLanguageMode(languageMode)
    showSaved(languageMode === 'bilingual')
    return { versionNumber: result.version_number }
  }

  async function handleSaveAsDraft() {
    setSavingMode('draft')
    try {
      // Persist and stay in the editor — saving is decoupled from
      // navigation. The status badge + disabled Save button signal the
      // saved state; leaving is an explicit action (the header exit link).
      await persistContract('draft')
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
          compensation_components: nonBlankComponents.map(c => ({ name: c.name.trim(), amount_idr: Number(c.amount) || 0, is_fixed: c.isFixed })),
        } : null,
        today: new Date(),
        signer: { name: user.name, title: user.title },
      }
      await exportDocumentPdf({
        doc: contentDoc,
        title: title || 'Contract',
        view,
        languageMode,
        contextEn: { ...baseCtx, lang: 'en' },
        contextId: { ...baseCtx, lang: 'id' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    }
    setDownloading(false)
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

    const token = await currentAuthToken()
    if (token) captureSignatureIp(sigRow.id, { type: 'jwt', token })

    const { error: statusError } = await supabase
      .from('contracts')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', contract.id)

    if (statusError) { setError(statusError.message); setSigning(false); return }

    setStatus('active')
    // Sync the loaded row's status too, otherwise `hasChanges` (which
    // compares `status` to `contract.status`) would read as dirty right
    // after signing and keep the Activate/Save buttons live.
    setContract({ ...contract, status: 'active' })
    setSigning(false)
    setShowSignPanel(false)
  }

  if (!contract) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties
  // Required-but-empty fields get a red border (same condition as the
  // missing-field dot) so the "fill me before publishing" cue is unmissable.
  const fieldStyle = (key: string): React.CSSProperties =>
    missingKeys.has(key) ? { ...inputStyle, borderColor: 'color-mix(in srgb, var(--color-danger) 50%, transparent)' } : inputStyle

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  // Already-active contracts with nothing pending have nothing to
  // re-activate — only re-enable once the user makes an edit (which bumps
  // a new version on the next sign).
  const activateDisabled = saving || signing || !canWrite || missingRequiredFields.length > 0
    || (status === 'active' && !hasChanges)
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

  const badge = contract.is_template ? (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}
    >
      {t.contractTemplateBadge}
    </span>
  ) : (
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

  async function handleDelete() {
    if (!id) return
    if (!confirm(t.deleteDocumentConfirm(title))) return
    setSaving(true)
    setError('')
    try {
      await trashDocument(id, 'contract')
      bypassUnsavedWarning()
      navigate('/dashboard/documents')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const menuItems: ToolbarMenuItem[] = [
    { key: 'download', icon: 'download', label: downloading ? t.generatingPdf : t.downloadPdf, onClick: handleDownloadPdf, disabled: downloading },
  ]
  if (!contract.is_template) {
    menuItems.push({ key: 'template', icon: 'template', label: t.contractSaveAsTemplate, onClick: () => setTplOpen(true), disabled: !canWrite, title: !canWrite ? t.dunningWriteBlocked : undefined })
  }
  menuItems.push(
    { key: 'history', icon: 'history', label: t.historyLinkLabel, to: documentHistoryPath('contract', contract.id) },
    { key: 'delete', icon: 'trash', label: t.delete, onClick: handleDelete, danger: true, disabled: saving || !canWrite, title: !canWrite ? t.dunningWriteBlocked : undefined },
  )

  const actions = (
    <>
      <ToolbarMoreMenu items={menuItems} />
      {contract.is_template ? (
        <ToolbarButton
          variant="primary"
          onClick={handleSaveAsDraft}
          disabled={saving || !canWrite || !hasChanges}
          title={!canWrite ? t.dunningWriteBlocked : undefined}
          loading={savingMode === 'draft'}
        >
          {savingMode === 'draft' ? (translating ? t.savingTranslating : t.saving) : t.saveTemplate}
        </ToolbarButton>
      ) : (
        <>
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
        </>
      )}
      {tplOpen && (
        <SaveAsTemplateModal
          orgId={user.org_id}
          defaultTitle={title}
          source={{
            type: 'contract',
            contentDoc,
            contractType,
            baseWageIdr: parsedBaseWage,
            allowanceIdr: parsedAllowance,
            compensationComponents: nonBlankComponents.map((c, i) => ({
              name: c.name.trim(),
              kind: 'earning' as const,
              is_fixed: c.isFixed,
              amount_idr: Number(c.amount) || 0,
              display_order: i,
            })),
            hoursPerDay: parsedHoursPerDay,
            daysPerWeek: parsedDaysPerWeek,
            annualLeaveDays: parsedAnnualLeave,
            probationMonths: parsedProbationMonths,
            jobPositions,
          }}
          onClose={() => setTplOpen(false)}
        />
      )}
    </>
  )

  const sidebar = (
    <>
            {/* Title lives in the page top bar as an inline-editable
                heading (click-to-rename, Google Docs style). It's not
                duplicated here. The missing-required red dot for an
                empty title is reflected via the activate-button label. */}

            {/* Employee (contract) or template-position (template) */}
            {contract?.is_template ? (
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.contractTemplateForPositionLabel}</label>
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
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.employeeLabel}
                  {missingDot('employee')}
                </label>
                <EmployeeSelect
                  invalid={missingKeys.has('employee')}
                  value={employeeId}
                  onChange={next => {
                    setEmployeeId(next)
                    setEmployee(next ? allEmployees.find(emp => emp.id === next) || null : null)
                  }}
                  employees={allEmployees}
                />
              </div>
            )}

            {/* Contract type (real contracts only) — the per-type
                description has been demoted from always-visible subtext
                to an InfoTooltip on the heading; it stays accessible
                without eating vertical space in the sidebar. */}
            {!contract?.is_template && (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.contractTypeLabel}
                  <InfoTooltip text={contractType === 'pkwt' ? t.contractTypePkwtDesc : t.contractTypePkwttDesc} />
                </label>
                <div className="inline-flex w-full rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => handleContractTypeChange('pkwt')}
                    aria-pressed={contractType === 'pkwt'}
                    className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
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
                    className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: contractType === 'pkwtt' ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                      color: contractType === 'pkwtt' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {t.contractTypePermanent}
                  </button>
                </div>
              </div>
            )}

            {/* Start date */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.startDateLabel}
                {missingDot('startDate')}
              </label>
              <DateTimePicker mode="date" value={startDate} onChange={setStartDate} invalid={missingKeys.has('startDate')} />
            </div>

            {/* End date (PKWT) or probation (PKWTT) */}
            {contractType === 'pkwt' ? (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.endDateLabel}
                  {missingDot('endDate')}
                </label>
                <DateTimePicker mode="date" value={endDate} onChange={setEndDate} invalid={missingKeys.has('endDate')} />
              </div>
            ) : (
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.probationMonthsLabel}
                  {missingDot('probationMonths')}
                </label>
                <select
                  value={probationMonths}
                  onChange={e => setProbationMonths(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={fieldStyle('probationMonths')}
                >
                  <option value="">—</option>
                  <option value="1">{t.monthOption(1)}</option>
                  <option value="2">{t.monthOption(2)}</option>
                  <option value="3">{t.monthOption(3)}</option>
                </select>
              </div>
            )}

            {/* Base wage */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.baseWageLabel}
                <InfoTooltip text={t.baseWageHelp} />
                {missingDot('baseWage')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatIdrDigits(baseWageIdr)}
                  onChange={e => setBaseWageIdr(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.amountIdrPlaceholder}
                  className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
                  style={fieldStyle('baseWage')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
              </div>
            </div>

            {/* Allowances — itemised components (Meal, Transport, ...) */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.allowancesLabel}
                <InfoTooltip text={t.allowancesHelp} />
              </label>
              <AllowanceComponentsEditor components={components} onChange={setComponents} />
            </div>

            {/* Hours + days side-by-side */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.hoursPerDayLabel}
                  {missingDot('hoursPerDay')}
                </label>
                <select
                  value={hoursPerDay}
                  onChange={e => setHoursPerDay(e.target.value)}
                  className="w-full rounded-lg border px-2 py-2 text-sm"
                  style={fieldStyle('hoursPerDay')}
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
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.daysPerWeekLabel}
                  {missingDot('daysPerWeek')}
                </label>
                <select
                  value={daysPerWeek}
                  onChange={e => setDaysPerWeek(e.target.value)}
                  className="w-full rounded-lg border px-2 py-2 text-sm"
                  style={fieldStyle('daysPerWeek')}
                >
                  <option value="">—</option>
                  <option value="4">{t.daysOption(4)}</option>
                  <option value="5">{t.daysOption(5)}</option>
                  <option value="6">{t.daysOption(6)}</option>
                  <option value="7">{t.daysOption(7)}</option>
                </select>
              </div>
            </div>

            {/* Annual leave */}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.annualLeaveLabel}</label>
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

            {/* Tags */}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.tagsLabel}</label>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map(tag => {
                  const isSelected = selectedTagIds.has(tag.id)
                  return (
                    <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
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
                  <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                    placeholder={t.newTagPlaceholder} className="w-20 rounded-full border px-2.5 py-0.5 text-[11px] outline-none" style={inputStyle} />
                  {newTagName.trim() && (
                    <button type="button" onClick={handleCreateTag} className="rounded-full px-1.5 py-0.5 text-[11px] font-medium" style={{ color: 'var(--color-primary)' }}>{t.addShort}</button>
                  )}
                </div>
              </div>
            </div>

    </>
  )

  return (
    <DocumentEditShell
      storageKey="contractEdit"
      icon={<ContractTypeIcon />}
      accent="var(--color-text-secondary)"
      typeLabel={t.documentTypeContract}
      title={title}
      onTitleChange={setTitle}
      canEditTitle={canWrite}
      badge={badge}
      headerHint={status === 'active' && hasChanges ? t.editingActiveWillBumpVersion : undefined}
      detailsBadge={detailsBadge}
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
                    compensation_components: nonBlankComponents.map(c => ({ name: c.name.trim(), amount_idr: Number(c.amount) || 0, is_fixed: c.isFixed })),
                  } : null,
                  today: new Date(),
                  lang: 'en',
                  signer: { name: user.name, title: user.title },
                }),
              }}
              aiGenerate={{ docType: 'contract', title }}
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
                    {signing && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
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
