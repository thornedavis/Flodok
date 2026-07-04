// Tasks — dashboard (Phases 2–3).
//
// One flat task list rendered through saved-view lenses: the left rail is the
// grouping (smart lists + projects); the centre is either a checkable List or a
// drag-between-columns Board of the active scope; a right-docked detail panel
// handles create/edit. Calendar + the shared date navigator + the portal tab
// land in later phases.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { useFullWidthLayout } from '../../components/Layout'
import { Modal } from '../../components/Modal'
import { FilterSearchInput } from '../../components/FilterControls'
import { TaskBoard } from '../../components/tasks/TaskBoard'
import { TaskDetailPanel, type TaskPatch } from '../../components/tasks/TaskDetailPanel'
import { TaskCalendar } from '../../components/tasks/TaskCalendar'
import { activeWorkforceEmployees } from '../../lib/lifecycle'
import type { EmpDeptShape } from '../../lib/employee'
import {
  listTaskProjects, listTasks, createTask, updateTask, createTaskProject,
  setTaskDone, listLinkableDocuments,
  type Task, type TaskProject, type LinkableDoc,
} from '../../lib/tasks'
import { trashTask } from '../../lib/trash'
import { fmtTime } from '../../lib/taskFormat'
import type { Employee, User } from '../../types/aliases'

type EmployeeWithDepartments = Employee & EmpDeptShape

const PROJECT_COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#7F77DD', '#D4537E', '#BA7517', '#888780']

