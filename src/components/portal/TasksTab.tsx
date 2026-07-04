// Employee-portal "Tasks" tab: the tasks assigned to this employee and flagged
// visible_in_portal. Complete-only — tapping the circle flips status via the
// token-scoped portal_set_task_status RPC (no create/edit here; that's the
// dashboard's job). RPC-only, so nothing is read from auth-protected tables.

import { useEffect, useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { listPortalTasks, setPortalTaskStatus, type PortalTask } from '../../lib/tasks'
import { fmtTime, linkify } from '../../lib/taskFormat'

export function TasksTab({ slug, token }: { slug: string | null; token: string | null }) {
  const { t, lang } = useLang()
  const [tasks, setTasks] = useState<PortalTask[]>([])
  const [loading, setLoading] = useState(true)

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

  async function toggle(task: PortalTask) {
    if (!slug || !token) return
    const next = task.status === 'done' ? 'todo' : 'done'
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, status: next } : x))
    try {
      await setPortalTaskStatus(slug, token, task.id, next)
    } catch {
      reload()
    }
  }

  if (loading && tasks.length === 0) {
    return <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</div>
  }

  const today = new Date().toISOString().slice(0, 10)
  const active = tasks.filter(x => x.status !== 'done')
  const done = tasks.filter(x => x.status === 'done')

  return (
    <div className="space-y-4 px-1 py-2">
      <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.tasksPortalTitle}</h2>
      {tasks.length === 0 ? (
        <div className="rounded-lg border py-10 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.tasksPortalEmpty}
        </div>
      ) : (
        <div className="space-y-2">
          {active.map(task => (
            <PortalTaskRow key={task.id} task={task} today={today} todayLabel={t.tasksPortalToday} lang={lang} onToggle={() => toggle(task)} />
          ))}
          {done.length > 0 && (
            <>
              <div className="pt-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksPortalCompleted}</div>
              {done.map(task => (
                <PortalTaskRow key={task.id} task={task} today={today} todayLabel={t.tasksPortalToday} lang={lang} onToggle={() => toggle(task)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function PortalTaskRow({ task, today, todayLabel, lang, onToggle }: {
  task: PortalTask
  today: string
  todayLabel: string
  lang: 'en' | 'id'
  onToggle: () => void
}) {
  const done = task.status === 'done'
  const urgent = task.due_date != null && task.due_date <= today
  return (
    <div className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <button type="button" onClick={onToggle} className="mt-0.5 shrink-0" style={{ color: done ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} aria-label={task.title}>
        {done ? <CheckCircle /> : <Circle />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}>
          {task.title}
        </div>
        {task.notes && <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{linkify(task.notes)}</div>}
        {(task.due_date || task.project_name || task.url) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {task.due_date && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: urgent ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                  color: urgent ? 'var(--color-danger)' : 'var(--color-primary)',
                }}
              >
                {task.due_date === today ? todayLabel : fmtDate(task.due_date, lang)}{task.due_time ? ` · ${fmtTime(task.due_time)}` : ''}
              </span>
            )}
            {task.project_name && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.project_color ?? 'var(--color-text-tertiary)' }} />
                {task.project_name}
              </span>
            )}
            {task.url && (
              <a href={task.url} target="_blank" rel="noopener noreferrer" title={task.url} className="inline-flex items-center" style={{ color: 'var(--color-primary)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function fmtDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' }).format(d)
}

function Circle() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /></svg>
}
function CheckCircle() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
}
