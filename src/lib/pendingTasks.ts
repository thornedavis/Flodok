import { supabase } from './supabase'
import type { Database } from '../types/database'

// AI-proposed tasks (from the Fireflies pipeline) awaiting owner review on the
// Pending page. Accepting one creates a real row in `tasks`; rejecting flips its
// status. See docs/fireflies-tasks-plan.md and migrations 207/208.
export type PendingTask = Database['public']['Tables']['pending_tasks']['Row']

export async function listPendingTasks(orgId: string): Promise<PendingTask[]> {
  const { data, error } = await supabase
    .from('pending_tasks')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as PendingTask[]
}

export interface AcceptPendingTaskInput {
  pendingId: string
  title: string
  notes?: string | null
  dueDate?: string | null
  priority?: number
  assigneeEmployeeId?: string | null
  assigneeUserId?: string | null
  projectId?: string | null
  visibleInPortal?: boolean
}

// accept_pending_task is a SECURITY INVOKER RPC (migration 208) that atomically
// inserts the real task and stamps the pending row. It isn't in the generated
// Database types, so we cast — matching the portal RPC pattern in lib/tasks.ts.
type AcceptRpc = (
  fn: 'accept_pending_task',
  args: {
    p_pending_id: string
    p_title: string
    p_notes: string | null
    p_due_date: string | null
    p_priority: number
    p_assignee_employee_id: string | null
    p_assignee_user_id: string | null
    p_project_id: string | null
    p_visible_in_portal: boolean
  },
) => Promise<{ data: string | null; error: { message: string } | null }>

export async function acceptPendingTask(input: AcceptPendingTaskInput): Promise<string> {
  const { data, error } = await (supabase.rpc as unknown as AcceptRpc)('accept_pending_task', {
    p_pending_id: input.pendingId,
    p_title: input.title,
    p_notes: input.notes ?? null,
    p_due_date: input.dueDate ?? null,
    p_priority: input.priority ?? 2,
    p_assignee_employee_id: input.assigneeEmployeeId ?? null,
    p_assignee_user_id: input.assigneeUserId ?? null,
    p_project_id: input.projectId ?? null,
    p_visible_in_portal: input.visibleInPortal ?? false,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function rejectPendingTask(id: string, reviewedBy: string): Promise<void> {
  const { error } = await supabase
    .from('pending_tasks')
    .update({ status: 'rejected', reviewed_by: reviewedBy, resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
