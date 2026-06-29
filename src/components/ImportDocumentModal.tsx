// Upload & Analyse — import an existing document into Flodok.
//
// The migration aid: an admin uploads a PDF they already have (an
// employment contract, NDA, or SOP), we send it to a vision model that
// reads it and returns a structured bilingual draft + the commercial
// terms it found. The admin picks the document type, optionally links an
// employee, reviews/corrects what was detected, then creates a DRAFT and
// lands in the normal editor. Nothing is auto-activated — the existing
// editor gates still force a human through Activate & sign.
//
// What we extract with AI: the document body and the commercial terms
// printed in the file. What we deliberately DON'T: employee identity —
// that resolves from the linked employee via merge fields, so it's never
// re-typed or re-OCR'd here.

import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { Modal } from './Modal'
import { EmployeeSelect } from './EmployeeSelect'
import { analyseDocument, type AnalyseDocType, type AnalyseDocumentResult } from '../lib/analyseDocument'
import { importDocx, extractDocxBlocks, buildBilingualDocFromPairs, buildBilingualDocFromDocxTables } from '../lib/htmlToDoc'
import { pairBilingualBlocks } from '../lib/pairBilingual'
import { mapPlaceholders, assignPlaceholder, type MappedPlaceholder } from '../lib/placeholderMap'
import { clearOffSideForMode } from '../lib/offSide'
import { fieldsForScope, type MergeFieldKey } from '../lib/mergeFields'
import { docAsJson, docPreviewLines, withLetterhead, type LanguageMode, type DocumentDoc } from '../lib/documentDoc'
import { documentEditPath, documentTemplateEditPath, tableForType, type DocumentType } from '../lib/documentTypes'
import { type EmpDeptShape } from '../lib/employee'
import type { Employee, User } from '../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB
const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type Step = 'select' | 'analysing' | 'review' | 'error'

type FieldKind = 'int' | 'num' | 'date' | 'contractType'
type FieldDesc = { key: string; label: string; kind: FieldKind }

