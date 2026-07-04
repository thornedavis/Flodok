// Employee-portal "Tasks" tab: the tasks assigned to this employee and flagged
// visible_in_portal. Tapping the circle flips done/undone; the kebab (⋯) opens a
// sheet to set any status (todo/in-progress/blocked/done), view details, or copy
// the task link; the header funnel filters by status + project. All writes go
// through the token-scoped SECURITY DEFINER RPCs (portal_set_task_status /
// portal_list_tasks) — nothing is read from auth-protected tables, and editing
// task content stays the dashboard's job (a Phase 2, opt-in feature).

import { useEffect, useState, type ReactNode } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { listPortalTasks, setPortalTaskStatus, type PortalTask, type TaskStatus } from '../../lib/tasks'
import { fmtTime, linkify } from '../../lib/taskFormat'

type ShowFilter = 'all' | 'active' | 'completed'
type SheetState = null | { kind: 'filter' } | { kind: 'actions'; id: string } | { kind: 'details'; id: string }

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

// The project a task belongs to, as a stable key (project_id once migration 204
// lands; falls back to the name so filtering still works before it's applied).
function projectKeyOf(task: PortalTask): string {
  return task.project_id ?? task.project_name ?? ''
}

export function TasksTab({ slug, token }: { slug: string | null; token: string | null }) {
  const { t, lang } = useLang()
  const [tasks, setTasks] = useState<PortalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState<ShowFilter>('active')
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<SheetState>(null)
  const [copied, setCopied] = useState(false)

  async function reload() {
    if (!slug || !token) return
    setLoading(true)
    try {
      setTasks(await listPortalTasks(slug, token))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug, token])
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(id)
  }, [copied])

  async function setStatus(task: PortalTask, status: TaskStatus) {
    if (!slug || !token) return
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, status } : x))
    try {
      await setPortalTaskStatus(slug, token, task.id, status)
    } catch {
      reload()
    }
  }

  function close() { setSheet(null); setCopied(false) }
  function toggleProject(key: string) {
    setProjectFilter(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  function clearFilter() { setShow('active'); setProjectFilter(new Set()) }
  function copyLink(url: string) {
    try { void navigator.clipboard?.writeText(url); setCopied(true) } catch { /* clipboard unavailable */ }
  }

  if (loading && tasks.length === 0) {
    return <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</div>
  }

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  // Projects present in this employee's tasks (for the filter checklist), with a
  // count of active tasks each; the empty-key bucket is "No project" (Inbox).
  const projectMap = new Map<string, { key: string; name: string; color: string; count: number }>()
  for (const task of tasks) {
    const key = projectKeyOf(task)
    const entry = projectMap.get(key) ?? { key, name: task.project_name ?? t.tasksPortalNoProject, color: task.project_color ?? 'var(--color-text-tertiary)', count: 0 }
    if (task.status !== 'done') entry.count++
    projectMap.set(key, entry)
  }
  const projects = [...projectMap.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.name.localeCompare(b.name)))

  const pool = projectFilter.size === 0 ? tasks : tasks.filter(x => projectFilter.has(projectKeyOf(x)))
  const active = pool.filter(x => x.status !== 'done')
  const done = pool.filter(x => x.status === 'done')

  // Active tasks grouped by due date — one header per date, undated last.
  const buckets = new Map<string, PortalTask[]>()
  for (const task of active) {
    const key = task.due_date ?? ''
    const arr = buckets.get(key)
    if (arr) arr.push(task)
    else buckets.set(key, [task])
  }
  const groups = [...buckets.keys()]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a < b ? -1 : 1))
    .map(key => ({
      key: key || 'none',
      label: key === '' ? t.tasksPortalNoDate
        : key === today ? t.tasksPortalToday
        : key === tomorrow ? t.calendarTomorrow
        : fmtDate(key, lang),
      urgent: key !== '' && key <= today,
      tasks: buckets.get(key)!.sort((a, b) => (a.due_time ?? '~').localeCompare(b.due_time ?? '~')),
    }))

  const showActive = show !== 'completed' && groups.length > 0
  const showDone = show !== 'active' && done.length > 0
  const isFiltered = show !== 'active' || projectFilter.size > 0
  const selected = sheet && 'id' in sheet ? tasks.find(x => x.id === sheet.id) ?? null : null

  return (
    <div className="space-y-4 px-1 py-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.tasksPortalTitle}</h2>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet({ kind: 'filter' })}
            className="relative rounded-lg p-1.5"
            style={{ color: isFiltered ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            aria-label={t.tasksPortalFilter}
          >
            <FilterIcon />
            {isFiltered && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />}
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.tasksPortalEmpty}
        </div>
      ) : !showActive && !showDone ? (
        <div className="rounded-lg border py-10 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.tasksPortalFilteredEmpty}
        </div>
      ) : (
        <div className="space-y-5">
          {showActive && groups.map(group => (
            <div key={group.key} className="space-y-2">
              <GroupHeader label={group.label} color={group.urgent ? 'var(--color-danger)' : 'var(--color-text-tertiary)'} />
              {group.tasks.map(task => (
                <TaskRow key={task.id} task={task} t={t}
                  onCircle={() => setStatus(task, task.status === 'done' ? 'todo' : 'done')}
                  onDetails={() => setSheet({ kind: 'details', id: task.id })}
                  onActions={() => setSheet({ kind: 'actions', id: task.id })} />
              ))}
            </div>
          ))}
          {showDone && (
            <div className="space-y-2">
              <GroupHeader label={t.tasksPortalCompleted} color="var(--color-text-tertiary)" />
              {done.map(task => (
                <TaskRow key={task.id} task={task} t={t}
                  onCircle={() => setStatus(task, 'todo')}
                  onDetails={() => setSheet({ kind: 'details', id: task.id })}
                  onActions={() => setSheet({ kind: 'actions', id: task.id })} />
              ))}
            </div>
          )}
        </div>
      )}

      {sheet?.kind === 'filter' && (
        <Sheet onClose={close}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.tasksPortalFilter}</h3>
            {isFiltered && (
              <button type="button" onClick={clearFilter} className="text-sm" style={{ color: 'var(--color-primary)' }}>{t.tasksPortalClear}</button>
            )}
          </div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksPortalShow}</div>
          <div className="mb-4 flex gap-1 rounded-xl p-1" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            {([['all', t.tasksPortalShowAll], ['active', t.tasksPortalShowActive], ['completed', t.tasksPortalCompleted]] as [ShowFilter, string][]).map(([value, label]) => {
              const on = show === value
              return (
                <button key={value} type="button" onClick={() => setShow(value)}
                  className="flex-1 rounded-lg py-1.5 text-center text-sm font-medium"
                  style={{ backgroundColor: on ? 'var(--color-primary)' : 'transparent', color: on ? '#fff' : 'var(--color-text-secondary)' }}>
                  {label}
                </button>
              )
            })}
          </div>
          {projects.length > 0 && (
            <>
              <div className="mb-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksPortalProjects}</div>
              <div className="mb-2">
                {projects.map(p => {
                  const on = projectFilter.has(p.key)
                  return (
                    <button key={p.key || 'none'} type="button" onClick={() => toggleProject(p.key)} className="flex w-full items-center gap-2.5 py-2 text-left">
                      <span style={{ color: on ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}><CheckboxIcon checked={on} /></span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--color-text)' }}>{p.name}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{p.count}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <button type="button" onClick={close} className="mt-2 w-full rounded-xl py-2.5 text-center text-sm font-semibold" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
            {t.tasksPortalDone}
          </button>
        </Sheet>
      )}

      {sheet?.kind === 'actions' && selected && (
        <Sheet onClose={close}>
          <div className="mb-2 truncate px-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{selected.title}</div>
          <div className="mb-1 px-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksStatusLabel}</div>
          {STATUSES.map(s => (
            <button key={s} type="button" onClick={() => { void setStatus(selected, s); close() }} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-sm" style={{ color: 'var(--color-text)' }}>
              <span style={{ color: statusColor(s) }}><StatusIcon status={s} size={20} /></span>
              <span className="flex-1">{statusLabel(s, t)}</span>
              {selected.status === s && <span style={{ color: 'var(--color-primary)' }}><CheckIcon /></span>}
            </button>
          ))}
          <div className="my-1.5 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <button type="button" onClick={() => setSheet({ kind: 'details', id: selected.id })} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-sm" style={{ color: 'var(--color-text)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}><InfoIcon /></span>
            <span>{t.tasksPortalDetails}</span>
          </button>
          {selected.url && (
            <button type="button" onClick={() => copyLink(selected.url!)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-sm" style={{ color: 'var(--color-text)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}><LinkIcon /></span>
              <span>{copied ? t.tasksPortalCopied : t.tasksPortalCopyLink}</span>
            </button>
          )}
        </Sheet>
      )}

      {sheet?.kind === 'details' && selected && (
        <Sheet onClose={close}>
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{selected.title}</h3>
            <button type="button" onClick={close} className="shrink-0 rounded-lg p-0.5" style={{ color: 'var(--color-text-tertiary)' }} aria-label={t.tasksPortalClose}><CloseIcon /></button>
          </div>
          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${statusColor(selected.status)} 14%, transparent)`, color: statusColor(selected.status) }}>
            {statusLabel(selected.status, t)}
          </span>
          <div className="mt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <DetailRow label={t.tasksPortalProjectLabel}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selected.project_color ?? 'var(--color-text-tertiary)' }} />
                {selected.project_name ?? t.tasksPortalNoProject}
              </span>
            </DetailRow>
            {selected.due_date && (
              <DetailRow label={t.tasksPortalDue}>
                <span style={{ color: selected.due_date <= today ? 'var(--color-danger)' : 'var(--color-text)' }}>
                  {dueLabel(selected, today, tomorrow, lang, t)}
                </span>
              </DetailRow>
            )}
            {selected.priority > 0 && <DetailRow label={t.tasksPriorityLabel}>{priorityLabel(selected.priority, t)}</DetailRow>}
            {selected.url && (
              <DetailRow label={t.tasksPortalLinkLabel}>
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all" style={{ color: 'var(--color-primary)' }}>
                  {selected.url}<ExternalLinkIcon />
                </a>
              </DetailRow>
            )}
            {selected.notes && (
              <div className="py-2.5 text-xs">
                <div className="mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksPortalNotesLabel}</div>
                <div className="leading-relaxed" style={{ color: 'var(--color-text)' }}>{linkify(selected.notes)}</div>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function GroupHeader({ label, color }: { label: string; color: string }) {
  return <div className="px-1 text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
}

function TaskRow({ task, t, onCircle, onDetails, onActions }: {
  task: PortalTask
  t: ReturnType<typeof useLang>['t']
  onCircle: () => void
  onDetails: () => void
  onActions: () => void
}) {
  const done = task.status === 'done'
  const midStatus = task.status === 'in_progress' || task.status === 'blocked'
  return (
    <div className="flex items-start gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <button type="button" onClick={onCircle} className="mt-0.5 shrink-0" style={{ color: statusColor(task.status) }} aria-label={task.title}>
        <StatusIcon status={task.status} size={22} />
      </button>
      <button type="button" onClick={onDetails} className="min-w-0 flex-1 text-left">
        <div className="text-sm font-medium" style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}>
          {task.title}
        </div>
        {task.notes && (
          <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {task.notes}
          </div>
        )}
        {(task.due_time || task.project_name || midStatus || task.url) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {task.due_time && <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{fmtTime(task.due_time)}</span>}
            {task.project_name && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.project_color ?? 'var(--color-text-tertiary)' }} />
                {task.project_name}
              </span>
            )}
            {midStatus && <StatusPill status={task.status} t={t} />}
            {task.url && <span className="inline-flex items-center" style={{ color: 'var(--color-text-tertiary)' }} aria-hidden="true"><LinkIcon size={12} /></span>}
          </div>
        )}
      </button>
      <button type="button" onClick={onActions} className="-mr-1 mt-0.5 shrink-0 rounded-lg p-1" style={{ color: 'var(--color-text-tertiary)' }} aria-label={t.tasksPortalTaskOptions}>
        <DotsIcon />
      </button>
    </div>
  )
}

function StatusPill({ status, t }: { status: string; t: ReturnType<typeof useLang>['t'] }) {
  const ip = status === 'in_progress'
  const c = ip ? 'var(--color-primary)' : 'var(--color-warning)'
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>
      {ip ? t.tasksStatusInProgress : t.tasksStatusBlocked}
    </span>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 text-xs">
      <span className="w-16 shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span className="min-w-0 flex-1" style={{ color: 'var(--color-text)' }}>{children}</span>
    </div>
  )
}

function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl border px-4 pb-6 pt-2"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full" style={{ backgroundColor: 'var(--color-border-strong)' }} />
        {children}
      </div>
    </div>
  )
}

function statusColor(status: string): string {
  switch (status) {
    case 'done': return 'var(--color-success)'
    case 'in_progress': return 'var(--color-primary)'
    case 'blocked': return 'var(--color-warning)'
    default: return 'var(--color-text-tertiary)'
  }
}

function statusLabel(status: string, t: ReturnType<typeof useLang>['t']): string {
  switch (status) {
    case 'done': return t.tasksStatusDone
    case 'in_progress': return t.tasksStatusInProgress
    case 'blocked': return t.tasksStatusBlocked
    default: return t.tasksStatusTodo
  }
}

function priorityLabel(priority: number, t: ReturnType<typeof useLang>['t']): string {
  switch (priority) {
    case 3: return t.tasksPriorityHigh
    case 2: return t.tasksPriorityMedium
    case 1: return t.tasksPriorityLow
    default: return t.tasksPriorityNone
  }
}

function dueLabel(task: PortalTask, today: string, tomorrow: string, lang: 'en' | 'id', t: ReturnType<typeof useLang>['t']): string {
  const d = task.due_date!
  const day = d === today ? t.tasksPortalToday : d === tomorrow ? t.calendarTomorrow : fmtDate(d, lang)
  return task.due_time ? `${day} · ${fmtTime(task.due_time)}` : day
}

function fmtDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' }).format(d)
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function StatusIcon({ status, size = 22 }: { status: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (status === 'done') return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
  if (status === 'in_progress') return <svg {...p}><circle cx="12" cy="12" r="9" strokeDasharray="3.3 3.3" /></svg>
  if (status === 'blocked') return <svg {...p}><circle cx="12" cy="12" r="9" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
  return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>
}

function DotsIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
}
function FilterIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
}
function InfoIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
}
function LinkIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
}
function ExternalLinkIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
}
function CloseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
}
function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
}
function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      {checked && <polyline points="8.5 12.2 11 14.7 15.5 9.8" />}
    </svg>
  )
}
