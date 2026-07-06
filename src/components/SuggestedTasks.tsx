import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { activeWorkforceEmployees } from '../lib/lifecycle'
import { listTaskProjects, type TaskProject } from '../lib/tasks'
import {
  listPendingTasks,
  acceptPendingTask,
  rejectPendingTask,
  type PendingTask,
} from '../lib/pendingTasks'
import type { User } from '../types/aliases'

type PersonLite = { id: string; name: string }

type Draft = {
  title: string
  notes: string
  due_date: string
  priority: number
  assignee: string // '' | `user:<id>` | `emp:<id>`
  project_id: string
}

const inputStyle = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

function initialAssignee(pt: PendingTask): string {
  if (pt.assignee_employee_id) return `emp:${pt.assignee_employee_id}`
  if (pt.assignee_user_id) return `user:${pt.assignee_user_id}`
  return ''
}

function draftFrom(pt: PendingTask): Draft {
  return {
    title: pt.title,
    notes: pt.notes ?? '',
    due_date: pt.due_date ?? '',
    priority: pt.priority ?? 2,
    assignee: initialAssignee(pt),
    project_id: '',
  }
}

/**
 * "Suggested tasks" — AI-extracted meeting action items awaiting review. Self-
 * contained (fetches its own pending_tasks + assignable people + projects), so
 * Pending.tsx only imports and renders it. Renders nothing when there's nothing
 * pending, so it's invisible for orgs without the Fireflies pipeline.
 */
export function SuggestedTasks({ user }: { user: User }) {
  const { t } = useLang()
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [employees, setEmployees] = useState<PersonLite[]>([])
  const [operators, setOperators] = useState<PersonLite[]>([])
  const [projects, setProjects] = useState<TaskProject[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [ptRes, empRes, usrRes, projRes] = await Promise.all([
      listPendingTasks(user.org_id),
      activeWorkforceEmployees(user.org_id, 'id, name'),
      supabase.from('users').select('id, name, employee_id').eq('org_id', user.org_id).order('name'),
      listTaskProjects(),
    ])
    setTasks(ptRes)
    setEmployees((empRes.data ?? []) as unknown as PersonLite[])
    // Operators = login users NOT linked to an employee (a linked person is
    // represented by their employee entry, so they aren't listed twice).
    setOperators(((usrRes.data ?? []) as { id: string; name: string; employee_id: string | null }[])
      .filter(u => !u.employee_id)
      .map(u => ({ id: u.id, name: u.name })))
    setProjects(projRes)
  }

  useEffect(() => { load() }, [user.org_id])

  function expand(pt: PendingTask) {
    setError(null)
    if (expandedId === pt.id) { setExpandedId(null); setDraft(null); return }
    setExpandedId(pt.id)
    setDraft(draftFrom(pt))
  }

  async function accept(pt: PendingTask) {
    if (!draft || !draft.title.trim()) { setError(t.suggestedTitleRequired); return }
    const [kind, id] = draft.assignee ? draft.assignee.split(':') : ['', '']
    setSaving(true)
    setError(null)
    try {
      await acceptPendingTask({
        pendingId: pt.id,
        title: draft.title,
        notes: draft.notes,
        dueDate: draft.due_date || null,
        priority: draft.priority,
        assigneeEmployeeId: kind === 'emp' ? id : null,
        assigneeUserId: kind === 'user' ? id : null,
        projectId: draft.project_id || null,
        // Portal-visible only for a human-confirmed employee assignee — never
        // expose a task to an employee off a fuzzy guess.
        visibleInPortal: kind === 'emp',
      })
      setExpandedId(null)
      setDraft(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function reject(pt: PendingTask) {
    setSaving(true)
    setError(null)
    try {
      await rejectPendingTask(pt.id, user.id)
      if (expandedId === pt.id) { setExpandedId(null); setDraft(null) }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (tasks.length === 0) return null

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.suggestedTasksTitle}</h2>
      <p className="mb-4 mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.suggestedTasksSubtitle}</p>

      <div className="space-y-3">
        {tasks.map(pt => {
          const isExpanded = expandedId === pt.id && draft
          return (
            <div
              key={pt.id}
              className="rounded-xl border"
              style={{ borderColor: isExpanded ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              <button
                type="button"
                onClick={() => expand(pt)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold" style={{ color: 'var(--color-text)' }}>{pt.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {pt.source_meeting && <span>{pt.source_meeting}</span>}
                    {pt.assignee_ambiguous ? (
                      <span style={{ color: 'var(--color-warning)' }}>{t.suggestedAmbiguous}</span>
                    ) : !pt.assignee_employee_id && !pt.assignee_user_id && pt.assignee_name ? (
                      <span>{t.suggestedNameHint(pt.assignee_name)}</span>
                    ) : null}
                  </div>
                </div>
                <svg
                  width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 transition-transform"
                  style={{ color: 'var(--color-text-tertiary)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isExpanded && draft && (
                <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.suggestedTitleLabel}</label>
                      <input
                        value={draft.title}
                        onChange={e => setDraft({ ...draft, title: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.suggestedNotesLabel}</label>
                      <textarea
                        value={draft.notes}
                        onChange={e => setDraft({ ...draft, notes: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksAssigneeLabel}</label>
                      <select
                        value={draft.assignee}
                        onChange={e => setDraft({ ...draft, assignee: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="">{t.tasksUnassigned}</option>
                        {operators.length > 0 && (
                          <optgroup label={t.suggestedTeamGroup}>
                            {operators.map(o => (
                              <option key={o.id} value={`user:${o.id}`}>{o.name}{o.id === user.id ? t.suggestedMeSuffix : ''}</option>
                            ))}
                          </optgroup>
                        )}
                        {employees.length > 0 && (
                          <optgroup label={t.suggestedEmployeesGroup}>
                            {employees.map(e => (
                              <option key={e.id} value={`emp:${e.id}`}>{e.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.suggestedDueLabel}</label>
                      <input
                        type="date"
                        value={draft.due_date}
                        onChange={e => setDraft({ ...draft, due_date: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksProjectLabel}</label>
                      <select
                        value={draft.project_id}
                        onChange={e => setDraft({ ...draft, project_id: e.target.value })}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="">{t.tasksNoProject}</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksPriorityLabel}</label>
                      <select
                        value={draft.priority}
                        onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value={0}>{t.tasksPriorityNone}</option>
                        <option value={1}>{t.tasksPriorityLow}</option>
                        <option value={2}>{t.tasksPriorityMedium}</option>
                        <option value={3}>{t.tasksPriorityHigh}</option>
                      </select>
                    </div>
                  </div>

                  {error && (
                    <p className="mt-3 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => accept(pt)}
                      disabled={saving}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-success)' }}
                    >
                      {t.suggestedAddToTasks}
                    </button>
                    <button
                      onClick={() => reject(pt)}
                      disabled={saving}
                      className="rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      {t.reject}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
