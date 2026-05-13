// Shared types, enum constants, and label helpers for the hiring-request
// workflow. The form mirrors the paper template (see migration 090 for the
// schema-side mapping); enums here stay tight to that source.

import { supabase } from './supabase'
import type { HiringRequest } from '../types/aliases'

export const EMPLOYMENT_TYPES = ['freelance', 'fixed_contract', 'permanent'] as const
export type EmploymentType = typeof EMPLOYMENT_TYPES[number]

export const REQUEST_CATEGORIES = ['new_hire', 'replacement'] as const
export type RequestCategory = typeof REQUEST_CATEGORIES[number]

export const CANDIDATE_SOURCES = ['internal', 'external'] as const
export type CandidateSource = typeof CANDIDATE_SOURCES[number]

export const FUND_SOURCES = ['budgeted', 'non_budgeted'] as const
export type FundSource = typeof FUND_SOURCES[number]

export const ALLOWANCE_OPTIONS = ['meal', 'transport', 'overtime', 'incentive', 'bonus', 'other'] as const
export type AllowanceOption = typeof ALLOWANCE_OPTIONS[number]

export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'manager_approved',
  'approved',
  'rejected_by_manager',
  'rejected_by_owner',
  'actioned',
] as const
export type RequestStatus = typeof REQUEST_STATUSES[number]

/** True when the status represents a terminal state — the request is done
 *  routing one way or another. Useful for UI gating. */
export function isTerminalStatus(s: RequestStatus): boolean {
  return s === 'approved' || s === 'rejected_by_manager' || s === 'rejected_by_owner' || s === 'actioned'
}

/** True when the requester can still edit the request directly (no
 *  decisions have been recorded yet). Mirrors the UPDATE policy in 090. */
export function isEditableByRequester(s: RequestStatus): boolean {
  return s === 'draft' || s === 'submitted'
}

/** The party whose decision is currently awaited, or null if the request
 *  is in a terminal state. */
export function pendingApprover(s: RequestStatus): 'manager' | 'owner' | null {
  if (s === 'submitted') return 'manager'
  if (s === 'manager_approved') return 'owner'
  return null
}

// ─── Status badge tone ───────────────────────────────────────────────────

export type StatusTone = 'neutral' | 'progress' | 'success' | 'danger'

export function statusTone(s: RequestStatus): StatusTone {
  switch (s) {
    case 'draft':               return 'neutral'
    case 'submitted':           return 'progress'
    case 'manager_approved':    return 'progress'
    case 'approved':            return 'success'
    case 'actioned':            return 'success'
    case 'rejected_by_manager': return 'danger'
    case 'rejected_by_owner':   return 'danger'
  }
}

// ─── RPC wrappers ────────────────────────────────────────────────────────
//
// Thin wrappers that keep call sites readable and centralise error mapping.
// Each returns the updated request row on success, or throws.

export async function submitHiringRequest(requestId: string): Promise<HiringRequest> {
  const { data, error } = await supabase.rpc('submit_hiring_request', { p_request_id: requestId })
  if (error) throw new Error(error.message)
  return data as unknown as HiringRequest
}

export async function managerDecideHiringRequest(
  requestId: string,
  approve: boolean,
  note?: string | null,
): Promise<HiringRequest> {
  const { data, error } = await supabase.rpc('manager_decide_hiring_request', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? undefined,
  })
  if (error) throw new Error(error.message)
  return data as unknown as HiringRequest
}

export async function ownerDecideHiringRequest(
  requestId: string,
  approve: boolean,
  note?: string | null,
): Promise<HiringRequest> {
  const { data, error } = await supabase.rpc('owner_decide_hiring_request', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? undefined,
  })
  if (error) throw new Error(error.message)
  return data as unknown as HiringRequest
}

// ─── Feed events ────────────────────────────────────────────────────────
//
// Hiring-request lifecycle transitions land in the org-wide feed so they
// show up on the Overview page activity stream. The Overview renderer
// special-cases event_type values starting with 'hiring_request_' — see
// eventLabel/eventVisual there.
//
// employee_id is left null because the request isn't about an existing
// employee. The "actor" (requester or decider) is embedded in the
// description so the feed entry reads naturally without a user lookup.

export type HiringEventKind =
  | 'submitted'
  | 'manager_approved'
  | 'manager_rejected'
  | 'approved'
  | 'owner_rejected'

interface EmitArgs {
  orgId: string
  kind: HiringEventKind
  request: HiringRequest
  positionName: string
  description?: string | null
}

export async function emitHiringRequestEvent({
  orgId, kind, request, positionName, description,
}: EmitArgs): Promise<void> {
  // Best-effort — if the insert fails (e.g. RLS quirk), we log and move on
  // rather than blocking the workflow. The transition itself already
  // succeeded server-side at this point.
  const { error } = await supabase.from('feed_events').insert({
    org_id: orgId,
    employee_id: null,
    event_type: `hiring_request_${kind}`,
    title: positionName,
    description: description ?? null,
    metadata: {
      hiring_request_id: request.id,
      department_id: request.department_id,
      requester_id: request.hiring_manager_id,
      manager_auto_approved: request.manager_auto_approved,
    },
  })
  if (error) console.warn('feed_events insert (hiring) failed:', error.message)
}

export async function markHiringRequestActioned(
  requestId: string,
  candidateEmployeeId: string,
): Promise<HiringRequest> {
  const { data, error } = await supabase.rpc('mark_hiring_request_actioned', {
    p_request_id: requestId,
    p_candidate_employee_id: candidateEmployeeId,
  })
  if (error) throw new Error(error.message)
  return data as unknown as HiringRequest
}
