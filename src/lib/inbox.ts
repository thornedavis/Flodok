// Inbox item derivation.
//
// Items aren't stored — they're computed at query time from existing entity
// state (contracts, sops, pending_updates, employees). Per-user UI state
// (snoozes, explicit dismissals) lives in `inbox_dismissals` and is layered
// on top via `dedupe_key` matching.
//
// Each item belongs to one of three buckets (rendered as tabs):
//   - action_required: the current user owes a decision now
//   - awaiting_others: we've sent it, waiting on someone else
//   - upcoming:        heads-up, no action yet but coming soon
//
// And one of five categories (rendered as filter pills):
//   contract | sop | probation | document | pending_update

import type {
  Contract,
  Sop,
  Employee,
  PendingUpdate,
  ContractSignature,
  SopSignature,
  InboxDismissal,
  FormSubmission,
} from '../types/aliases'
import { documentEditPath } from './documentTypes'

export type InboxBucket = 'action_required' | 'awaiting_others' | 'upcoming'
export type InboxCategory = 'contract' | 'sop' | 'probation' | 'document' | 'pending_update' | 'form'

export type InboxKind =
  | 'pending_update_review'
  | 'probation_decision_due'
  | 'contract_awaiting_employee_signature'
  | 'sop_awaiting_employee_signature'
  | 'probation_ending_soon'
  | 'passport_expiring_soon'
  | 'form_awaiting_manager_decision'
  | 'form_awaiting_owner_decision'

export interface InboxItem {
  dedupe_key: string
  kind: InboxKind
  bucket: InboxBucket
  category: InboxCategory
  title: string
  // Optional secondary line — usually employee name or short context.
  subtitle?: string
  // ISO date string. Drives sort order (soonest first) and the right-rail
  // due label. Past dates are highlighted as overdue.
  due_at: string | null
  // Where the action button takes the user.
  href: string
  // Free-text label for the action button (e.g. "Review", "Open contract").
  action_label_key: ActionLabelKey
}

export type ActionLabelKey =
  | 'inboxActionReview'
  | 'inboxActionOpenContract'
  | 'inboxActionOpenSop'
  | 'inboxActionOpenEmployee'

// Days of look-ahead per kind. Items only surface once they fall inside the
// window. Probation gets a tighter window because the decision is
// time-sensitive; passports get a wider one because renewals take weeks.
const PROBATION_DECISION_WINDOW_DAYS = 7      // T-7 → overdue ⇒ action_required
const PROBATION_UPCOMING_WINDOW_DAYS = 30     // T-30 → T-8 ⇒ upcoming
const PASSPORT_UPCOMING_WINDOW_DAYS = 60      // T-60 → T-0 ⇒ upcoming

// ─── Derivation inputs ──────────────────────────────────

export interface DeriveInputs {
  contracts: Contract[]
  sops: Sop[]
  employees: Employee[]
  pendingUpdates: PendingUpdate[]
  contractSignatures: ContractSignature[]
  sopSignatures: SopSignature[]
  dismissals: InboxDismissal[]
  // Forms awaiting a decision. viewerUserId / viewerIsOwner personalise which
  // pending forms count as "action required" for the current viewer.
  forms?: FormSubmission[]
  viewerUserId?: string
  viewerIsOwner?: boolean
  now?: Date
}

// ─── Main entry point ───────────────────────────────────

