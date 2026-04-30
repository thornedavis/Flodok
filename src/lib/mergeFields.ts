// Merge-field system for Contracts and SOPs.
//
// A merge field is a token like {{employee_name}} embedded in document
// markdown. The resolver replaces it with a value pulled from structured
// data (employee, organization, contract, today). Structured fields are the
// source of truth; the markdown is a presentational template — there is no
// reverse parsing of free-form prose back into structured fields.
//
// Resolution is locale-aware: currency formats per IDR conventions, dates
// per the active language. When a field can't be resolved (e.g., the SOP
// scope doesn't include `base_wage_idr`, or the employee has no phone),
// the resolver returns a neutral placeholder like `[employee phone]` so
// the document still renders cleanly and the gap is visible.

import { formatIdr } from './credits'
import type { Employee, Organization, Contract } from '../types/aliases'

export type Lang = 'en' | 'id'

// A signature snapshot — what the signer typed plus the chosen font and the
// timestamp. Used both for persisted signatures (from contract_signatures)
// and for live previews while a user is picking a font but hasn't confirmed
// yet. `signed_at` may be null in the preview case.
export type SignatureSnapshot = {
  typed_name: string
  signature_font: string | null
  signed_at: string | null
}

// Manager-side signature also carries the displayed name/title since the
// employer block in the contract has those as separate lines.
export type EmployerSignatureSnapshot = SignatureSnapshot & {
  employer_name?: string | null
  employer_title?: string | null
}

export type MergeContext = {
  employee?: Employee | null
  organization?: Organization | null
  contract?: Contract | null
  today?: Date
  lang?: Lang
  // Signatures are version-pinned at the call site — pass in only the sig
  // matching the version being rendered, or null/undefined if unsigned.
  employeeSignature?: SignatureSnapshot | null
  employerSignature?: EmployerSignatureSnapshot | null
  // Identity of the current logged-in manager. Used as a fallback for
  // employer_name / employer_title in unsigned drafts so the EMPLOYER block
  // shows something sensible while the manager is still authoring. Once a
  // signature is recorded, the persisted snapshot wins.
  signer?: { name?: string | null; title?: string | null } | null
}

export type MergeFieldScope = 'sop' | 'contract' | 'both'

export type MergeFieldKey =
  | 'employee_name'
  | 'employee_phone'
  | 'employee_email'
  | 'employee_address'
  | 'employee_ktp_nik'
  | 'employee_date_of_birth'
  | 'employee_departments'
  | 'org_name'
  | 'org_address'
  | 'today'
  | 'contract_start_date'
  | 'contract_end_date'
  | 'base_wage_idr'
  | 'allowance_idr'
  | 'hours_per_day'
  | 'days_per_week'
  | 'employee_signature'
  | 'employee_sign_date'
  | 'employer_name'
  | 'employer_title'
  | 'employer_signature'
  | 'employer_sign_date'