type Scope =
  | { kind: 'all' } | { kind: 'today' } | { kind: 'scheduled' }
  | { kind: 'flagged' } | { kind: 'completed' } | { kind: 'inbox' }
  | { kind: 'project'; id: string }

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()) || '?'
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Tasks({ user }: { user: User }) {
  useFullWidthLayout()
  const { t, lang } = useLang()

  const [projects, setProjects] = useState<TaskProject[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [employees, setEmployees] = useState<EmployeeWithDepartments[]>([])
  const [linkableDocs, setLinkableDocs] = useState<LinkableDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [scope, setScope] = useState<Scope>({ kind: 'all' })
  const [search, setSearch] = useState('')
  const [quickAdd, setQuickAdd] = useState('')
  const [dragRow, setDragRow] = useState<string | null>(null)
  const [overRow, setOverRow] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'board' | 'calendar'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (window.localStorage.getItem('flodok:tasks:view') as 'list' | 'board' | 'calendar') || 'list'
  })

  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create')
  const [selected, setSelected] = useState<Task | null>(null)
  const [createDefaults, setCreateDefaults] = useState<{ project_id: string | null; due_date: string }>({ project_id: null, due_date: '' })
  const [saving, setSaving] = useState(false)

  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projName, setProjName] = useState('')
  const [projColor, setProjColor] = useState(PROJECT_COLORS[0])

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { void load() }, [user.org_id])
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem('flodok:tasks:view', view) }, [view])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [proj, tsk, empRes, docs] = await Promise.all([
        listTaskProjects(),
        listTasks(),
        activeWorkforceEmployees(user.org_id),
        listLinkableDocuments(user.org_id),
      ])
      setProjects(proj)
      setTasks(tsk)
      setEmployees((empRes.data ?? []) as unknown as EmployeeWithDepartments[])
      setLinkableDocs(docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.tasksLoadError)
    } finally {
      setLoading(false)
    }
  }

  const counts = useMemo(() => {
    const active = tasks.filter(x => x.status !== 'done')
    return {
      all: active.length,
      today: active.filter(x => x.due_date != null && x.due_date <= today).length,
      scheduled: active.filter(x => x.due_date != null).length,
      flagged: active.filter(x => x.priority >= 3).length,
      completed: tasks.filter(x => x.status === 'done').length,
      inbox: active.filter(x => x.project_id == null).length,
      project: (id: string) => active.filter(x => x.project_id === id).length,
    }
  }, [tasks, today])

  // Structural filter for the active scope (project / smart list), ignoring
  // status — shared by List and Board. List additionally hides done tasks
  // (except in the Completed scope); Board keeps every status for its columns.
  const scopedByStructure = useMemo(() => {
    let list = tasks
    switch (scope.kind) {
      case 'inbox': list = list.filter(x => x.project_id == null); break
      case 'project': list = list.filter(x => x.project_id === scope.id); break
      case 'flagged': list = list.filter(x => x.priority >= 3); break
      case 'today': list = list.filter(x => x.due_date != null && x.due_date <= today); break
      case 'scheduled': list = list.filter(x => x.due_date != null); break
      default: break
    }
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(x => x.title.toLowerCase().includes(q) || (x.notes ?? '').toLowerCase().includes(q))
    return list
  }, [tasks, scope, search, today])

  const listTasksInScope = useMemo(() => {
    if (scope.kind === 'completed') return scopedByStructure.filter(x => x.status === 'done')
    return scopedByStructure.filter(x => x.status !== 'done')
  }, [scopedByStructure, scope])

  function scopeTitle(): string {
    switch (scope.kind) {
      case 'today': return t.tasksSmartToday
      case 'scheduled': return t.tasksSmartScheduled
      case 'flagged': return t.tasksSmartFlagged
      case 'completed': return t.tasksSmartCompleted
      case 'inbox': return t.tasksInbox
      case 'project': return projects.find(p => p.id === scope.id)?.name ?? t.tasksTitle
      default: return t.tasksAllTasks
    }
  }

  async function toggleDone(task: Task) {
    const done = task.status === 'done'
    setTasks(prev => prev.map(x => x.id === task.id
      ? { ...x, status: done ? 'todo' : 'done', completed_at: done ? null : new Date().toISOString() }
      : x))
    try {
      await setTaskDone(task.id, !done)
    } catch {
      await load()
    }
  }

  // Board drop: place taskId in `status`, before `beforeId` (or at the end when
  // null). Fractional position between neighbours so one row is rewritten.
  async function placeTask(taskId: string, status: string, beforeId: string | null) {
    const task = tasks.find(x => x.id === taskId)
    if (!task) return
    const col = tasks
      .filter(x => x.status === status && x.id !== taskId)
      .sort((a, b) => (Number(a.position) - Number(b.position)) || (a.created_at < b.created_at ? -1 : 1))
    let position: number
    if (!beforeId) {
      position = col.length ? Number(col[col.length - 1].position) + 1 : 0
    } else {
      const idx = col.findIndex(x => x.id === beforeId)
      if (idx <= 0) position = col.length ? Number(col[0].position) - 1 : 0
      else position = (Number(col[idx - 1].position) + Number(col[idx].position)) / 2
    }
    if (task.status === status && Number(task.position) === position) return
    const completed_at = status === 'done' ? (task.completed_at ?? new Date().toISOString()) : null
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status, position, completed_at } : x))
    try {
      await updateTask(taskId, { status, position, completed_at })
    } catch {
      await load()
    }
  }

  // List drop: reorder within the current list view (position only, no status
  // change), inserting the dragged task before `beforeId`.
  async function listReorder(taskId: string, beforeId: string) {
    if (taskId === beforeId) return
    const order = listTasksInScope.filter(x => x.id !== taskId)
    const idx = order.findIndex(x => x.id === beforeId)
    let position: number
    if (idx <= 0) position = order.length ? Number(order[0].position) - 1 : 0
    else position = (Number(order[idx - 1].position) + Number(order[idx].position)) / 2
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, position } : x))
    try {
      await updateTask(taskId, { position })
    } catch {
      await load()
    }
  }

  async function reschedule(taskId: string, dueISO: string | null) {
    const task = tasks.find(x => x.id === taskId)
    if (!task || (task.due_date ?? null) === dueISO) return
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, due_date: dueISO } : x))
    try {
      await updateTask(taskId, { due_date: dueISO })
    } catch {
      await load()
    }
  }

  async function addQuick() {
    const title = quickAdd.trim()
    if (!title) return
    setQuickAdd('')
    try {
      await createTask({
        org_id: user.org_id,
        created_by: user.id,
        title,
        project_id: scope.kind === 'project' ? scope.id : null,
        due_date: scope.kind === 'today' ? today : null,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.tasksLoadError)
    }
  }

  function openCreate(dueISO?: string) {
    setPanelMode('create')
    setSelected(null)
    setCreateDefaults({
      project_id: scope.kind === 'project' ? scope.id : null,
      due_date: dueISO ?? (scope.kind === 'today' ? today : ''),
    })
    setPanelOpen(true)
  }

  function openEdit(task: Task) {
    setPanelMode('edit')
    setSelected(task)
    setPanelOpen(true)
  }

  async function submitTask(patch: TaskPatch) {
    setSaving(true)
    const completed_at = patch.status === 'done' ? (selected?.completed_at ?? new Date().toISOString()) : null
    try {
      if (panelMode === 'edit' && selected) {
        await updateTask(selected.id, { ...patch, completed_at })
      } else {
        await createTask({ org_id: user.org_id, created_by: user.id, ...patch, completed_at })
      }
      setPanelOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.tasksLoadError)
    } finally {
      setSaving(false)
    }
  }

  async function deleteTask() {
    if (!selected) return
    try {
      await trashTask(selected.id)
      setPanelOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.tasksLoadError)
    }
  }

  async function saveProject() {
    const name = projName.trim()
    if (!name) return
    try {
      const created = await createTaskProject({ orgId: user.org_id, name, color: projColor, position: projects.length })
      setShowProjectModal(false)
      setProjName('')
      setProjColor(PROJECT_COLORS[0])
      await load()
      setScope({ kind: 'project', id: created.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.tasksLoadError)
    }
  }

  const headerCount = view === 'board' ? scopedByStructure.length : listTasksInScope.length

  return (
    <div className="flex" style={{ height: 'calc(100vh - 56px)', backgroundColor: 'var(--color-bg)' }}>
      {/* Rail — smart lists + projects */}
      <aside
        className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r md:flex"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="space-y-0.5 p-3">
          <NavRow active={scope.kind === 'today'} onClick={() => setScope({ kind: 'today' })} count={counts.today} label={t.tasksSmartToday} icon={<IconCalendar />} />
          <NavRow active={scope.kind === 'scheduled'} onClick={() => setScope({ kind: 'scheduled' })} count={counts.scheduled} label={t.tasksSmartScheduled} icon={<IconClock />} />
          <NavRow active={scope.kind === 'flagged'} onClick={() => setScope({ kind: 'flagged' })} count={counts.flagged} label={t.tasksSmartFlagged} icon={<IconFlag />} />
          <NavRow active={scope.kind === 'all'} onClick={() => setScope({ kind: 'all' })} count={counts.all} label={t.tasksAllTasks} icon={<IconList />} />
          <NavRow active={scope.kind === 'inbox'} onClick={() => setScope({ kind: 'inbox' })} count={counts.inbox} label={t.tasksInbox} icon={<IconInbox />} />
          <NavRow active={scope.kind === 'completed'} onClick={() => setScope({ kind: 'completed' })} count={counts.completed} label={t.tasksSmartCompleted} icon={<IconCheckCircle />} />
        </div>

        <div className="mt-1 border-t px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksProjects}</span>
            <button type="button" onClick={() => setShowProjectModal(true)} className="rounded p-0.5" style={{ color: 'var(--color-text-tertiary)' }} title={t.tasksNewProject} aria-label={t.tasksNewProject}>
              <IconPlus size={15} />
            </button>
          </div>
          <div className="space-y-0.5">
            {projects.map(p => (
              <NavRow
                key={p.id}
                active={scope.kind === 'project' && scope.id === p.id}
                onClick={() => setScope({ kind: 'project', id: p.id })}
                count={counts.project(p.id)}
                label={p.name}
                icon={<span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />}
              />
            ))}
            {projects.length === 0 && (
              <button type="button" onClick={() => setShowProjectModal(true)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                <IconPlus size={16} />
                <span>{t.tasksNewProject}</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{scopeTitle()}</h1>
              <span className="text-sm tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{headerCount}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border)' }}>
                {(['list', 'board', 'calendar'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: view === v ? 'var(--color-bg-tertiary)' : 'transparent',
                      color: view === v ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {v === 'list' ? t.tasksViewList : v === 'board' ? t.tasksViewBoard : t.tasksViewCalendar}
                  </button>
                ))}
              </div>
              <FilterSearchInput value={search} onChange={setSearch} placeholder={t.tasksSearchPlaceholder} className="hidden w-52 sm:block" />
              <button type="button" onClick={() => openCreate()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                <IconPlus size={15} />
                <span>{t.tasksNewTask}</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        {view === 'board' ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <p className="px-6 py-6 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</p>
            ) : (
              <TaskBoard tasks={scopedByStructure} employees={employees} t={t} today={today} onOpen={openEdit} onDropTask={placeTask} />
            )}
          </div>
        ) : view === 'calendar' ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <p className="px-6 py-6 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</p>
            ) : (
              <TaskCalendar tasks={scopedByStructure} projects={projects} t={t} lang={lang} today={today} onOpen={openEdit} onReschedule={reschedule} onCreateOnDay={iso => openCreate(iso)} />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {scope.kind !== 'completed' && (
              <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                <span style={{ color: 'var(--color-text-tertiary)' }}><IconPlus size={18} /></span>
                <input
                  value={quickAdd}
                  onChange={e => setQuickAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void addQuick() }}
                  placeholder={t.tasksAddTask}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--color-text)' }}
                />
              </div>
            )}

            {loading ? (
              <p className="px-2 py-6 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</p>
            ) : listTasksInScope.length === 0 ? (
              <div className="px-2 py-10 text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksEmpty}</p>
                {scope.kind !== 'completed' && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksEmptyHint}</p>}
              </div>
            ) : (
              <ul>
                {listTasksInScope.map(task => {
                  const done = task.status === 'done'
                  const emp = task.assignee_employee_id ? employees.find(e => e.id === task.assignee_employee_id) : null
                  const urgent = task.due_date != null && task.due_date <= today
                  return (
                    <li key={task.id}>
                      <div
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; setDragRow(task.id) }}
                        onDragEnd={() => { setDragRow(null); setOverRow(null) }}
                        onDragOver={e => { e.preventDefault(); setOverRow(task.id) }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverRow(null) }}
                        onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setOverRow(null); setDragRow(null); if (id) void listReorder(id, task.id) }}
                        onClick={() => openEdit(task)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors"
                        style={{ opacity: dragRow === task.id ? 0.4 : 1, boxShadow: overRow === task.id ? 'inset 0 2px 0 var(--color-primary)' : undefined }}
                        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); void toggleDone(task) }}
                          className="shrink-0"
                          style={{ color: done ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
                          aria-label={done ? t.tasksStatusDone : t.tasksStatusTodo}
                        >
                          {done ? <IconCheckCircle /> : <IconCircle />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm" style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}>
                            {task.title}
                          </div>
                          {task.notes && <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{task.notes}</div>}
                        </div>

                        {task.priority >= 2 && (
                          <span className="shrink-0" style={{ color: task.priority >= 3 ? 'var(--color-danger)' : 'var(--color-warning)' }}><IconFlag /></span>
                        )}

                        {task.due_date && (
                          <span
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: urgent ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                              color: urgent ? 'var(--color-danger)' : 'var(--color-primary)',
                            }}
                          >
                            {task.due_date === today ? t.tasksSmartToday : fmtDate(task.due_date)}{task.due_time ? ` · ${fmtTime(task.due_time)}` : ''}
                          </span>
                        )}

                        {task.url && (
                          <a href={task.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} title={task.url}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                          </a>
                        )}

                        {task.related_doc_id && (
                          <span className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} title={t.tasksLinkedDoc}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                          </span>
                        )}
                        {task.visible_in_portal && task.assignee_employee_id && (
                          <span className="shrink-0" style={{ color: 'var(--color-primary)' }} title={t.tasksVisibleInPortal}><IconPhone /></span>
                        )}

                        {emp && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }} title={emp.name}>
                            {initials(emp.name)}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <TaskDetailPanel
        open={panelOpen}
        mode={panelMode}
        task={selected}
        defaults={createDefaults}
        projects={projects}
        employees={employees}
        linkableDocs={linkableDocs}
        t={t}
        saving={saving}
        onClose={() => setPanelOpen(false)}
        onSubmit={submitTask}
        onDelete={deleteTask}
      />

      <Modal open={showProjectModal} onClose={() => setShowProjectModal(false)} title={t.tasksNewProject}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksProjectName}</label>
            <input
              value={projName}
              onChange={e => setProjName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void saveProject() }}
              autoFocus
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksColor}</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setProjColor(c)} className="h-7 w-7 rounded-full" style={{ backgroundColor: c, outline: projColor === c ? '2px solid var(--color-text)' : 'none', outlineOffset: '2px' }} aria-label={c} />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowProjectModal(false)} className="rounded-lg border px-3 py-2 text-sm font-medium" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.tasksCancel}</button>
            <button type="button" onClick={() => void saveProject()} disabled={!projName.trim()} className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>{t.tasksCreateProject}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Rail row ───────────────────────────────────────────────────────────────

function NavRow({ active, onClick, icon, label, count }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors"
      style={{
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
      }}
      onMouseOver={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span className="flex w-4 shrink-0 justify-center" style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count != null && count > 0 && <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{count}</span>}
    </button>
  )
}

// ─── Icons (lucide-style, match the app's inline-SVG convention) ─────────────

const S = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconCircle() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /></svg>
}
function IconCheckCircle() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
}
function IconCalendar() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
}
function IconClock() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
}
function IconFlag() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...S}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
}
function IconList() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
}
function IconInbox() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...S}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
}
function IconPhone() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...S}><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>
}
function IconPlus({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...S}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
