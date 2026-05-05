import { supabase } from './supabase'
import type { Contract } from '../types/aliases'

// Find a template configured for the given job position. Returns null if
// none exists. Org-scoped.
export async function findTemplateForPosition(orgId: string, position: string | null | undefined): Promise<Contract | null> {
  if (!position) return null
  const { data } = await supabase
    .from('contracts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_template', true)
    .eq('template_for_position', position)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

// Build the insert payload for a fresh contract derived from a template,
// linked to the given employee. Caller is responsible for the actual
// insert so it can layer on per-call overrides (start_date, etc.).
export function buildContractFromTemplate(template: Contract, employeeId: string, overrides?: Partial<Contract>): {
  org_id: string
  employee_id: string
  title: string
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
    content_markdown: template.content_markdown,
    content_markdown_id: template.content_markdown_id,
    base_wage_idr: overrides?.base_wage_idr ?? template.base_wage_idr,
    allowance_idr: overrides?.allowance_idr ?? template.allowance_idr,
    hours_per_day: overrides?.hours_per_day ?? template.hours_per_day,
    days_per_week: overrides?.days_per_week ?? template.days_per_week,
    start_date: overrides?.start_date ?? template.start_date,
    end_date: overrides?.end_date ?? template.end_date,
    status: 'draft',
    is_template: false,
  }
}