export function deriveInboxItems({
  contracts,
  sops,
  employees,
  pendingUpdates,
  contractSignatures,
  sopSignatures,
  dismissals,
  forms = [],
  viewerUserId,
  viewerIsOwner,
  now = new Date(),
}: DeriveInputs): InboxItem[] {
  const empById = new Map(employees.map(e => [e.id, e]))
  const items: InboxItem[] = []

  // Pending updates awaiting review.
  for (const pu of pendingUpdates) {
    if (pu.status !== 'pending') continue
    items.push({
      dedupe_key: `pending_update_review:${pu.id}`,
      kind: 'pending_update_review',
      bucket: 'action_required',
      category: 'pending_update',
      title: pu.employee_identifier
        ? `Update suggested for ${pu.employee_identifier}`
        : 'Update suggested',
      subtitle: pu.source_meeting || undefined,
      due_at: pu.created_at,
      href: '/dashboard/pending',
      action_label_key: 'inboxActionReview',
    })
  }

  // Contracts awaiting employee signature.
  // 'active' status = employer has signed (the activate-and-sign flow flips
  // status only after the employer signature row is written), so any active
  // contract without an employee signature is sitting on the employee.
  const contractEmployeeSigs = new Set(
    contractSignatures.filter(s => s.signer_role === 'employee').map(s => s.contract_id),
  )
  for (const c of contracts) {
    if (c.status !== 'active') continue
    if (contractEmployeeSigs.has(c.id)) continue
    if (!c.employee_id) continue
    const emp = empById.get(c.employee_id)
    items.push({
      dedupe_key: `contract_awaiting_employee_signature:${c.id}`,
      kind: 'contract_awaiting_employee_signature',
      bucket: 'awaiting_others',
      category: 'contract',
      title: c.title,
      subtitle: emp?.name,
      due_at: c.updated_at || c.created_at,
      href: documentEditPath('contract', c.id),
      action_label_key: 'inboxActionOpenContract',
    })
  }

  // SOPs awaiting employee signature.
  // SOPs only have employee signatures (no employer counter-sign), so any
  // active SOP without a sop_signatures row is awaiting the employee.
  const sopSignedSet = new Set(sopSignatures.map(s => s.sop_id))
  for (const s of sops) {
    if (s.status !== 'active') continue
    if (sopSignedSet.has(s.id)) continue
    if (!s.employee_id) continue
    const emp = empById.get(s.employee_id)
    items.push({
      dedupe_key: `sop_awaiting_employee_signature:${s.id}`,
      kind: 'sop_awaiting_employee_signature',
      bucket: 'awaiting_others',
      category: 'sop',
      title: s.title,
      subtitle: emp?.name,
      due_at: s.updated_at || s.created_at,
      href: documentEditPath('sop', s.id),
      action_label_key: 'inboxActionOpenSop',
    })
  }

  // Form submissions (leave / overtime) awaiting a decision from this viewer.
  // Manager step → the designated approver; owner step → the owner.
  for (const f of forms) {
    const empName = f.employee_id ? empById.get(f.employee_id)?.name ?? undefined : undefined
    const title = `${f.form_type === 'leave_request' ? 'Leave request' : 'Overtime request'}${empName ? ` — ${empName}` : ''}`
    const base = {
      bucket: 'action_required' as const,
      category: 'form' as const,
      title,
      subtitle: empName,
      due_at: f.submitted_at || f.created_at,
      href: `/dashboard/forms/${f.id}`,
      action_label_key: 'inboxActionReview' as const,
    }
    if (f.status === 'submitted' && viewerUserId && f.manager_user_id === viewerUserId) {
      items.push({ ...base, dedupe_key: `form_awaiting_manager_decision:${f.id}`, kind: 'form_awaiting_manager_decision' })
    } else if (f.status === 'manager_approved' && viewerIsOwner) {
      items.push({ ...base, dedupe_key: `form_awaiting_owner_decision:${f.id}`, kind: 'form_awaiting_owner_decision' })
    }
  }

  // Probation events. Bucket depends on how close the end date is.
  for (const emp of employees) {
    if (!emp.probation_end_date) continue
    if (emp.resign_date) continue
    const daysUntil = daysBetween(now, emp.probation_end_date)
    if (daysUntil > PROBATION_UPCOMING_WINDOW_DAYS) continue
    const decisionDue = daysUntil <= PROBATION_DECISION_WINDOW_DAYS
    items.push({
      dedupe_key: decisionDue
        ? `probation_decision_due:${emp.id}:${emp.probation_end_date}`
        : `probation_ending_soon:${emp.id}:${emp.probation_end_date}`,
      kind: decisionDue ? 'probation_decision_due' : 'probation_ending_soon',
      bucket: decisionDue ? 'action_required' : 'upcoming',
      category: 'probation',
      title: decisionDue
        ? `Probation decision: ${emp.name}`
        : `Probation ending: ${emp.name}`,
      subtitle: emp.job_position || undefined,
      due_at: emp.probation_end_date,
      href: `/dashboard/employees/${emp.id}/edit`,
      action_label_key: 'inboxActionOpenEmployee',
    })
  }

  // Passport expiry — upcoming only (no auto-action; we just want eyes on it).
  for (const emp of employees) {
    if (!emp.passport_expiry) continue
    if (emp.resign_date) continue
    const daysUntil = daysBetween(now, emp.passport_expiry)
    if (daysUntil > PASSPORT_UPCOMING_WINDOW_DAYS) continue
    items.push({
      dedupe_key: `passport_expiring_soon:${emp.id}:${emp.passport_expiry}`,
      kind: 'passport_expiring_soon',
      bucket: 'upcoming',
      category: 'document',
      title: `Passport expiring: ${emp.name}`,
      subtitle: emp.job_position || undefined,
      due_at: emp.passport_expiry,
      href: `/dashboard/employees/${emp.id}/edit`,
      action_label_key: 'inboxActionOpenEmployee',
    })
  }

  // Layer per-user dismissal/snooze state.
  const dismissedKeys = new Set<string>()
  const snoozedUntil = new Map<string, string>()
  for (const d of dismissals) {
    if (d.dismissed_at) dismissedKeys.add(d.dedupe_key)
    if (d.snoozed_until && new Date(d.snoozed_until) > now) {
      snoozedUntil.set(d.dedupe_key, d.snoozed_until)
    }
  }
  return items
    .filter(i => !dismissedKeys.has(i.dedupe_key))
    .filter(i => !snoozedUntil.has(i.dedupe_key))
    .sort(byDueDateAscending)
}

