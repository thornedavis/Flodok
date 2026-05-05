// Employee bulk import / export round-trip.
//
// Single source of truth for the column layout: COLUMNS. Both the template
// generator (buildImportTemplate) and the parser (parseImportFile) read from
// it, so adding a column is a one-line change.
//
// Key constraints:
// - Reference values (department / branch / job_position / job_level / class)
//   are NEVER auto-created. They must already exist in company_branches /
//   company_reference_values. Unknown values fail the row.
// - Required fields are intentionally minimal (Name, Phone). Everything else
//   is optional so HR can import a roster fast and fill detail later.
// - Phone is text-formatted in Excel so leading zeros and "+62" survive.
// - Departments is a single comma/semicolon-separated cell that maps to the
//   employees.departments[] array on insert.

import ExcelJS from 'exceljs'
import { normalizePhone, isValidE164 } from './phone'
import type { Translations } from './translations'
import type { Employee } from '../types/aliases'

// ───── Reference values & enums ────────────────────────────────────────

export interface ImportRefs {
  departments: string[]
  branches: string[]
  jobPositions: string[]
  jobLevels: string[]
  classes: string[]
}

const STATUS_VALUES = ['active', 'probation', 'suspended', 'terminated', 'archived'] as const
const EMPLOYMENT_TYPE_VALUES = ['permanent', 'contract', 'probation', 'internship', 'outsource'] as const
const GENDER_VALUES = ['male', 'female'] as const
const MARITAL_VALUES = ['single', 'married', 'divorced', 'widowed'] as const
const BLOOD_TYPE_VALUES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const
const RELIGION_VALUES = ['islam', 'protestant', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'] as const

// ───── Column definitions ──────────────────────────────────────────────

type ColumnKey =
  | 'name' | 'phone'
  | 'employee_code' | 'email'
  | 'first_name' | 'last_name'
  | 'departments' | 'branch_name' | 'job_position' | 'job_level' | 'class'
  | 'employment_type' | 'status' | 'join_date' | 'probation_end_date' | 'resign_date'
  | 'date_of_birth' | 'place_of_birth' | 'gender' | 'religion' | 'marital_status' | 'blood_type'
  | 'ktp_nik' | 'address' | 'postal_code' | 'citizen_id_address'
  | 'passport_number' | 'passport_expiry'
  | 'notes'

interface ColumnDef {
  key: ColumnKey
  /** Header text (uses translation keys where possible). */
  header: (t: Translations) => string
  required: boolean
  /** Cell-format hint: 'text' for phones / IDs, 'date' for date columns. */
  format?: 'text' | 'date'
  /** Validation source for dropdown / parser check. */
  validate?:
    | { kind: 'enum'; values: readonly string[] }
    | { kind: 'ref'; ref: keyof ImportRefs }
    | { kind: 'refMulti'; ref: keyof ImportRefs; separators: RegExp }
  width?: number
}

const COLUMNS: ColumnDef[] = [
  // Required
  { key: 'name',  header: t => `${t.nameLabel} *`,            required: true,  width: 24 },
  { key: 'phone', header: t => `${t.phoneWhatsAppLabel} *`,   required: true,  format: 'text', width: 18 },

  // Identity / employment
  { key: 'employee_code', header: t => t.empFieldEmployeeCode, required: false, format: 'text', width: 14 },
  { key: 'email',         header: t => t.empFieldEmail,        required: false, width: 24 },
  { key: 'first_name',    header: t => t.empFieldFirstName,    required: false, width: 16 },
  { key: 'last_name',     header: t => t.empFieldLastName,     required: false, width: 16 },
  { key: 'departments',   header: t => t.departments,          required: false, validate: { kind: 'refMulti', ref: 'departments', separators: /[,;]/ }, width: 28 },
  { key: 'branch_name',   header: t => t.empFieldBranchName,   required: false, validate: { kind: 'ref', ref: 'branches' },     width: 18 },
  { key: 'job_position',  header: t => t.empFieldJobPosition,  required: false, validate: { kind: 'ref', ref: 'jobPositions' }, width: 22 },
  { key: 'job_level',     header: t => t.empFieldJobLevel,     required: false, validate: { kind: 'ref', ref: 'jobLevels' },    width: 16 },
  { key: 'class',         header: t => t.empFieldClass,        required: false, validate: { kind: 'ref', ref: 'classes' },      width: 14 },
  { key: 'employment_type', header: t => t.empFieldEmploymentType, required: false, validate: { kind: 'enum', values: EMPLOYMENT_TYPE_VALUES }, width: 16 },
  { key: 'status',         header: t => t.statusLabel,          required: false, validate: { kind: 'enum', values: STATUS_VALUES }, width: 14 },
  { key: 'join_date',         header: t => t.empFieldJoinDate,         required: false, format: 'date', width: 14 },
  { key: 'probation_end_date',header: t => t.empFieldProbationEndDate, required: false, format: 'date', width: 16 },
  { key: 'resign_date',       header: t => t.empFieldResignDate,       required: false, format: 'date', width: 14 },

  // Personal
  { key: 'date_of_birth',  header: t => t.empFieldDateOfBirth, required: false, format: 'date', width: 14 },
  { key: 'place_of_birth', header: t => t.empFieldPlaceOfBirth, required: false, width: 18 },
  { key: 'gender',         header: t => t.empFieldGender,         required: false, validate: { kind: 'enum', values: GENDER_VALUES }, width: 12 },
  { key: 'religion',       header: t => t.empFieldReligion,       required: false, validate: { kind: 'enum', values: RELIGION_VALUES }, width: 14 },
  { key: 'marital_status', header: t => t.empFieldMaritalStatus, required: false, validate: { kind: 'enum', values: MARITAL_VALUES }, width: 14 },
  { key: 'blood_type',     header: t => t.empFieldBloodType,     required: false, validate: { kind: 'enum', values: BLOOD_TYPE_VALUES }, width: 12 },
  { key: 'ktp_nik',        header: t => t.empFieldKtpNik,       required: false, format: 'text', width: 20 },

  // Address
  { key: 'address',            header: t => t.empFieldResidentialAddress, required: false, width: 32 },
  { key: 'postal_code',        header: t => t.empFieldPostalCode,         required: false, format: 'text', width: 12 },
  { key: 'citizen_id_address', header: t => t.empFieldCitizenIdAddress,   required: false, width: 32 },

  // Other
  { key: 'passport_number', header: t => t.empFieldPassportNumber, required: false, format: 'text', width: 18 },
  { key: 'passport_expiry', header: t => t.empFieldPassportExpiry, required: false, format: 'date', width: 14 },
  { key: 'notes',           header: t => t.notesLabel,           required: false, width: 32 },
]

// ───── Parsed shape & errors ───────────────────────────────────────────

export interface EmployeeImportInput {
  name: string
  phone: string
  employee_code: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  departments: string[]
  branch_name: string | null
  job_position: string | null
  job_level: string | null
  class: string | null
  employment_type: string | null
  status: string | null
  join_date: string | null
  probation_end_date: string | null
  resign_date: string | null
  date_of_birth: string | null
  place_of_birth: string | null
  gender: string | null
  religion: string | null
  marital_status: string | null
  blood_type: string | null
  ktp_nik: string | null
  address: string | null
  postal_code: string | null
  citizen_id_address: string | null
  passport_number: string | null
  passport_expiry: string | null
  notes: string | null
}

export interface ImportIssue {
  /** 1-based spreadsheet row (header is row 1, first data row is 2). */
  row: number
  /** Header label of the offending column, or null for row-level issues. */
  column: string | null
  message: string
}

export interface ParseResult {
  rows: EmployeeImportInput[]
  issues: ImportIssue[]
}

// ───── Template generator ──────────────────────────────────────────────

const REF_SHEET_NAME = 'Reference'
const DATA_SHEET_NAME = 'Employees'
const INSTRUCTIONS_SHEET_NAME = 'Instructions'

export async function buildImportTemplate(opts: {
  orgName: string
  refs: ImportRefs
  t: Translations
}): Promise<Blob> {
  const { refs, t } = opts
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flodok'
  wb.created = new Date()

  // ── Reference sheet (hidden) ─────────────────────────────────────────
  // One column per list. Used as the source for dropdowns on the data sheet.
  const refSheet = wb.addWorksheet(REF_SHEET_NAME, { state: 'hidden' })
  const refLists: Array<{ key: string; values: readonly string[] }> = [
    { key: 'departments',  values: refs.departments },
    { key: 'branches',     values: refs.branches },
    { key: 'jobPositions', values: refs.jobPositions },
    { key: 'jobLevels',    values: refs.jobLevels },
    { key: 'classes',      values: refs.classes },
    { key: 'status',       values: STATUS_VALUES },
    { key: 'employment_type', values: EMPLOYMENT_TYPE_VALUES },
    { key: 'gender',       values: GENDER_VALUES },
    { key: 'marital',      values: MARITAL_VALUES },
    { key: 'blood',        values: BLOOD_TYPE_VALUES },
    { key: 'religion',     values: RELIGION_VALUES },
  ]
  refLists.forEach((list, colIdx) => {
    const col = refSheet.getColumn(colIdx + 1)
    col.values = [list.key, ...list.values]
    col.width = 20
  })

  // Helper: build the formula range string for a list (e.g. 'Reference!$A$2:$A$50').
  function rangeForList(listKey: string): string | null {
    const idx = refLists.findIndex(l => l.key === listKey)
    if (idx === -1) return null
    const list = refLists[idx]
    if (list.values.length === 0) return null
    const colLetter = String.fromCharCode(65 + idx) // A, B, C…
    return `${REF_SHEET_NAME}!$${colLetter}$2:$${colLetter}$${list.values.length + 1}`
  }

  // ── Data sheet ───────────────────────────────────────────────────────
  const sheet = wb.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  // Header row.
  const headerRow = sheet.addRow(COLUMNS.map(c => c.header(t)))
  headerRow.font = { bold: true, color: { argb: 'FF111827' } }
  headerRow.alignment = { vertical: 'middle' }
  headerRow.height = 22
  COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col.required ? 'FFE0E7FF' : 'FFF3F4F6' },
    }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    }
  })

  // Column widths + per-column number/text format applied to the body range.
  COLUMNS.forEach((col, idx) => {
    const xlCol = sheet.getColumn(idx + 1)
    xlCol.width = col.width ?? 16
    if (col.format === 'text') xlCol.numFmt = '@'
    if (col.format === 'date') xlCol.numFmt = 'yyyy-mm-dd'
  })

  // Apply data validations across a generous body range so users can paste
  // many rows. exceljs supports range-scoped data validations via a runtime
  // API that isn't in the .d.ts — narrow cast keeps it typed at the call site.
  const BODY_ROWS = 1000
  const validations = (sheet as unknown as {
    dataValidations: { add: (range: string, value: ExcelJS.DataValidation) => void }
  }).dataValidations

  COLUMNS.forEach((col, idx) => {
    if (!col.validate) return
    const colLetter = String.fromCharCode(65 + idx)
    const range = `${colLetter}2:${colLetter}${BODY_ROWS + 1}`

    let formula: string | null = null
    if (col.validate.kind === 'enum') {
      formula = `"${col.validate.values.join(',')}"`
    } else if (col.validate.kind === 'ref') {
      const refRange = rangeForList(col.validate.ref)
      if (refRange) formula = refRange
    }
    // refMulti (departments) — no Excel-side dropdown; validated on parse.

    if (!formula) return
    validations.add(range, {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Not allowed',
      error: 'Pick a value from the dropdown. Add new values on the Company page first.',
    })
  })

  // ── Instructions sheet ───────────────────────────────────────────────
  const inst = wb.addWorksheet(INSTRUCTIONS_SHEET_NAME)
  inst.getColumn(1).width = 100
  inst.addRow([`${opts.orgName} — ${t.importInstructionsTitle ?? 'Bulk import instructions'}`])
    .font = { bold: true, size: 14 }
  inst.addRow([])
  const lines = [
    t.importInstructionLine1 ?? 'Required fields are marked with * in the header row. Every other column is optional.',
    t.importInstructionLine2 ?? 'Phone numbers must be valid (e.g. +62812… or 0812…). Leading zeros are preserved automatically.',
    t.importInstructionLine3 ?? 'Branch / Job position / Job level / Class / Departments must already exist on your Company page. Unknown values fail the row — they are NOT created from this file.',
    t.importInstructionLine4 ?? 'Departments accept multiple values separated by a comma or semicolon (e.g. "Production, Quality").',
    t.importInstructionLine5 ?? 'Dates use the YYYY-MM-DD format (Excel dates are also accepted).',
    t.importInstructionLine6 ?? 'Employee ID, if blank, is auto-generated. If provided, it must be unique within your organisation.',
  ]
  for (const line of lines) inst.addRow([`• ${line}`])

  // ── Output ───────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ───── Parser ──────────────────────────────────────────────────────────