export function ImportDocumentModal({
  open,
  onClose,
  user,
  employees,
}: {
  open: boolean
  onClose: () => void
  user: User
  employees: EmployeeWithDepartments[]
}) {
  const { t, lang } = useLang()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('select')
  const [docType, setDocType] = useState<AnalyseDocType>('contract')
  const [file, setFile] = useState<File | null>(null)
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyseDocumentResult | null>(null)
  const [title, setTitle] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  // Set from the DOCX import (the detected source language → a monolingual
  // draft). PDF imports stay 'bilingual'. Persisted on the created row.
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bilingual')
  // Whether a .docx holds BOTH languages → split into a bilingual document
  // (two-column table unzip, or AI block-pairing as a fallback). Defaults ON:
  // imported HR documents (contracts, NDAs) are almost always bilingual here.
  // Surfaced as the "Languages" choice; the user can switch to single per file.
  const [bilingualHint, setBilingualHint] = useState(true)
  // P3: placeholder → merge-field mapping (letter imports become templates).
  const [mappedPlaceholders, setMappedPlaceholders] = useState<MappedPlaceholder[]>([])
  const [unmappedPlaceholders, setUnmappedPlaceholders] = useState<string[]>([])
  const [placeholderAssignments, setPlaceholderAssignments] = useState<Record<string, MergeFieldKey>>({})

  const typeOptions: Array<{ value: AnalyseDocType; label: string; desc: string; Icon: () => ReactElement }> = [
    { value: 'contract', label: t.documentImportTypeContract, desc: t.documentImportTypeContractDesc, Icon: FileTextIcon },
    { value: 'nda', label: t.documentImportTypeNda, desc: t.documentImportTypeNdaDesc, Icon: LockIcon },
    { value: 'job_description', label: t.documentImportTypeJd, desc: t.documentImportTypeJdDesc, Icon: BriefcaseIcon },
    { value: 'sop', label: t.documentImportTypeSop, desc: t.documentImportTypeSopDesc, Icon: ChecklistIcon },
    { value: 'letter', label: t.documentImportTypeLetter, desc: t.documentImportTypeLetterDesc, Icon: MailIcon },
  ]

  const contractFields: FieldDesc[] = [
    { key: 'contract_type', label: t.documentImportFieldContractType, kind: 'contractType' },
    { key: 'base_wage_idr', label: t.documentImportFieldWage, kind: 'int' },
    { key: 'allowance_idr', label: t.documentImportFieldAllowance, kind: 'int' },
    { key: 'annual_leave_days', label: t.documentImportFieldLeaveDays, kind: 'int' },
    { key: 'probation_months', label: t.documentImportFieldProbation, kind: 'int' },
    { key: 'hours_per_day', label: t.documentImportFieldHours, kind: 'num' },
    { key: 'days_per_week', label: t.documentImportFieldDays, kind: 'int' },
    { key: 'start_date', label: t.documentImportFieldStartDate, kind: 'date' },
    { key: 'end_date', label: t.documentImportFieldEndDate, kind: 'date' },
  ]
  const ndaFields: FieldDesc[] = [
    { key: 'effective_date', label: t.documentImportFieldEffectiveDate, kind: 'date' },
    { key: 'survival_years', label: t.documentImportFieldSurvivalYears, kind: 'int' },
    { key: 'penalty_idr', label: t.documentImportFieldPenalty, kind: 'int' },
  ]
  const fieldDescs: FieldDesc[] =
    docType === 'contract' ? contractFields : docType === 'nda' ? ndaFields : []

  function resetAll() {
    setStep('select')
    setDocType('contract')
    setFile(null)
    setEmployeeId(null)
    setResult(null)
    setTitle('')
    setFieldValues({})
    setError('')
    setCreating(false)
    setLanguageMode('bilingual')
    setBilingualHint(true)
    setMappedPlaceholders([])
    setUnmappedPlaceholders([])
    setPlaceholderAssignments({})
  }

  function handleClose() {
    if (creating || step === 'analysing') return
    resetAll()
    onClose()
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    // Validate by extension — the .docx MIME type is unreliable across OSes.
    const name = picked.name.toLowerCase()
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      setError(t.documentImportInvalidType)
      return
    }
    if (picked.size > MAX_SIZE) {
      setError(t.documentImportTooLarge)
      return
    }
    setError('')
    setFile(picked)
  }

  async function runAnalyse() {
    if (!file) {
      setError(t.documentImportNoFile)
      return
    }
    const isDocx = file.name.toLowerCase().endsWith('.docx')
    // Letters import as templates from Word only — there is no letter vision
    // schema, so a PDF can't become a letter template.
    if (docType === 'letter' && !isDocx) {
      setError(t.documentImportLetterNeedsDocx)
      return
    }
    setError('')
    setStep('analysing')
    try {
      if (isDocx) {
        // DOCX is structured — extracted deterministically in the browser
        // (mammoth), no vision call.
        let doc: DocumentDoc
        let docTitle: string
        let mode: LanguageMode
        if (bilingualHint) {
          // The file holds both languages. The common Indonesian layout puts
          // them in two columns of a table (Bahasa | English) — unzip that
          // deterministically (no model call). Only fall back to the AI
          // block-pairing path when the languages aren't laid out as columns.
          const { blocks, blockTexts, title: extractedTitle } = await extractDocxBlocks(file)
          const tableDoc = buildBilingualDocFromDocxTables(blocks)
          if (tableDoc) {
            doc = tableDoc
          } else {
            const pairs = await pairBilingualBlocks(blockTexts)
            doc = buildBilingualDocFromPairs(blocks, pairs)
          }
          docTitle = extractedTitle
          mode = 'bilingual'
        } else {
          const r = await importDocx(file)
          doc = r.doc
          docTitle = r.title
          mode = r.language
        }
        // Letters become reusable templates; auto-link their [placeholders] to
        // Flodok merge fields so the saved template fills employee/org data
        // when used. Other types import verbatim.
        let mapped: MappedPlaceholder[] = []
        let unmapped: string[] = []
        if (docType === 'letter') {
          const res = mapPlaceholders(doc)
          doc = res.doc
          mapped = res.mapped
          unmapped = res.unmapped
        }
        setResult({ doc, title: docTitle, fields: {}, confidence: {} })
        setTitle(docTitle)
        setLanguageMode(mode)
        setMappedPlaceholders(mapped)
        setUnmappedPlaceholders(unmapped)
        setPlaceholderAssignments({})
        setFieldValues({})
        setStep('review')
        return
      }
      // PDF: the vision model reads the visual document.
      const res = await analyseDocument(file, docType)
      setResult(res)
      setTitle(res.title)
      setLanguageMode('bilingual')
      const fv: Record<string, string> = {}
      for (const desc of (docType === 'contract' ? contractFields : docType === 'nda' ? ndaFields : [])) {
        const v = res.fields[desc.key]
        fv[desc.key] = v === null || v === undefined ? '' : String(v)
      }
      setFieldValues(fv)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.documentImportGenericError)
      setStep('error')
    }
  }

  function numFrom(key: string): number | null {
    const s = (fieldValues[key] ?? '').trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  function dateFrom(key: string): string | null {
    const s = (fieldValues[key] ?? '').trim()
    return s || null
  }

  async function createDraft() {
    if (!result) return
    setCreating(true)
    setError('')

    // Apply any manual placeholder assignments from the review step, then clear
    // the off-side for a monolingual import so the stored doc is self-consistent.
    let finalDoc = result.doc as DocumentDoc
    for (const [bracket, key] of Object.entries(placeholderAssignments)) {
      finalDoc = assignPlaceholder(finalDoc, bracket, key)
    }
    finalDoc = clearOffSideForMode(finalDoc, languageMode)

    // Auto-add a letterhead (org logo + company identity) to imported
    // contracts/NDAs — matches new-document behavior and restores the
    // letterhead mammoth drops from the source file. Added last so the
    // off-side clear above never touches it (it's not a bilingualBlock).
    if (docType === 'contract' || docType === 'nda') {
      finalDoc = withLetterhead(finalDoc)
    }

    // A letter import is a reusable TEMPLATE, not a live document — it lands in
    // document_templates (which carries no employee_id/status) and opens in the
    // template editor.
    if (docType === 'letter') {
      const { data, error: e } = await supabase
        .from('document_templates')
        .insert({
          org_id: user.org_id,
          type: 'letter',
          title: title.trim(),
          content_doc: docAsJson(finalDoc),
          language_mode: languageMode,
        } as never)
        .select('id')
        .single()
      const tplId = (data as { id: string } | null)?.id
      if (e || !tplId) {
        setError(e?.message ?? t.documentImportCreateFailed)
        setCreating(false)
        return
      }
      resetAll()
      onClose()
      navigate(documentTemplateEditPath(tplId))
      return
    }

    const common = {
      org_id: user.org_id,
      title: title.trim(),
      status: 'draft' as const,
      employee_id: employeeId,
      content_doc: docAsJson(finalDoc),
    }

    let id: string | null = null
    let errMsg: string | null = null

    if (docType === 'contract') {
      const { data, error: e } = await supabase
        .from('contracts')
        .insert({
          ...common,
          contract_type: fieldValues.contract_type || 'pkwt',
          base_wage_idr: numFrom('base_wage_idr'),
          allowance_idr: numFrom('allowance_idr'),
          annual_leave_days: numFrom('annual_leave_days') ?? 12,
          probation_months: numFrom('probation_months'),
          hours_per_day: numFrom('hours_per_day'),
          days_per_week: numFrom('days_per_week'),
          start_date: dateFrom('start_date'),
          end_date: dateFrom('end_date'),
        })
        .select()
        .single()
      id = data?.id ?? null
      errMsg = e?.message ?? null
    } else if (docType === 'nda') {
      const { data, error: e } = await supabase
        .from('ndas')
        .insert({
          ...common,
          effective_date: dateFrom('effective_date'),
          survival_years: numFrom('survival_years') ?? 2,
          penalty_idr: numFrom('penalty_idr'),
        })
        .select()
        .single()
      id = data?.id ?? null
      errMsg = e?.message ?? null
    } else if (docType === 'job_description') {
      // job_descriptions has no employee_id column (it carries
      // assignee_employee_id with different semantics), so we can't reuse
      // `common`. Insert the role body as a draft and let the JD editor's
      // existing-row load path open it pre-populated; department resolves
      // in-editor (it's only enforced on save, not on load).
      const { data, error: e } = await supabase
        .from('job_descriptions')
        .insert({
          org_id: user.org_id,
          title: title.trim(),
          status: 'draft' as const,
          content_doc: docAsJson(result.doc),
        })
        .select()
        .single()
      id = data?.id ?? null
      errMsg = e?.message ?? null
    } else {
      const { data, error: e } = await supabase
        .from('sops')
        .insert(common)
        .select()
        .single()
      id = data?.id ?? null
      errMsg = e?.message ?? null
    }

    if (!id) {
      setError(errMsg ?? t.documentImportCreateFailed)
      setCreating(false)
      return
    }
    // DOCX imports are monolingual — persist the detected mode on the new row
    // so it renders full-width. (PDF imports stay 'bilingual', the column
    // default, so no extra write.) Done as a follow-up update to keep the
    // typed inserts above type-safe despite database.ts lacking the column.
    if (languageMode !== 'bilingual') {
      const { error: modeErr } = await supabase
        .from(tableForType(docType as DocumentType))
        .update({ language_mode: languageMode } as never)
        .eq('id', id)
      if (modeErr) console.warn('Failed to persist language_mode on imported document:', modeErr.message)
    }
    resetAll()
    onClose()
    navigate(documentEditPath(docType as DocumentType, id))
  }

  // Body preview — works for both the section-structured PDF result and the
  // flat-block DOCX result. Reads the side that actually has content.
  const previewLang: 'en' | 'id' = languageMode === 'id' ? 'id' : 'en'
  const previewLines = result ? docPreviewLines(result.doc, previewLang, 6) : []

  // Letter placeholder review — the letter-scope merge fields offered when
  // manually assigning an unmapped [placeholder].
  const letterFields = fieldsForScope('letter')
  const fieldLabel = (key: MergeFieldKey) => letterFields.find(f => f.key === key)?.label[lang] ?? key

  const modalTitle =
    step === 'review' ? t.documentImportReviewTitle
    : step === 'error' ? t.documentImportErrorTitle
    : t.documentImportTitle

  return (
    <Modal open={open} onClose={handleClose} title={modalTitle} maxWidth="max-w-xl">
      {/* ── Step: select type + file ───────────────────────────── */}
      {(step === 'select' || step === 'analysing') && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.documentImportDescription}
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.documentImportPickType}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map(opt => {
                const active = docType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={step === 'analysing'}
                    onClick={() => { setDocType(opt.value); setError('') }}
                    className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                    style={{
                      gridColumn: opt.value === 'letter' ? '1 / -1' : undefined,
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-bg)',
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
                      aria-hidden
                    >
                      <opt.Icon />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>
                        {opt.label}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {opt.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.documentImportChooseFile}
            </label>
            {file ? (
              <div
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-primary)' }}
                  aria-hidden
                >
                  <FileTextIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{file.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{fileMeta(file)}</div>
                </div>
                <label
                  className="shrink-0 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-secondary)' }}
                >
                  {t.change}
                  <input type="file" accept={ACCEPT} onChange={onPickFile} disabled={step === 'analysing'} className="hidden" />
                </label>
              </div>
            ) : (
              <label
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <span className="min-w-0 truncate">{t.documentImportFileHint}</span>
                <span
                  className="shrink-0 rounded-md border px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  {t.documentImportBrowse}
                </span>
                <input
                  type="file"
                  accept={ACCEPT}
                  onChange={onPickFile}
                  disabled={step === 'analysing'}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Languages — DOCX only (PDFs are read bilingually by the vision
              model already). An explicit two-card choice rather than an
              easy-to-miss checkbox: 'Single language' (default) drives the
              monolingual extract; 'English + Indonesian' runs the pairing path. */}
          {file?.name.toLowerCase().endsWith('.docx') && (
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.documentImportLanguagesLabel}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { val: false, title: t.documentImportLangSingle, desc: t.documentImportLangSingleDesc },
                  { val: true, title: t.documentImportLangBilingual, desc: t.documentImportLangBilingualDesc },
                ] as const).map(opt => {
                  const active = bilingualHint === opt.val
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      disabled={step === 'analysing'}
                      onClick={() => setBilingualHint(opt.val)}
                      className="rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50"
                      style={{
                        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'var(--color-bg)',
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text)' }}>
                          {opt.title}
                        </span>
                        {active && (
                          <span className="shrink-0" style={{ color: 'var(--color-primary)' }} aria-hidden>
                            <CheckIcon />
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={step === 'analysing'}
              className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={runAnalyse}
              disabled={!file || step === 'analysing'}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {step === 'analysing' ? t.documentImportAnalysing : t.documentImportAnalyse}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: review + confirm ─────────────────────────────── */}
      {step === 'review' && result && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.documentImportReviewHint}
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.documentImportFieldTitle}
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            />
          </div>

          {/* No employee link for job descriptions (describe a role, not a
              person; the table has no employee_id) or letters (imported as
              reusable templates — the recipient resolves at instantiation). */}
          {docType !== 'job_description' && docType !== 'letter' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.documentImportLinkEmployee}
              </label>
              <EmployeeSelect
                value={employeeId}
                onChange={setEmployeeId}
                employees={employees}
                emptyLabel={t.noEmployeeLinked}
              />
            </div>
          )}

          {/* Letter placeholder mapping: auto-linked brackets shown as chips,
              the rest offered a field dropdown (or left as plain text). */}
          {docType === 'letter' && (mappedPlaceholders.length > 0 || unmappedPlaceholders.length > 0) && (
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.documentImportPlaceholdersTitle}
              </label>
              <p className="mb-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.documentImportPlaceholdersIntro}
              </p>

              {mappedPlaceholders.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {mappedPlaceholders.map(mp => (
                    <span
                      key={mp.bracket}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 14%, transparent)', color: 'var(--color-success)' }}
                      title={`${mp.bracket} → ${fieldLabel(mp.key)}`}
                    >
                      <span className="font-medium">{mp.bracket}</span>
                      <span aria-hidden>→</span>
                      <span>{fieldLabel(mp.key)}</span>
                    </span>
                  ))}
                </div>
              )}

              {unmappedPlaceholders.length > 0 && (
                <div className="space-y-1.5">
                  {unmappedPlaceholders.map(bracket => (
                    <div key={bracket} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--color-text)' }}>{bracket}</span>
                      <select
                        value={placeholderAssignments[bracket] ?? ''}
                        onChange={e => {
                          const v = e.target.value
                          setPlaceholderAssignments(prev => {
                            const next = { ...prev }
                            if (v) next[bracket] = v as MergeFieldKey
                            else delete next[bracket]
                            return next
                          })
                        }}
                        className="shrink-0 rounded-lg border bg-transparent px-2 py-1 text-xs outline-none"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                      >
                        <option value="">{t.documentImportPlaceholderLeaveText}</option>
                        {letterFields.map(f => (
                          <option key={f.key} value={f.key}>{f.label[lang]}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {fieldDescs.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.documentImportDetectedFields}
              </label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                {fieldDescs.map(desc => (
                  <FieldRow
                    key={desc.key}
                    desc={desc}
                    value={fieldValues[desc.key] ?? ''}
                    confidence={result.confidence[desc.key]}
                    onChange={v => setFieldValues(prev => ({ ...prev, [desc.key]: v }))}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.documentImportBodyPreview}
            </label>
            <div
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            >
              {previewLines.length > 0 ? (
                <ul className="space-y-0.5">
                  {previewLines.map((line, i) => (
                    <li key={i} className="truncate">{line}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: 'var(--color-text-tertiary)' }}>{t.documentImportUntitledSection}</p>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setStep('select'); setError('') }}
              disabled={creating}
              className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.documentImportBack}
            </button>
            <button
              type="button"
              onClick={createDraft}
              disabled={creating}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {creating ? t.documentImportCreating : (docType === 'letter' ? t.documentImportCreateTemplate : t.documentImportCreate)}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: error ────────────────────────────────────────── */}
      {step === 'error' && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.documentImportErrorHint}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={() => { setStep('select'); setError('') }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t.documentImportTryAgain}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function FieldRow({
  desc,
  value,
  confidence,
  onChange,
  t,
}: {
  desc: FieldDesc
  value: string
  confidence: 'high' | 'low' | undefined
  onChange: (v: string) => void
  t: ReturnType<typeof useLang>['t']
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc.label}</span>
        {confidence && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={
              confidence === 'high'
                ? { backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }
                : { backgroundColor: 'color-mix(in srgb, var(--color-warning) 18%, transparent)', color: 'var(--color-warning)' }
            }
          >
            {confidence === 'high' ? t.documentImportConfHigh : t.documentImportConfLow}
          </span>
        )}
      </div>
      {desc.kind === 'contractType' ? (
        <select
          value={value || 'pkwt'}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <option value="pkwt">{t.documentImportContractPkwt}</option>
          <option value="pkwtt">{t.documentImportContractPkwtt}</option>
        </select>
      ) : (
        <input
          type={desc.kind === 'date' ? 'date' : 'number'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        />
      )}
    </div>
  )
}

// Compact "EXT · size" line for the attached-file chip.
function fileMeta(file: File): string {
  const ext = (file.name.split('.').pop() || '').toUpperCase()
  const kb = file.size / 1024
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`
  return ext ? `${ext} · ${size}` : size
}

// Inline outline icons — same style as the editor toolbar (stroke,
// currentColor) so the type cards inherit their active/inactive color.
const iconBase = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}
function FileTextIcon() { return <svg {...iconBase}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg> }
function LockIcon() { return <svg {...iconBase}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> }
function BriefcaseIcon() { return <svg {...iconBase}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg> }
function ChecklistIcon() { return <svg {...iconBase}><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/><path d="M3.5 6l1.1 1.1L6 4.8"/><path d="M3.5 12l1.1 1.1L6 10.8"/><path d="M3.5 18l1.1 1.1L6 16.8"/></svg> }
function MailIcon() { return <svg {...iconBase}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg> }
function CheckIcon() { return <svg {...iconBase} width={16} height={16}><polyline points="20 6 9 17 4 12"/></svg> }