// ─── Sort + bucket helpers ──────────────────────────────

function byDueDateAscending(a: InboxItem, b: InboxItem): number {
  if (!a.due_at && !b.due_at) return 0
  if (!a.due_at) return 1
  if (!b.due_at) return -1
  return a.due_at.localeCompare(b.due_at)
}

function daysBetween(now: Date, iso: string): number {
  const target = new Date(iso)
  const diffMs = target.getTime() - now.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

// ─── Filter helpers used by the page ────────────────────

export const ALL_CATEGORIES: InboxCategory[] = [
  'contract', 'sop', 'probation', 'document', 'pending_update', 'form',
]

// `bucket` accepts 'all' to span every bucket — used by the top-level
// "All inbox" tab on the page.
export type InboxBucketSelection = InboxBucket | 'all'

export function filterByBucketAndCategories(
  items: InboxItem[],
  bucket: InboxBucketSelection,
  activeCategories: Set<InboxCategory>,
  search: string,
): InboxItem[] {
  const q = search.trim().toLowerCase()
  return items.filter(i => {
    if (bucket !== 'all' && i.bucket !== bucket) return false
    if (activeCategories.size > 0 && !activeCategories.has(i.category)) return false
    if (!q) return true
    return (
      i.title.toLowerCase().includes(q) ||
      (i.subtitle?.toLowerCase().includes(q) ?? false)
    )
  })
}

export function countByBucket(items: InboxItem[]): Record<InboxBucket, number> {
  const counts: Record<InboxBucket, number> = {
    action_required: 0,
    awaiting_others: 0,
    upcoming: 0,
  }
  for (const i of items) counts[i.bucket]++
  return counts
}

export function countByCategory(
  items: InboxItem[],
  bucket: InboxBucketSelection,
): Record<InboxCategory, number> {
  const counts: Record<InboxCategory, number> = {
    contract: 0, sop: 0, probation: 0, document: 0, pending_update: 0, form: 0,
  }
  for (const i of items) {
    if (bucket !== 'all' && i.bucket !== bucket) continue
    counts[i.category]++
  }
  return counts
}