export async function parseImportFile(opts: {
  file: File | Blob
  refs: ImportRefs
  existingPhones: Set<string>
  existingCodes: Set<string>
  defaultCountryCode: string | null
  t: Translations
}): Promise<ParseResult> {
  const { refs, existingPhones, existingCodes, defaultCountryCode, t } = opts

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await opts.file.arrayBuffer())

  // Find the data sheet — accept the canonical name OR fall back to the first
  // visible sheet, in case the user resaved with a different name.
  const sheet = wb.getWorksheet(DATA_SHEET_NAME)
    ?? wb.worksheets.find(ws => ws.state !== 'hidden')
    ?? wb.worksheets[0]
  if (!sheet) {
    return { rows: [], issues: [{ row: 0, column: null, message: t.importNoSheetFound ?? 'No data sheet found in the uploaded file.' }] }
  }

  // Build the column index map from the header row.
  const headerRow = sheet.getRow(1)
  const headerToCol = new Map<string, number>()
  headerRow.eachCell((cell, colNumber) => {
    const text = (cell.value ?? '').toString().trim().replace(/\s*\*$/, '').toLowerCase()
    if (text) headerToCol.set(text, colNumber)
  })

  const colIndex = (def: ColumnDef): number | null => {
    const headerText = def.header(t).replace(/\s*\*$/, '').trim().toLowerCase()
    return headerToCol.get(headerText) ?? null
  }

  // Pre-build case-insensitive lookup maps for ref values, returning canonical casing.
  const refMap = (values: string[]) => {
    const map = new Map<string, string>()
    for (const v of values) map.set(v.trim().toLowerCase(), v.trim())
    return map
  }
  const refLookups: Record<keyof ImportRefs, Map<string, string>> = {
    departments:  refMap(refs.departments),
    branches:     refMap(refs.branches),
    jobPositions: refMap(refs.jobPositions),
    jobLevels:    refMap(refs.jobLevels),
    classes:      refMap(refs.classes),
  }

  const rows: EmployeeImportInput[] = []
  const issues: ImportIssue[] = []
  const seenPhones = new Set<string>()
  const seenCodes = new Set<string>()

  const lastRow = sheet.actualRowCount
  for (let r = 2; r <= lastRow; r++) {
    const xlRow = sheet.getRow(r)
    if (isEmptyRow(xlRow, COLUMNS.length)) continue

    const draft: Partial<EmployeeImportInput> = { departments: [] }
    const rowIssues: ImportIssue[] = []

    for (const def of COLUMNS) {
      const cIdx = colIndex(def)
      if (cIdx === null) continue
      const cell = xlRow.getCell(cIdx)
      const raw = readCell(cell)

      if (raw === null || raw === '') {
        if (def.required) {
          rowIssues.push({ row: r, column: def.header(t), message: t.importErrRequired ?? 'Required.' })
        }
        // Set null/empty fields explicitly.
        if (def.key === 'departments') draft.departments = []
        else (draft as Record<string, unknown>)[def.key] = def.required ? '' : null
        continue
      }

      // Normalise per-column.
      switch (def.key) {
        case 'name':
          draft.name = String(raw).trim()
          break
        case 'phone': {
          const normalized = normalizePhone(String(raw).trim(), defaultCountryCode ?? undefined)
          if (!isValidE164(normalized)) {
            rowIssues.push({ row: r, column: def.header(t), message: t.importErrInvalidPhone ?? 'Invalid phone number.' })
          }
          draft.phone = normalized
          break
        }
        case 'departments': {
          const text = String(raw).trim()
          const pieces = text.split(/[,;]/).map(s => s.trim()).filter(Boolean)
          const canonical: string[] = []
          for (const p of pieces) {
            const match = refLookups.departments.get(p.toLowerCase())
            if (!match) {
              rowIssues.push({
                row: r, column: def.header(t),
                message: (t.importErrUnknownRef ?? "'{value}' isn't configured. Add it on the Company page first.").replace('{value}', p),
              })
            } else if (!canonical.some(c => c.toLowerCase() === match.toLowerCase())) {
              canonical.push(match)
            }
          }
          draft.departments = canonical
          break
        }
        case 'branch_name':
        case 'job_position':
        case 'job_level':
        case 'class': {
          const refKey: keyof ImportRefs =
            def.key === 'branch_name' ? 'branches' :
            def.key === 'job_position' ? 'jobPositions' :
            def.key === 'job_level' ? 'jobLevels' : 'classes'
          const text = String(raw).trim()
          const match = refLookups[refKey].get(text.toLowerCase())
          if (!match) {
            rowIssues.push({
              row: r, column: def.header(t),
              message: (t.importErrUnknownRef ?? "'{value}' isn't configured. Add it on the Company page first.").replace('{value}', text),
            })
            ;(draft as Record<string, unknown>)[def.key] = text
          } else {
            ;(draft as Record<string, unknown>)[def.key] = match
          }
          break
        }
        default: {
          if (def.validate?.kind === 'enum') {
            const text = String(raw).trim().toLowerCase()
            if (!def.validate.values.map(v => v.toLowerCase()).includes(text)) {
              rowIssues.push({
                row: r, column: def.header(t),
                message: (t.importErrEnum ?? 'Must be one of: {values}.').replace('{values}', def.validate.values.join(', ')),
              })
              ;(draft as Record<string, unknown>)[def.key] = String(raw).trim()
            } else {
              ;(draft as Record<string, unknown>)[def.key] = text
            }
          } else if (def.format === 'date') {
            const iso = coerceDate(raw)
            if (!iso) {
              rowIssues.push({
                row: r, column: def.header(t),
                message: t.importErrInvalidDate ?? 'Invalid date. Use YYYY-MM-DD.',
              })
              ;(draft as Record<string, unknown>)[def.key] = null
            } else {
              ;(draft as Record<string, unknown>)[def.key] = iso
            }
          } else {
            ;(draft as Record<string, unknown>)[def.key] = String(raw).trim()
          }
        }
      }
    }

    // Cross-field checks.
    if (draft.phone) {
      if (seenPhones.has(draft.phone)) {
        rowIssues.push({ row: r, column: t.phoneWhatsAppLabel, message: t.importErrDuplicatePhoneInFile ?? 'Duplicate phone number in this file.' })
      } else if (existingPhones.has(draft.phone)) {
        rowIssues.push({ row: r, column: t.phoneWhatsAppLabel, message: t.importErrDuplicatePhoneExisting ?? 'An employee with this phone already exists.' })
      }
      seenPhones.add(draft.phone)
    }
    if (draft.employee_code) {
      const code = draft.employee_code
      if (seenCodes.has(code)) {
        rowIssues.push({ row: r, column: t.empFieldEmployeeCode, message: t.importErrDuplicateCodeInFile ?? 'Duplicate Employee ID in this file.' })
      } else if (existingCodes.has(code)) {
        rowIssues.push({ row: r, column: t.empFieldEmployeeCode, message: t.importErrDuplicateCodeExisting ?? 'An employee with this Employee ID already exists.' })
      }
      seenCodes.add(code)
    }

    if (rowIssues.length > 0) {
      issues.push(...rowIssues)
    } else {
      rows.push(finalize(draft as EmployeeImportInput))
    }
  }

  return { rows, issues }
}

