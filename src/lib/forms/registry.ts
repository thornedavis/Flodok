// Shared types + status helpers for the Forms workflow. Mirrors the shape of
// src/lib/hiringRequests.ts, but for the unified two-tier (Manager → Owner)
// approval chain used by form_submissions (migrations 150–151).

import type { FormStatus, FormType } from '../../types/aliases'

export const FORM_TYPES: readonly FormType[] = ['leave_request', 'overtime_request'] as const

/** The server-resolved identity header snapshotted onto every submission at
 *  submit time (field_data.identity). Never free-text — see migration 151. */
export interface FormIdentity {
  name?: string | null
  employee_code?: string | null
  job_position?: string | null
  job_level?: string | null
  employment_type?: string | null
  ktp_nik?: string | null
  phone?: string | null
  department?: string | null
}

/** Per-org form configuration (organizations.forms_config). Config can only
 *  subtract / rename / require — never add fields or change logic. */
export interface FormsConfig {
  leave_request?: { enabled_leave_types?: string[]; require_reason?: boolean; require_service_year?: boolean }
  overtime_request?: { enabled_work_statuses?: string[] }
}

/** True when the submission is in a terminal state (done routing). */
export function isTerminalStatus(s: FormStatus): boolean {
  return s === 'approved' || s === 'rejected_by_manager' || s === 'rejected_by_owner'
}

/** The party whose decision is currently awaited, or null if terminal. */
export function pendingApprover(s: FormStatus): 'manager' | 'owner' | null {
  if (s === 'submitted') return 'manager'
  if (s === 'manager_approved') return 'owner'
  return null
}

export type StatusTone = 'neutral' | 'progress' | 'success' | 'danger'

export function statusTone(s: FormStatus): StatusTone {
  switch (s) {
    case 'draft':               return 'neutral'
    case 'submitted':           return 'progress'
    case 'manager_approved':    return 'progress'
    case 'approved':            return 'success'
    case 'rejected_by_manager': return 'danger'
    case 'rejected_by_owner':   return 'danger'
  }
}