export type MergeFieldDef = {
  key: MergeFieldKey
  scope: MergeFieldScope
  // Picker label per language. Editor UI shows these when inserting a field.
  label: { en: string; id: string }
  // Short hint shown under the label in the picker.
  description: { en: string; id: string }
  // Returns the formatted string or null if the data isn't available.
  resolve: (ctx: MergeContext) => string | null
  // Optional override for what the in-editor pill displays. Use when `resolve`
  // returns HTML or otherwise unreadable text (e.g., signatures emit a styled
  // <span>); the editor pill should still show something legible.
  editorDisplay?: (ctx: MergeContext, lang: Lang) => string
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatDateString(value: string | Date | null | undefined, lang: Lang): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function joinAddress(org: Organization): string | null {
  const parts = [
    org.address_street,
    org.address_city,
    org.address_province,
    org.address_postal_code,
    org.address_country,
  ].filter((p): p is string => !!p && p.trim().length > 0)
  return parts.length > 0 ? parts.join(', ') : null
}

// Underline used for unsigned signature lines. Long enough to look like a
// signature line on a printed page, short enough not to wrap awkwardly on
// screen. Matches the visual style of the original static placeholder.
const SIGNATURE_BLANK = '________________________'
const FIELD_BLANK = '____________________________'

// Renders a signature as inline HTML so the chosen font can be applied. Used
// for both employee and employer signatures. Falls back to a blank line when
// the snapshot is missing. The `signature-name` class lets PDF export strip
// the visible signature when the user wants a blank copy for wet-signing.
function renderSignatureHtml(sig: SignatureSnapshot | null | undefined): string {
  if (!sig || !sig.typed_name) return SIGNATURE_BLANK
  const font = sig.signature_font || 'Dancing Script'
  // Inline styles only — the HTML is consumed by ReactMarkdown via rehype-raw
  // and also lands in PDF export, so it has to be self-contained.
  const escapedName = sig.typed_name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const escapedFont = font.replace(/'/g, '')
  return `<span class="signature-name" style="font-family: '${escapedFont}', cursive; font-size: 1.5em; line-height: 1; display: inline-block; min-width: 12em; border-bottom: 1px solid currentColor; padding-bottom: 2px;">${escapedName}</span>`
}

function joinDepartments(emp: Employee): string | null {
  const list = emp.departments && emp.departments.length > 0
    ? emp.departments
    : emp.department
      ? [emp.department]
      : []
  return list.length > 0 ? list.join(', ') : null
}

// ─── Field registry ─────────────────────────────────────────────────────────

export const MERGE_FIELDS: Record<MergeFieldKey, MergeFieldDef> = {
  employee_name: {
    key: 'employee_name',
    scope: 'both',
    label: { en: 'Employee name', id: 'Nama karyawan' },
    description: { en: "Full name of the assigned employee", id: 'Nama lengkap karyawan' },
    resolve: ctx => ctx.employee?.name ?? null,
  },
  employee_phone: {
    key: 'employee_phone',
    scope: 'both',
    label: { en: 'Employee phone', id: 'Telepon karyawan' },
    description: { en: 'Phone number in international format', id: 'Nomor telepon format internasional' },
    resolve: ctx => ctx.employee?.phone ?? null,
  },
  employee_email: {
    key: 'employee_email',
    scope: 'both',
    label: { en: 'Employee email', id: 'Email karyawan' },
    description: { en: 'Email address on file', id: 'Alamat email yang tercatat' },
    resolve: ctx => ctx.employee?.email ?? null,
  },
  employee_address: {
    key: 'employee_address',
    scope: 'both',
    label: { en: 'Employee address', id: 'Alamat karyawan' },
    description: { en: 'Home address on file', id: 'Alamat rumah yang tercatat' },
    resolve: ctx => ctx.employee?.address ?? null,
  },
  employee_ktp_nik: {
    key: 'employee_ktp_nik',
    scope: 'both',
    label: { en: 'Employee KTP / NIK', id: 'KTP / NIK karyawan' },
    description: { en: 'National ID number', id: 'Nomor Induk Kependudukan' },
    resolve: ctx => ctx.employee?.ktp_nik ?? null,
  },
  employee_date_of_birth: {
    key: 'employee_date_of_birth',
    scope: 'both',
    label: { en: 'Employee date of birth', id: 'Tanggal lahir karyawan' },
    description: { en: 'Date of birth, formatted', id: 'Tanggal lahir, diformat' },
    resolve: ctx => formatDateString(ctx.employee?.date_of_birth, ctx.lang ?? 'en'),
  },
  employee_departments: {
    key: 'employee_departments',
    scope: 'both',
    label: { en: 'Employee departments', id: 'Departemen karyawan' },
    description: { en: 'Departments the employee belongs to', id: 'Departemen tempat karyawan bekerja' },
    resolve: ctx => ctx.employee ? joinDepartments(ctx.employee) : null,
  },
  org_name: {
    key: 'org_name',
    scope: 'both',
    label: { en: 'Organization name', id: 'Nama organisasi' },
    description: { en: 'Your organization name', id: 'Nama organisasi Anda' },
    resolve: ctx => ctx.organization?.name ?? null,
  },
  org_address: {
    key: 'org_address',
    scope: 'both',
    label: { en: 'Organization address', id: 'Alamat organisasi' },
    description: { en: 'Full registered address', id: 'Alamat lengkap terdaftar' },
    resolve: ctx => ctx.organization ? joinAddress(ctx.organization) : null,
  },
  today: {
    key: 'today',
    scope: 'both',
    label: { en: "Today's date", id: 'Tanggal hari ini' },
    description: { en: "The date this document is rendered", id: 'Tanggal dokumen ini dirender' },
    resolve: ctx => formatDateString(ctx.today ?? new Date(), ctx.lang ?? 'en'),
  },
  contract_start_date: {
    key: 'contract_start_date',
    scope: 'contract',
    label: { en: 'Contract start date', id: 'Tanggal mulai kontrak' },
    description: { en: 'Effective start date of the contract', id: 'Tanggal mulai berlakunya kontrak' },
    // Prefer the structured start_date column. Falls back to created_at for
    // legacy rows backfilled from before the column existed.
    resolve: ctx => formatDateString(ctx.contract?.start_date ?? ctx.contract?.created_at, ctx.lang ?? 'en'),
  },
  contract_end_date: {
    key: 'contract_end_date',
    scope: 'contract',
    label: { en: 'Contract end date', id: 'Tanggal berakhir kontrak' },
    description: { en: 'End date for fixed-term (PKWT) contracts; blank for permanent', id: 'Tanggal berakhir kontrak waktu tertentu (PKWT); kosong untuk PKWTT' },
    resolve: ctx => formatDateString(ctx.contract?.end_date, ctx.lang ?? 'en'),
  },
  base_wage_idr: {
    key: 'base_wage_idr',
    scope: 'contract',
    label: { en: 'Base wage', id: 'Gaji pokok' },
    description: { en: 'Monthly base wage in IDR', id: 'Gaji pokok bulanan dalam IDR' },
    resolve: ctx => {
      const v = ctx.contract?.base_wage_idr
      return v == null ? null : formatIdr(v, ctx.lang ?? 'en')
    },
  },
  allowance_idr: {
    key: 'allowance_idr',
    scope: 'contract',
    label: { en: 'Allowance', id: 'Tunjangan' },
    description: { en: 'Monthly allowance baseline in IDR', id: 'Tunjangan bulanan dasar dalam IDR' },
    resolve: ctx => {
      const v = ctx.contract?.allowance_idr
      return v == null ? null : formatIdr(v, ctx.lang ?? 'en')
    },
  },
  hours_per_day: {
    key: 'hours_per_day',
    scope: 'contract',
    label: { en: 'Hours per day', id: 'Jam per hari' },
    description: { en: 'Contracted working hours per day', id: 'Jam kerja per hari sesuai kontrak' },
    resolve: ctx => ctx.contract?.hours_per_day?.toString() ?? null,
  },
  days_per_week: {
    key: 'days_per_week',
    scope: 'contract',
    label: { en: 'Days per week', id: 'Hari per minggu' },
    description: { en: 'Contracted working days per week', id: 'Hari kerja per minggu sesuai kontrak' },
    resolve: ctx => ctx.contract?.days_per_week?.toString() ?? null,
  },
  employee_signature: {
    key: 'employee_signature',
    scope: 'contract',
    label: { en: 'Employee signature', id: 'Tanda tangan karyawan' },
    description: { en: 'Renders the signed name when the employee has signed', id: 'Menampilkan tanda tangan setelah karyawan menandatangani' },
    resolve: ctx => renderSignatureHtml(ctx.employeeSignature),
    editorDisplay: (ctx, lang) => ctx.employeeSignature?.typed_name
      ? `✓ ${ctx.employeeSignature.typed_name}`
      : (lang === 'id' ? 'Tanda tangan karyawan' : 'Employee signature'),
  },
  employee_sign_date: {
    key: 'employee_sign_date',
    scope: 'contract',
    label: { en: 'Employee sign date', id: 'Tanggal tanda tangan karyawan' },
    description: { en: 'Date the employee signed', id: 'Tanggal karyawan menandatangani' },
    // Wrap signed dates in a tagged span so PDF export can blank them out
    // for "blank for signing" copies. Unsigned dates already render as a
    // plain underline which prints correctly without further handling.
    resolve: ctx => {
      const formatted = formatDateString(ctx.employeeSignature?.signed_at ?? null, ctx.lang ?? 'en')
      return formatted ? `<span class="signature-date">${formatted}</span>` : FIELD_BLANK
    },
  },
  employer_name: {
    key: 'employer_name',
    scope: 'contract',
    label: { en: 'Employer signer name', id: 'Nama penandatangan perusahaan' },
    description: { en: 'Name of the manager who signed on behalf of the employer', id: 'Nama manajer yang menandatangani atas nama perusahaan' },
    resolve: ctx =>
      ctx.employerSignature?.employer_name
      || ctx.employerSignature?.typed_name
      || ctx.signer?.name
      || FIELD_BLANK,
  },
  employer_title: {
    key: 'employer_title',
    scope: 'contract',
    label: { en: 'Employer signer title', id: 'Jabatan penandatangan perusahaan' },
    description: { en: "Manager's title (e.g. Director)", id: 'Jabatan manajer (mis. Direktur)' },
    resolve: ctx =>
      ctx.employerSignature?.employer_title
      || ctx.signer?.title
      || FIELD_BLANK,
  },
  employer_signature: {
    key: 'employer_signature',
    scope: 'contract',
    label: { en: 'Employer signature', id: 'Tanda tangan perusahaan' },
    description: { en: 'Renders the signed name when the employer has signed', id: 'Menampilkan tanda tangan setelah perusahaan menandatangani' },
    resolve: ctx => renderSignatureHtml(ctx.employerSignature),
    editorDisplay: (ctx, lang) => ctx.employerSignature?.typed_name
      ? `✓ ${ctx.employerSignature.typed_name}`
      : (lang === 'id' ? 'Tanda tangan perusahaan' : 'Employer signature'),
  },
  employer_sign_date: {
    key: 'employer_sign_date',
    scope: 'contract',
    label: { en: 'Employer sign date', id: 'Tanggal tanda tangan perusahaan' },
    description: { en: 'Date the employer signed', id: 'Tanggal perusahaan menandatangani' },
    resolve: ctx => {
      const formatted = formatDateString(ctx.employerSignature?.signed_at ?? null, ctx.lang ?? 'en')
      return formatted ? `<span class="signature-date">${formatted}</span>` : FIELD_BLANK
    },
  },
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const ALL_MERGE_FIELDS: MergeFieldDef[] = Object.values(MERGE_FIELDS)

export function isMergeFieldKey(key: string): key is MergeFieldKey {
  return key in MERGE_FIELDS
}

export function fieldsForScope(scope: 'sop' | 'contract'): MergeFieldDef[] {
  return ALL_MERGE_FIELDS.filter(f => f.scope === 'both' || f.scope === scope)
}

// Resolves a single merge field by key. Returns the formatted value, or a
// neutral bracketed placeholder like `[employee phone]` when the data isn't
// available — so a partly-filled template still renders without gaps.
export function resolveMergeField(key: MergeFieldKey, ctx: MergeContext): string {
  const def = MERGE_FIELDS[key]
  const lang = ctx.lang ?? 'en'
  const resolved = def.resolve(ctx)
  if (resolved !== null && resolved !== '') return resolved
  return `[${def.label[lang].toLowerCase()}]`
}

// Replaces every {{key}} occurrence in `template` with its resolved value.
// Unknown keys are left untouched (visible as `{{unknown_key}}`) so authoring
// mistakes are obvious rather than silently swallowed.
const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g
export function renderMergeFields(template: string, ctx: MergeContext): string {
  return template.replace(TOKEN_RE, (match, rawKey: string) => {
    if (!isMergeFieldKey(rawKey)) return match
    return resolveMergeField(rawKey, ctx)
  })
}
