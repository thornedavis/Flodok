import { supabase } from './supabase'
import type { Database } from '../types/database'
import type { DocumentType } from './documentTypes'

export type TaskProject = Database['public']['Tables']['task_projects']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type TaskInsert = Database['public']['Tables']['tasks']['Insert']
export type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

// Priority is stored 0..3; these are the readable names the UI maps to.
export const TASK_PRIORITY = { none: 0, low: 1, medium: 2, high: 3 } as const

// ─── Projects (the coloured rail "lists") ───────────────────────────────────

export async function listTaskProjects(): Promise<TaskProject[]> {
  const { data, error } = await supabase
    .from('task_projects')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TaskProject[]
}

export async function createTaskProject(input: {
  orgId: string
  name: string
  color?: string
  position?: number
}): Promise<TaskProject> {
  const { data, error } = await supabase
    .from('task_projects')
    .insert({
      org_id: input.orgId,
      name: input.name,
      color: input.color,
      position: input.position,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as TaskProject
}

// ─── Tasks ──────────────────────────────────────────────────────────────────
//
// RLS already scopes reads to the caller's org and drops trashed rows
// (deleted_at set), so callers never filter those themselves.

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Task[]
}

export async function createTask(input: TaskInsert): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(input)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Task
}

export async function updateTask(id: string, patch: TaskUpdate): Promise<void> {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

// Set status and keep completed_at in sync — stamped on done, cleared otherwise.
export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  await updateTask(id, {
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  })
}

// Convenience toggle for the list-view checkbox.
export async function setTaskDone(id: string, done: boolean): Promise<void> {
  await setTaskStatus(id, done ? 'done' : 'todo')
}

// Soft-delete (the Flodok spine). A restore-from-trash RPC lands in Phase 6.
export async function softDeleteTask(id: string): Promise<void> {
  await updateTask(id, { deleted_at: new Date().toISOString() })
}

// ─── Portal (employee, token-scoped) ────────────────────────────────────────
//
// The portal is public/token-based: employees have no login and reach it via a
// slug + access_token pair. These call SECURITY DEFINER RPCs that self-filter to
// the token-holder's own visible, non-deleted tasks. The typed client doesn't
// know these functions (not in database.ts), so we cast — matching Portal.tsx.

export interface PortalTask {
  id: string
  title: string
  notes: string | null
  status: string
  priority: number
  due_date: string | null
  due_time: string | null
  url: string | null
  project_name: string | null
  project_color: string | null
}

type PortalListTasksRpc = (fn: 'portal_list_tasks', args: { emp_slug: string; emp_token: string })
  => Promise<{ data: PortalTask[] | null; error: { message: string } | null }>
type PortalSetTaskStatusRpc = (fn: 'portal_set_task_status', args: { emp_slug: string; emp_token: string; p_task_id: string; p_status: string })
  => Promise<{ data: unknown; error: { message: string } | null }>

export async function listPortalTasks(slug: string, token: string): Promise<PortalTask[]> {
  const { data, error } = await (supabase.rpc as unknown as PortalListTasksRpc)('portal_list_tasks', { emp_slug: slug, emp_token: token })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function setPortalTaskStatus(slug: string, token: string, taskId: string, status: TaskStatus): Promise<void> {
  const { error } = await (supabase.rpc as unknown as PortalSetTaskStatusRpc)('portal_set_task_status', { emp_slug: slug, emp_token: token, p_task_id: taskId, p_status: status })
  if (error) throw new Error(error.message)
}

// ─── Linkable documents (for the detail panel's "Linked document" picker) ────

export interface LinkableDoc {
  type: DocumentType
  id: string
  title: string
}

// The org's active documents a task can point at. job_descriptions has no
// deleted_at column; contracts/letters exclude templates (is_template).
export async function listLinkableDocuments(orgId: string): Promise<LinkableDoc[]> {
  const [sops, contracts, ndas, letters, jds] = await Promise.all([
    supabase.from('sops').select('id, title').eq('org_id', orgId).is('deleted_at', null),
    supabase.from('contracts').select('id, title').eq('org_id', orgId).eq('is_template', false).is('deleted_at', null),
    supabase.from('ndas').select('id, title').eq('org_id', orgId).is('deleted_at', null),
    supabase.from('letters').select('id, title').eq('org_id', orgId).eq('is_template', false).is('deleted_at', null),
    supabase.from('job_descriptions').select('id, title').eq('org_id', orgId),
  ])
  const out: LinkableDoc[] = []
  const push = (type: DocumentType, rows: { id: string; title: string | null }[] | null) => {
    for (const r of rows ?? []) out.push({ type, id: r.id, title: r.title || '(untitled)' })
  }
  push('sop', sops.data)
  push('contract', contracts.data)
  push('nda', ndas.data)
  push('letter', letters.data)
  push('job_description', jds.data)
  return out.sort((a, b) => a.title.localeCompare(b.title))
}
