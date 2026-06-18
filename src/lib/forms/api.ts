// Thin RPC wrappers + feed emitter for the Forms workflow. Mirrors the shape of
// src/lib/hiringRequests.ts. The new RPCs (migration 151) aren't in the
// generated Supabase types yet, so we call them through a typed shim — the same
// cast pattern Portal.tsx uses for portal_documents.

import { supabase } from '../supabase'
import type { FormSubmission } from '../../types/aliases'
import type { FormIdentity, FormsConfig } from './registry'
import type { LeaveFieldData } from './leaveRequest'
import type { OvertimeFieldData, OvertimeLineItem } from './overtimeRequest'

type RpcResult = { data: unknown; error: { message: string } | null }
type RpcFn = (name: string, params?: Record<string, unknown>) => PromiseLike<RpcResult>
// NB: bind to the client — a bare `supabase.rpc` reference loses its `this`,
// and supabase-js's rpc() reaches for `this.rest` (→ "reading 'rest'" crash).
const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn

export interface PortalFormSubmission {
  id: string
  form_type: FormSubmission['form_type']
  status: FormSubmission['status']
  field_data: Record<string, unknown>
  created_at: string
  submitted_at: string | null
  committed_at: string | null
  manager_decision: 'approved' | 'rejected' | null
  manager_decision_note: string | null
  owner_decision: 'approved' | 'rejected' | null
  owner_decision_note: string | null
  line_items: OvertimeLineItem[]
}

export interface PortalFormsResult {
  forms_enabled: boolean
  identity: FormIdentity
  submissions: PortalFormSubmission[]
}

// ─── Portal submission (slug + token authed) ────────────────────────────────

export async function submitLeaveRequest(
  slug: string,
  token: string,
  fieldData: Omit<LeaveFieldData, 'identity' | 'total_days'>,
): Promise<FormSubmission> {
  const { data, error } = await rpc('portal_submit_leave_request', {
    emp_slug: slug,
    emp_token: token,
    p_field_data: fieldData,
  })
  if (error) throw new Error(error.message)
  return data as FormSubmission
}

export async function submitOvertimeRequest(
  slug: string,
  token: string,
  fieldData: Pick<OvertimeFieldData, 'work_status'>,
  lineItems: OvertimeLineItem[],
): Promise<FormSubmission> {
  const { data, error } = await rpc('portal_submit_overtime_request', {
    emp_slug: slug,
    emp_token: token,
    p_field_data: fieldData,
    p_line_items: lineItems,
  })
  if (error) throw new Error(error.message)
  return data as FormSubmission
}

export async function listPortalForms(slug: string, token: string): Promise<PortalFormsResult> {
  const { data, error } = await rpc('portal_forms_list', { emp_slug: slug, emp_token: token })
  if (error) throw new Error(error.message)
  return data as PortalFormsResult
}

// ─── Dashboard decisions ────────────────────────────────────────────────────

export async function managerDecideForm(
  submissionId: string,
  approve: boolean,
  note?: string | null,
): Promise<FormSubmission> {
  const { data, error } = await rpc('manager_decide_form', {
    p_submission_id: submissionId,
    p_approve: approve,
    p_note: note ?? undefined,
  })
  if (error) throw new Error(error.message)
  return data as FormSubmission
}

export async function ownerDecideForm(
  submissionId: string,
  approve: boolean,
  note?: string | null,
): Promise<FormSubmission> {
  const { data, error } = await rpc('owner_decide_form', {
    p_submission_id: submissionId,
    p_approve: approve,
    p_note: note ?? undefined,
  })
  if (error) throw new Error(error.message)
  return data as FormSubmission
}

// ─── Feed events (client-emitted for decisions, like hiring) ────────────────
//
// Submission itself emits 'form_submitted' via a DB trigger (migration 150).
// Decision transitions are emitted here, best-effort.

export type FormEventKind = 'manager_approved' | 'manager_rejected' | 'approved' | 'owner_rejected'

export async function emitFormEvent(args: {
  orgId: string
  kind: FormEventKind
  submission: FormSubmission
  title: string
}): Promise<void> {
  const { error } = await supabase.from('feed_events').insert({
    org_id: args.orgId,
    employee_id: args.submission.employee_id,
    event_type: `form_${args.kind}`,
    title: args.title,
    description: args.submission.form_type,
    metadata: {
      submission_id: args.submission.id,
      form_type: args.submission.form_type,
      manager_user_id: args.submission.manager_user_id,
    },
  })
  if (error) console.warn('feed_events insert (form) failed:', error.message)
}

// ─── Phase 2: leave balance + payroll repost ────────────────────────────────

export interface LeaveBalance {
  year: number
  entitlement: number
  used: number
  remaining: number
  accrued?: number
  eligible?: boolean
  service_months?: number
  gate_months?: number
}

export async function getPortalLeaveBalance(slug: string, token: string): Promise<LeaveBalance> {
  const { data, error } = await rpc('portal_leave_balance', { emp_slug: slug, emp_token: token })
  if (error) throw new Error(error.message)
  return data as LeaveBalance
}

export async function getAdminLeaveBalance(employeeId: string, year?: number): Promise<LeaveBalance> {
  const { data, error } = await rpc('admin_leave_balance', { p_employee_id: employeeId, p_year: year ?? undefined })
  if (error) throw new Error(error.message)
  return data as LeaveBalance
}

export async function repostFormToPayroll(submissionId: string): Promise<void> {
  const { error } = await rpc('repost_form_to_payroll', { p_submission_id: submissionId })
  if (error) throw new Error(error.message)
}

export async function getPortalFormsConfig(slug: string, token: string): Promise<FormsConfig> {
  const { data, error } = await rpc('portal_forms_config', { emp_slug: slug, emp_token: token })
  if (error) throw new Error(error.message)
  return (data ?? {}) as FormsConfig
}
