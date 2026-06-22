// Placeholder → merge-field mapping for imported letter templates (P3).
//
// An imported .docx letter carries verbatim bracketed placeholders the org
// typed into Word: [Employee Name], [Date], [Position], [Alamat]. To make the
// saved template actually FILL employee/org data when instantiated, those
// brackets must become Flodok merge fields — which in the editor are real
// ProseMirror nodes (`{ type: 'mergeField', attrs: { key } }`, see
// src/components/editor/MergeField.tsx), not `{{token}}` text.
//
// Strategy (deterministic, no AI): a bilingual EN/ID synonym dictionary maps a
// normalized bracket to a letter-scope MergeFieldKey on EXACT match only.
// Matched brackets are rewritten into mergeField nodes (splitting the host
// text node, preserving its marks); everything else is left exactly as it was
// — never guess. The unmatched-but-placeholder-looking brackets are reported
// so the import review step can offer a dropdown to assign them by hand.
//
// Only LETTER-scope tokens are eligible (employee_*, org_*, today, sender_*).
// There is deliberately NO mapping for [Position]/[Salary]/[Jabatan]: the
// letter scope has no such token, so they stay as visible text and surface in
// review rather than being silently wired to the wrong field.

import { MERGE_FIELDS, type MergeFieldKey } from './mergeFields'
import type { DocNode, DocumentDoc } from './documentDoc'

// Letter-scope keys this mapper is allowed to emit. Mirrors
// fieldsForScope('letter') = the 'both' group + sender_name/sender_title.
const LETTER_KEYS: ReadonlySet<MergeFieldKey> = new Set<MergeFieldKey>([
  'employee_name', 'employee_phone', 'employee_email', 'employee_address',
  'employee_ktp_nik', 'employee_date_of_birth', 'employee_departments',
  'org_name', 'org_address', 'today', 'sender_name', 'sender_title',
])

// Normalize a placeholder's inner text to a dictionary key: lowercase, collapse
// every run of non-alphanumerics to a single space, trim. So "Employee Name",
// "[employee_name]", "EMPLOYEE NAME:" and "dd/mm/yy" become "employee name" and
// "dd mm yy" respectively.
function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Synonym dictionary (EN + ID). Keys are already in normalized form. Only
// unambiguous synonyms are listed — anything that could mean the employee's
// own job title/position/salary is intentionally absent (no letter token).
const DICTIONARY: Record<string, MergeFieldKey> = {
  // employee_name
  'employee name': 'employee_name', 'employee full name': 'employee_name',
  'full name': 'employee_name', 'name': 'employee_name', 'employee': 'employee_name',
  'nama': 'employee_name', 'nama karyawan': 'employee_name',
  'nama lengkap': 'employee_name', 'nama lengkap karyawan': 'employee_name',
  'recipient name': 'employee_name', 'nama penerima': 'employee_name',
  // employee_address
  'address': 'employee_address', 'employee address': 'employee_address',
  'home address': 'employee_address', 'alamat': 'employee_address',
  'alamat karyawan': 'employee_address', 'alamat rumah': 'employee_address',
  // employee_ktp_nik
  'ktp': 'employee_ktp_nik', 'nik': 'employee_ktp_nik', 'ktp nik': 'employee_ktp_nik',
  'no ktp': 'employee_ktp_nik', 'nomor ktp': 'employee_ktp_nik',
  'id number': 'employee_ktp_nik', 'national id': 'employee_ktp_nik',
  'nomor induk kependudukan': 'employee_ktp_nik',
  // employee_phone
  'phone': 'employee_phone', 'phone number': 'employee_phone',
  'telephone': 'employee_phone', 'mobile': 'employee_phone',
  'telepon': 'employee_phone', 'no telepon': 'employee_phone',
  'nomor telepon': 'employee_phone', 'no hp': 'employee_phone',
  'nomor hp': 'employee_phone', 'telp': 'employee_phone',
  // employee_email
  'email': 'employee_email', 'e mail': 'employee_email',
  'email address': 'employee_email', 'email karyawan': 'employee_email',
  'alamat email': 'employee_email',
  // employee_date_of_birth
  'date of birth': 'employee_date_of_birth', 'dob': 'employee_date_of_birth',
  'birth date': 'employee_date_of_birth', 'tanggal lahir': 'employee_date_of_birth',
  'tgl lahir': 'employee_date_of_birth',
  // employee_departments
  'department': 'employee_departments', 'departments': 'employee_departments',
  'division': 'employee_departments', 'departemen': 'employee_departments',
  'divisi': 'employee_departments', 'bagian': 'employee_departments',
  // org_name
  'company': 'org_name', 'company name': 'org_name', 'organization': 'org_name',
  'organisation': 'org_name', 'organization name': 'org_name', 'perusahaan': 'org_name',
  'nama perusahaan': 'org_name', 'organisasi': 'org_name', 'nama organisasi': 'org_name',
  // org_address
  'company address': 'org_address', 'organization address': 'org_address',
  'office address': 'org_address', 'alamat perusahaan': 'org_address',
  'alamat kantor': 'org_address', 'alamat organisasi': 'org_address',
  // today
  'date': 'today', 'today': 'today', 'today s date': 'today', 'current date': 'today',
  'tanggal': 'today', 'tgl': 'today', 'tanggal hari ini': 'today',
  'dd mm yy': 'today', 'dd mm yyyy': 'today', 'mm dd yyyy': 'today',
  // sender_name
  'sender': 'sender_name', 'sender name': 'sender_name', 'name of sender': 'sender_name',
  'pengirim': 'sender_name', 'nama pengirim': 'sender_name', 'signed by': 'sender_name',
  'authorized by': 'sender_name', 'authorised by': 'sender_name',
  'manager name': 'sender_name', 'hr name': 'sender_name',
  // sender_title
  'sender title': 'sender_title', 'title of sender': 'sender_title',
  'sender position': 'sender_title', 'jabatan pengirim': 'sender_title',
  'jabatan penandatangan': 'sender_title', 'manager title': 'sender_title',
  'designation of sender': 'sender_title',
}