// ───── Helpers ─────────────────────────────────────────────────────────

function isEmptyRow(row: ExcelJS.Row, columnCount: number): boolean {
  for (let i = 1; i <= columnCount; i++) {
    const v = row.getCell(i).value
    if (v !== null && v !== undefined && String(v).trim() !== '') return false
  }
  return true
}

function readCell(cell: ExcelJS.Cell): string | number | Date | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  // Formula cell → use its result if available.
  if (typeof v === 'object' && 'result' in v && v.result !== undefined) {
    return v.result as string | number | Date
  }
  // Rich text → flatten.
  if (typeof v === 'object' && 'richText' in v && Array.isArray(v.richText)) {
    return v.richText.map(rt => rt.text).join('')
  }
  if (v instanceof Date) return v
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v as string | number
  return String(v)
}

function coerceDate(raw: string | number | Date): string | null {
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null
    return raw.toISOString().slice(0, 10)
  }
  if (typeof raw === 'number') {
    // Excel serial date — convert (days since 1899-12-30, allowing for the
    // Lotus 1-2-3 leap-year bug).
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const s = String(raw).trim()
  if (!s) return null
  // Accept YYYY-MM-DD or YYYY/MM/DD or DD/MM/YYYY.
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function finalize(draft: EmployeeImportInput): EmployeeImportInput {
  // Default status to 'probation' (matches the existing single-add flow).
  if (!draft.status) draft.status = 'probation'
  return draft
}

// ───── Export ──────────────────────────────────────────────────────────

export async function buildExportFile(opts: {
  orgName: string
  employees: Employee[]
  t: Translations
}): Promise<Blob> {
  const { employees, t } = opts
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Flodok'
  wb.created = new Date()

  const sheet = wb.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const header = sheet.addRow(COLUMNS.map(c => c.header(t)))
  header.font = { bold: true }
  COLUMNS.forEach((col, idx) => {
    const xlCol = sheet.getColumn(idx + 1)
    xlCol.width = col.width ?? 16
    if (col.format === 'text') xlCol.numFmt = '@'
    if (col.format === 'date') xlCol.numFmt = 'yyyy-mm-dd'
  })

  for (const emp of employees) {
    const values = COLUMNS.map(c => {
      if (c.key === 'departments') {
        const arr = emp.departments ?? (emp.department ? [emp.department] : [])
        return arr.join(', ')
      }
      const value = (emp as unknown as Record<string, unknown>)[c.key]
      if (value === null || value === undefined) return ''
      return value as string | number
    })
    sheet.addRow(values)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
