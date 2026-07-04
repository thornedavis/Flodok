// Single source of truth for the employee lifecycle split.
//
// employees.lifecycle_stage (migrations 078/081/101) has eight values. Six are
// recruitment-pipeline stages; only two describe the real, current workforce.
// Recruits must appear ONLY on the recruitment surface — every other employee
// picker, list, count, or notification should scope to the workforce stages,
// or recruits "bleed" into places they don't belong (contract/NDA pickers, the
// notification inbox, seat counts). The server-side precedent is payroll
// (migration 182) and the billing seat count (migration 187 / billing edge fn).
//
// deleted_at note: authenticated dashboard reads are already stripped of
// soft-deleted rows by RLS (migration 103), so client-side queries only need
// the lifecycle_stage filter — adding deleted_at there is a redundant no-op.
// SECURITY DEFINER RPCs / service-role edge functions bypass RLS and must
// self-filter BOTH deleted_at and lifecycle_stage.

import { supabase } from './supabase'

export const WORKFORCE_STAGES = ['active', 'separated'] as const
export const RECRUITMENT_STAGES = ['prospective', 'shortlisted', 'offered', 'signed', 'talent_pool', 'no_show'] as const

export type WorkforceStage = (typeof WORKFORCE_STAGES)[number]
export type RecruitmentStage = (typeof RECRUITMENT_STAGES)[number]
export type LifecycleStage = WorkforceStage | RecruitmentStage

// Relational select used by every employee picker to pull department names
// alongside the employee row. Previously copy-pasted into ~9 files.
export const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

/**
 * The standard "real workforce" employee query: an org's active + separated
 * employees, department-joined and name-ordered, with recruits excluded.
 * Returns the PostgREST builder so callers can `await` it directly or drop it
 * into a Promise.all. Pass a narrower `select` (e.g. 'id, name') when you don't
 * need departments.
 */
export function activeWorkforceEmployees(orgId: string, select: string = EMPLOYEE_WITH_DEPTS_SELECT) {
  return supabase
    .from('employees')
    .select(select)
    .eq('org_id', orgId)
    .in('lifecycle_stage', [...WORKFORCE_STAGES])
    .order('name')
}

/**
 * Union a document's currently-linked employee back into a workforce-scoped
 * list, so an editor whose contract/NDA/letter is linked to a recruit (a live
 * Make-Offer contract sits on an 'offered' candidate) still displays the link
 * instead of falling back to "No employee linked".
 *
 * No-ops when `linkedId` is null (new/blank docs surface nobody) or already
 * present. A soft-deleted linked employee is invisible to RLS and stays out —
 * the field then reads as unlinked, which is the intended nudge to reassign.
 */
export async function withLinkedEmployee<T extends { id: string }>(
  list: T[],
  linkedId: string | null | undefined,
  select: string = EMPLOYEE_WITH_DEPTS_SELECT,
): Promise<T[]> {
  if (!linkedId || list.some(e => e.id === linkedId)) return list
  const { data } = await supabase.from('employees').select(select).eq('id', linkedId).maybeSingle()
  return data ? [...list, data as unknown as T] : list
}

/**
 * Plural form of {@link withLinkedEmployee} for multi-select audiences
 * (SOP audience, spotlight targets) and any list of already-referenced ids.
 * Fetches only the ids missing from `list` in a single query and appends them,
 * so filtering the option source never silently drops an already-selected
 * employee who now falls outside the workforce stages.
 */
export async function withLinkedEmployees<T extends { id: string }>(
  list: T[],
  linkedIds: (string | null | undefined)[],
  select: string = EMPLOYEE_WITH_DEPTS_SELECT,
): Promise<T[]> {
  const present = new Set(list.map(e => e.id))
  const missing = [...new Set(linkedIds.filter((x): x is string => !!x && !present.has(x)))]
  if (missing.length === 0) return list
  const { data } = await supabase.from('employees').select(select).in('id', missing)
  return data ? [...list, ...(data as unknown as T[])] : list
}