function lookupToken(inner: string): MergeFieldKey | null {
  const key = DICTIONARY[normalizeToken(inner)]
  return key && LETTER_KEYS.has(key) ? key : null
}

export type MappedPlaceholder = { bracket: string; key: MergeFieldKey; labelEn: string }

const BRACKET_RE = /\[[^\]\n]+\]/g

// Splits one text node on bracketed placeholders, converting a bracket to a
// mergeField node when `resolve` returns a key. Unmatched brackets stay inside
// the surrounding text run (their marks preserved). Returns the original node
// unchanged when nothing converts.
function splitTextNode(
  node: DocNode,
  resolve: (inner: string) => MergeFieldKey | null,
  onMatch?: (bracket: string, key: MergeFieldKey) => void,
  onSkip?: (bracket: string) => void,
): DocNode[] {
  const text = node.text || ''
  if (!text || !text.includes('[')) return [node]
  const marks = node.marks
  const out: DocNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  BRACKET_RE.lastIndex = 0
  const pushText = (s: string) => { if (s) out.push({ type: 'text', text: s, ...(marks && marks.length ? { marks } : {}) }) }
  while ((m = BRACKET_RE.exec(text)) !== null) {
    const bracket = m[0]
    const inner = bracket.slice(1, -1)
    const key = resolve(inner)
    if (key) {
      pushText(text.slice(last, m.index))
      out.push({ type: 'mergeField', attrs: { key } })
      last = m.index + bracket.length
      onMatch?.(bracket, key)
    } else {
      onSkip?.(bracket)
    }
  }
  if (out.length === 0) return [node]
  pushText(text.slice(last))
  return out
}

// Walks the whole doc, rewriting text nodes via splitTextNode. mergeField nodes
// are inline, so inserting them wherever a text node lives is always schema-valid.
function walkConvert(
  node: DocNode,
  resolve: (inner: string) => MergeFieldKey | null,
  onMatch?: (bracket: string, key: MergeFieldKey) => void,
  onSkip?: (bracket: string) => void,
): DocNode {
  // Never rewrite inside a code block — its content model is text-only, so a
  // mergeField (inline atom) there would be schema-invalid. (The DOCX importer
  // doesn't emit codeBlocks today, but keep the walker safe for any caller.)
  if (node.type === 'codeBlock') return node
  if (!Array.isArray(node.content)) return node
  const content: DocNode[] = []
  for (const child of node.content) {
    if (child.type === 'text') content.push(...splitTextNode(child, resolve, onMatch, onSkip))
    else content.push(walkConvert(child, resolve, onMatch, onSkip))
  }
  return { ...node, content }
}

// Auto-maps the well-known placeholders in a doc and reports the rest.
// `mapped` are distinct brackets wired to a token; `unmapped` are distinct
// placeholder-looking brackets (letter-bearing) that matched nothing — fodder
// for the manual review dropdown.
export function mapPlaceholders(doc: DocumentDoc): {
  doc: DocumentDoc
  mapped: MappedPlaceholder[]
  unmapped: string[]
} {
  const mapped = new Map<string, MappedPlaceholder>()
  const unmapped = new Set<string>()
  const onMatch = (bracket: string, key: MergeFieldKey) => {
    if (!mapped.has(bracket)) mapped.set(bracket, { bracket, key, labelEn: MERGE_FIELDS[key].label.en })
  }
  const onSkip = (bracket: string) => {
    const inner = bracket.slice(1, -1)
    // Only surface plausible placeholders (letter-bearing, not too long, not a
    // footnote like [1]); leave incidental brackets out of the review list.
    if (inner.length <= 40 && /[a-zA-Z]/.test(inner)) unmapped.add(bracket)
  }
  const out = walkConvert(doc, lookupToken, onMatch, onSkip) as DocumentDoc
  return { doc: out, mapped: [...mapped.values()], unmapped: [...unmapped] }
}

// Review reassignment: convert every occurrence of one exact bracket string
// (e.g. "[Position]") into a mergeField for the chosen key. Used when the user
// picks a token for an unmapped placeholder in the import review step.
export function assignPlaceholder(doc: DocumentDoc, bracket: string, key: MergeFieldKey): DocumentDoc {
  // Match the VERBATIM bracket string the review row showed — distinct rows
  // like [Position] and [POSITION:] (which normalize alike) must stay
  // independent, so assigning one never silently rewrites the other.
  const resolve = (inner: string) => (`[${inner}]` === bracket ? key : null)
  return walkConvert(doc, resolve) as DocumentDoc
}
