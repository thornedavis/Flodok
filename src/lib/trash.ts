import { supabase } from './supabase'

export type TrashItemType =
  | 'employee'
  | 'sop'
  | 'contract'
  | 'job_description'
  | 'hiring_request'
  | 'spotlight_post'

export type TrashDocumentType = 'sop' | 'contract' | 'job_description' | 'letter'

export interface TrashItem {
  item_type: TrashItemType
  item_id: string
  title: string
  subtitle: string | null
  deleted_at: string
  deleted_by: string | null
  deleted_by_name: string | null
  deleted_by_avatar: string | null
  trashed_with_parent_id: string | null
}

export interface EmployeeAttachmentCounts {
  // SOPs where this employee is the sole audience target. Cascade-eligible:
  // trashing the employee with cascadeDocs=true also trashes these SOPs.
  soleAudienceSops: number
  // SOPs where this employee is one of several audience targets. These
  // SOPs always stay alive; the employee is silently detached.
  sharedAudienceSops: number
  contracts: number
  attachments: number
}

const RETENTION_DAYS = 30

export function daysRemaining(deletedAt: string, now: Date = new Date()): number {
  const deleted = new Date(deletedAt).getTime()
  const elapsedDays = (now.getTime() - deleted) / 86_400_000
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsedDays))
}

export async function trashEmployee(
  employeeId: string,
  opts: { cascadeDocs?: boolean } = {},
): Promise<void> {
  const { error } = await supabase.rpc('trash_employee', {
    p_employee_id: employeeId,
    p_cascade_docs: opts.cascadeDocs ?? false,
  })
  if (error) throw new Error(error.message)
}

export async function trashDocument(
  docId: string,
  docType: TrashDocumentType,
): Promise<void> {
  const { error } = await supabase.rpc('trash_document', {
    p_doc_id: docId,
    p_doc_type: docType,
  })
  if (error) throw new Error(error.message)
}

export async function trashHiringRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('trash_hiring_request', {
    p_request_id: requestId,
  })
  if (error) throw new Error(error.message)
}

export async function trashSpotlightPost(postId: string): Promise<void> {
  const { error } = await supabase.rpc('trash_spotlight_post', {
    p_post_id: postId,
  })
  if (error) throw new Error(error.message)
}

export async function restoreItem(itemId: string, itemType: TrashItemType): Promise<void> {
  const { error } = await supabase.rpc('restore_item', {
    p_item_id: itemId,
    p_item_type: itemType,
  })
  if (error) throw new Error(error.message)
}

export async function purgeItem(itemId: string, itemType: TrashItemType): Promise<void> {
  const { error } = await supabase.rpc('purge_item', {
    p_item_id: itemId,
    p_item_type: itemType,
  })
  if (error) throw new Error(error.message)
}

export async function listTrash(): Promise<TrashItem[]> {
  const { data, error } = await supabase.rpc('list_trash')
  if (error) throw new Error(error.message)
  return (data || []) as TrashItem[]
}

export async function emptyTrash(): Promise<void> {
  const { error } = await supabase.rpc('empty_trash')
  if (error) throw new Error(error.message)
}

// Counts what a "delete this employee + cascade" would actually take down.
// Used by the DeleteEmployeeModal to render the danger-zone summary.
// SOP counts come from the audience-aware RPC: a cascade only trashes
// SOPs where this employee is the sole audience target, so the modal
// distinguishes that from "also appears in N SOPs as one of several
// targets" (which stay alive and silently detach this person).
export async function countEmployeeAttachments(
  employeeId: string,
): Promise<EmployeeAttachmentCounts> {
  const [impactRes, contractsRes, attachmentsRes] = await Promise.all([
    supabase.rpc('employee_audience_impact', { p_employee_id: employeeId }),
    supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId),
    supabase
      .from('employee_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId),
  ])
  const impact = (impactRes.data ?? {}) as { sole_audience_sops?: number; shared_audience_sops?: number }
  return {
    soleAudienceSops: impact.sole_audience_sops ?? 0,
    sharedAudienceSops: impact.shared_audience_sops ?? 0,
    contracts: contractsRes.count ?? 0,
    attachments: attachmentsRes.count ?? 0,
  }
}
