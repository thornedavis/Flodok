// Bulk import flow: download template → upload → cell-level validation →
// capacity check → batch insert. Reference values are loaded inside the
// modal so the parent doesn't have to thread them through.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateSlug, generateAccessToken } from '../lib/slug'
import { isPro, syncSeats } from '../lib/billing'
import { PRO_MIN_SEATS } from '../lib/pricing'
import {
  buildImportTemplate,
  parseImportFile,
  checkImportCapacity,
} from '../lib/employeeImport'
import type {
  ImportRefs, ParseResult, EmployeeImportInput, CapacityCheck, ImportIssue,
} from '../lib/employeeImport'
import { UpgradeModal } from './UpgradeModal'
import type { Translations } from '../lib/translations'
import type { Employee, Organization, User } from '../types/aliases'

export function ImportEmployeesModal({
  user, org, currentEmployees, t, onClose, onImported,
}: {
  user: User
  org: Organization
  currentEmployees: Employee[]
  t: Translations
  onClose: () => void
  onImported: (insertedCount: number) => void
}) {
  const [refs, setRefs] = useState<ImportRefs | null>(null)
  const [refsError, setRefsError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState<'upgrade' | 'adjust' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = parsing || importing || downloading
  const orgIsPro = isPro(org)

  // Load reference values once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [refRes, branchRes] = await Promise.all([
          supabase
            .from('company_reference_values')
            .select('kind, name')
            .eq('org_id', user.org_id)
            .order('display_order')
            .order('name'),
          supabase
            .from('company_branches')
            .select('name')
            .eq('org_id', user.org_id)
            .eq('is_active', true)
            .order('name'),
        ])
        if (cancelled) return
        if (refRes.error) throw refRes.error
        if (branchRes.error) throw branchRes.error
        const byKind = (kind: string) =>
          (refRes.data ?? []).filter(r => r.kind === kind).map(r => r.name)
        setRefs({
          departments:  byKind('department'),
          branches:     (branchRes.data ?? []).map(b => b.name),
          jobPositions: byKind('job_position'),
          jobLevels:    byKind('job_level'),
          classes:      byKind('employee_class'),
        })
      } catch (e) {
        if (!cancelled) setRefsError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [user.org_id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Existing dupes for the parser to flag against.
  const existingPhones = useMemo(
    () => new Set(currentEmployees.map(e => e.phone).filter(Boolean)),
    [currentEmployees],
  )
  const existingCodes = useMemo(
    () => new Set(currentEmployees.map(e => e.employee_code ?? '').filter(Boolean)),
    [currentEmployees],
  )

  const capacity: CapacityCheck | null = parseResult
    ? checkImportCapacity({
        org,
        currentEmployeeCount: currentEmployees.length,
        importRowCount: parseResult.rows.length,
      })
    : null

  async function handleDownloadTemplate() {
    if (!refs) return
    setDownloading(true)
    try {
      const blob = await buildImportTemplate({ orgName: org.name, refs, t })
      triggerDownload(blob, `${org.name}-employees-template.xlsx`)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }

  async function handleFilePicked(file: File) {
    if (!refs) return
    setSelectedFileName(file.name)
    setParseResult(null)
    setImportError(null)
    setParsing(true)
    try {
      const result = await parseImportFile({
        file,
        refs,
        existingPhones,
        existingCodes,
        defaultCountryCode: org.default_country_code,
        t,
      })
      setParseResult(result)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  function resetUpload() {
    setSelectedFileName(null)
    setParseResult(null)
    setImportError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleConfirmImport() {
    if (!parseResult || parseResult.rows.length === 0) return
    if (!capacity?.ok) return
    setImporting(true)
    setImportError(null)
    try {
      const payload = parseResult.rows.map(r => buildInsertPayload(r, user.org_id))
      const { error } = await supabase.from('employees').insert(payload)
      if (error) throw error
      if (orgIsPro) {
        syncSeats().catch(err => console.error('sync-seats failed after import:', err))
      }
      onImported(parseResult.rows.length)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : t.importFailureGeneric)
      setImporting(false)
    }
  }

  // Group issues by row for cleaner display.
  const issuesByRow = useMemo(() => {
    const map = new Map<number, ImportIssue[]>()
    if (!parseResult) return map
    for (const issue of parseResult.issues) {
      const list = map.get(issue.row) ?? []
      list.push(issue)
      map.set(issue.row, list)
    }
    return map
  }, [parseResult])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        {/* Header */}
        <div className="border-b px-6 py-4" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            {t.importModalTitle}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.importModalSubtitle}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md p-1 transition-colors disabled:opacity-40"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {refsError && (
            <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
              {refsError}
            </p>
          )}
          {!refs && !refsError && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.importLoadingRefs}</p>
          )}

          {refs && (
            <>
              {/* Step 1: download template */}
              <div className="mb-5">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {downloading ? t.importDownloadingTemplate : t.importDownloadTemplate}
                </button>
              </div>

              {/* Step 2: upload */}
              <div className="mb-5">
                <label className="block text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {t.importUploadLabel}
                </label>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {t.importUploadHint}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleFilePicked(file)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
                  >
                    {t.importChooseFile}
                  </button>
                  <span className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {selectedFileName ?? t.importNoFileSelected}
                  </span>
                  {selectedFileName && !parsing && (
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="text-xs underline"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Validation results */}
              {parsing && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.importParsingFile}</p>
              )}

              {parseResult && parseResult.issues.length > 0 && (
                <div
                  className="mb-3 rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-danger)', backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}
                >
                  <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
                    {t.importIssuesHeading(parseResult.issues.length)}
                  </p>
                  <ul className="space-y-1.5 text-xs" style={{ color: 'var(--color-text)' }}>
                    {[...issuesByRow.entries()].slice(0, 50).map(([row, items]) => (
                      <li key={row}>
                        <span className="font-medium">{t.importIssueRowLabel(row)}</span>
                        <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
                          {items.map((it, idx) => (
                            <li key={idx}>
                              {it.column ? <strong>{it.column}: </strong> : null}
                              {it.message}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                    {issuesByRow.size > 50 && (
                      <li style={{ color: 'var(--color-text-tertiary)' }}>
                        … and {issuesByRow.size - 50} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {parseResult && parseResult.issues.length === 0 && capacity && !capacity.ok && (
                <div
                  className="mb-3 rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-warning, #d97706)', backgroundColor: 'color-mix(in srgb, var(--color-warning, #d97706) 10%, transparent)' }}
                >
                  <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {capacity.reason === 'free_over' ? t.importCapacityFreeTitle : t.importCapacityProTitle}
                  </p>
                  <p className="mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.importCapacityBody(capacity.current, capacity.importing, capacity.cap)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowUpgrade(orgIsPro ? 'adjust' : 'upgrade')}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {orgIsPro ? t.importCapacityCtaIncrease : t.importCapacityCtaUpgrade}
                  </button>
                </div>
              )}

              {parseResult && parseResult.issues.length === 0 && capacity?.ok && (
                <div
                  className="mb-3 rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {t.importReadyHeading}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.importReadyBody(parseResult.rows.length)}
                  </p>
                </div>
              )}

              {importError && (
                <p className="mb-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                  {importError}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={
              !parseResult
              || parseResult.rows.length === 0
              || parseResult.issues.length > 0
              || !capacity?.ok
              || busy
            }
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {importing
              ? t.importingEmployees
              : parseResult && parseResult.rows.length > 0
                ? (parseResult.rows.length === 1
                    ? t.importConfirmCtaSingular
                    : t.importConfirmCta.replace('{n}', String(parseResult.rows.length)))
                : t.importConfirmCtaSingular}
          </button>
        </div>
      </div>

      {showUpgrade && (
        <UpgradeModal
          t={t}
          mode={showUpgrade}
          initialSeats={Math.max(
            currentEmployees.length + (parseResult?.rows.length ?? 0),
            PRO_MIN_SEATS,
          )}
          minSeats={Math.max(currentEmployees.length, PRO_MIN_SEATS)}
          cancelReturnPath="/employees"
          onClose={() => setShowUpgrade(null)}
          onAdjusted={() => setShowUpgrade(null)}
        />
      )}
    </div>
  )
}

// ───── Helpers ─────────────────────────────────────────────────────────

function buildInsertPayload(row: EmployeeImportInput, orgId: string) {
  const slug = generateSlug(row.name) || 'employee'
  const access_token = generateAccessToken()
  return {
    org_id: orgId,
    name: row.name,
    phone: row.phone,
    slug,
    access_token,
    status: row.status ?? 'probation',
    employee_code: row.employee_code,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    departments: row.departments && row.departments.length > 0 ? row.departments : [],
    department: row.departments && row.departments[0] ? row.departments[0] : null,
    branch_name: row.branch_name,
    job_position: row.job_position,
    job_level: row.job_level,
    class: row.class,
    employment_type: row.employment_type,
    join_date: row.join_date,
    probation_end_date: row.probation_end_date,
    resign_date: row.resign_date,
    date_of_birth: row.date_of_birth,
    place_of_birth: row.place_of_birth,
    gender: row.gender,
    religion: row.religion,
    marital_status: row.marital_status,
    blood_type: row.blood_type,
    ktp_nik: row.ktp_nik,
    address: row.address,
    postal_code: row.postal_code,
    citizen_id_address: row.citizen_id_address,
    passport_number: row.passport_number,
    passport_expiry: row.passport_expiry,
    notes: row.notes,
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
