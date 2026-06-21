import { supabase } from './supabase'
import type { Contract, DocumentTemplate } from '../types/aliases'
import type { Json } from '../types/database'
import type { CompensationComponentInput } from './snapshotApi'

// Find a contract template configured for the given job position.
// Reads from the typed `document_templates` table (Phase G.1) — the
// previous implementation read from `contracts where is_template=true`.
export async function findTemplateForPosition(orgId: string, position: string | null | undefined): Promise<DocumentTemplate | null> {
  if (!position) return null
  const { data } = await supabase
    .from('document_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('type', 'contract')
    .eq('template_for_position', position)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// Build the insert payload for a fresh contract derived from a template,
// linked to the given employee. Caller is responsible for the actual
// insert so it can layer on per-call overrides (start_date, etc.).
// Copies content_doc (the structured-document source of truth in Phase C)
// alongside the legacy markdown columns so older templates created before
// the editor migration continue to work — the snapshot helper will
// re-derive markdown from content_doc on the first save of the cloned
// contract.
export function buildContractFromTemplate(template: DocumentTemplate, employeeId: string, overrides?: Partial<Contract>): {
  org_id: string
  employee_id: string
  title: string
  content_doc: Json | null
  content_markdown: string
  content_markdown_id: string | null
  base_wage_idr: number | null
  allowance_idr: number | null
  hours_per_day: number | null
  days_per_week: number | null
  start_date: string | null
  end_date: string | null
  status: 'draft'
  is_template: false
} {
  return {
    org_id: template.org_id,
    employee_id: employeeId,
    title: overrides?.title ?? template.title,
    content_doc: template.content_doc,
    content_markdown: template.content_markdown,
    content_markdown_id: template.content_markdown_id,
    base_wage_idr: overrides?.base_wage_idr ?? template.base_wage_idr,
    allowance_idr: overrides?.allowance_idr ?? template.allowance_idr,
    hours_per_day: overrides?.hours_per_day ?? template.hours_per_day,
    days_per_week: overrides?.days_per_week ?? template.days_per_week,
    start_date: overrides?.start_date ?? null,
    end_date: overrides?.end_date ?? null,
    status: 'draft',
    is_template: false,
  }
}

// Read a template's stored allowance breakdown as typed earning lines. Empty
// when the template isn't itemised. Tolerant of malformed rows.
export function templateComponents(tpl: { compensation_components?: Json | null }): CompensationComponentInput[] {
  const raw = tpl.compensation_components
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r, i) => {
    if (!r || typeof r !== 'object') return []
    const o = r as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const amount = typeof o.amount_idr === 'number' ? o.amount_idr : Number(o.amount_idr)
    if (name === '' || !Number.isFinite(amount)) return []
    const kind = o.kind === 'deduction' || o.kind === 'benefit' ? o.kind : 'earning'
    return [{
      name,
      kind: kind as CompensationComponentInput['kind'],
      is_fixed: o.is_fixed === true,
      amount_idr: Math.max(0, Math.round(amount)),
      display_order: typeof o.display_order === 'number' ? o.display_order : i,
    }]
  })
}

// Seed contract_compensation_components for a freshly-created contract from a
// template's breakdown. The DB trigger then derives contracts.allowance_idr.
// No-op when the template has no components (the contract keeps the single
// allowance_idr copied by buildContractFromTemplate / createDocFromTemplate).
export async function seedContractComponentsFromTemplate(
  contractId: string,
  orgId: string,
  tpl: { compensation_components?: Json | null },
): Promise<void> {
  const comps = templateComponents(tpl)
  if (comps.length === 0) return
  await supabase.from('contract_compensation_components').insert(
    comps.map((c, i) => ({
      org_id: orgId,
      contract_id: contractId,
      name: c.name,
      kind: c.kind,
      is_fixed: c.is_fixed,
      amount_idr: c.amount_idr,
      display_order: c.display_order ?? i,
    })),
  )
}
