// Calendar view — month (planning lens) + week (execution lens), sharing one
// date navigator. Tasks sit on their due_date; dragging a chip to another day
// rewrites due_date (same "drop = one field" principle as the board). Date-less
// tasks live in the "unscheduled" tray — drag them onto a day to schedule, or
// drop a dated chip onto the tray to clear it. The hour-grid day view is a
// later phase (needs a due_at timestamp).

import { useMemo, useState, type DragEvent } from 'react'
import type { Task, TaskProject } from '../../lib/tasks'
import type { Translations } from '../../lib/translations'

function pad(n: number): string { return String(n).padStart(2, '0') }
function toISO(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function fromISO(s: string): Date { return new Date(`${s}T00:00:00`) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfWeekMon(d: Date): Date { return addDays(d, -((d.getDay() + 6) % 7)) }

const MON_REF = new Date(2024, 0, 1) // a Monday, for localised weekday names

export function TaskCalendar({ tasks, projects, t, lang, today, onOpen, onReschedule, onCreateOnDay }: {
  tasks: Task[]
  projects: TaskProject[]
  t: Translations
  lang: string
  today: string
  onOpen: (task: Task) => void
  onReschedule: (taskId: string, dueISO: string | null) => void
  onCreateOnDay: (iso: string) => void
}) {
  const [granularity, setGranularity] = useState<'week' | 'month'>(() => {
    if (typeof window === 'undefined') return 'month'
    return (window.localStorage.getItem('flodok:tasks:calGranularity') as 'week' | 'month') || 'month'
  })
  const [anchor, setAnchor] = useState<string>(today)
  const [overISO, setOverISO] = useState<string | null>(null)

  function setGran(g: 'week' | 'month') {
    setGranularity(g)
    if (typeof window !== 'undefined') window.localStorage.setItem('flodok:tasks:calGranularity', g)
  }

  const colorOf = useMemo(() => {
    const m = new Map(projects.map(p => [p.id, p.color]))
    return (id: string | null) => (id ? m.get(id) ?? 'var(--color-text-tertiary)' : 'var(--color-text-tertiary)')
  }, [projects])

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const tk of tasks) {
      if (!tk.due_date) continue
      const arr = m.get(tk.due_date) ?? []
      arr.push(tk)
      m.set(tk.due_date, arr)
    }
    return m
  }, [tasks])

  const unscheduled = useMemo(() => tasks.filter(x => !x.due_date), [tasks])

  const days = useMemo(() => {
    const a = fromISO(anchor)
    if (granularity === 'week') {
      const start = startOfWeekMon(a)
      return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    }
    const first = new Date(a.getFullYear(), a.getMonth(), 1)
    const last = new Date(a.getFullYear(), a.getMonth() + 1, 0)
    const out: Date[] = []
    for (let d = startOfWeekMon(first); d <= addDays(startOfWeekMon(last), 6); d = addDays(d, 1)) out.push(d)
    return out
  }, [granularity, anchor])

  const anchorDate = fromISO(anchor)
  function shift(dir: -1 | 1) {
    if (granularity === 'week') setAnchor(toISO(addDays(anchorDate, dir * 7)))
    else setAnchor(toISO(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1)))
  }

  const label = granularity === 'month'
    ? anchorDate.toLocaleDateString(lang, { month: 'long', year: 'numeric' })
    : `${startOfWeekMon(anchorDate).toLocaleDateString(lang, { day: 'numeric', month: 'short' })} – ${addDays(startOfWeekMon(anchorDate), 6).toLocaleDateString(lang, { day: 'numeric', month: 'short' })}`
  const weekdayNames = Array.from({ length: 7 }, (_, i) => addDays(MON_REF, i).toLocaleDateString(lang, { weekday: 'short' }))
  const curMonth = anchorDate.getMonth()

  function handleDrop(e: DragEvent, iso: string | null) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    setOverISO(null)
    if (id) onReschedule(id, iso)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Date navigator */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded-md p-1" style={{ color: 'var(--color-text-secondary)' }} aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="min-w-[128px] text-center text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
          <button type="button" onClick={() => shift(1)} className="rounded-md p-1" style={{ color: 'var(--color-text-secondary)' }} aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button type="button" onClick={() => setAnchor(today)} className="ml-1 rounded-md px-2 py-1 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>{t.tasksSmartToday}</button>
        </div>
        <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border)' }}>
          {(['week', 'month'] as const).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGran(g)}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={{ backgroundColor: granularity === g ? 'var(--color-bg-tertiary)' : 'transparent', color: granularity === g ? 'var(--color-text)' : 'var(--color-text-secondary)' }}
            >
              {g === 'week' ? t.tasksCalWeek : t.tasksCalMonth}
            </button>
          ))}
        </div>
      </div>

      {/* Unscheduled tray */}
      <div
        className="flex shrink-0 items-center gap-2 overflow-x-auto border-b px-4 py-1.5"
        style={{ borderColor: 'var(--color-border)', backgroundColor: overISO === '__tray__' ? 'var(--color-bg-tertiary)' : 'transparent' }}
        onDragOver={e => { e.preventDefault(); setOverISO('__tray__') }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverISO(null) }}
        onDrop={e => handleDrop(e, null)}
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.tasksUnscheduled} · {unscheduled.length}
        </span>
        {unscheduled.map(tk => <TaskChip key={tk.id} task={tk} color={colorOf(tk.project_id)} onOpen={onOpen} inline />)}
      </div>

      {granularity === 'month' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--color-border)' }}>
            {weekdayNames.map((w, i) => <div key={i} className="px-2 py-1.5 text-center text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map(d => {
              const iso = toISO(d)
              const items = byDate.get(iso) ?? []
              const isToday = iso === today
              const isOut = d.getMonth() !== curMonth
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div
                  key={iso}
                  className="min-h-[94px] border-b border-r p-1"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: overISO === iso ? 'var(--color-bg-tertiary)' : (isWeekend ? 'var(--color-bg-secondary)' : 'transparent') }}
                  onDragOver={e => { e.preventDefault(); setOverISO(iso) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverISO(null) }}
                  onDrop={e => handleDrop(e, iso)}
                  onClick={() => onCreateOnDay(iso)}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-medium"
                      style={isToday ? { backgroundColor: 'var(--color-primary)', color: '#fff' } : { color: isOut ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map(tk => <TaskChip key={tk.id} task={tk} color={colorOf(tk.project_id)} onOpen={onOpen} />)}
                    {items.length > 3 && <div className="px-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>+{items.length - 3}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-7">
          {days.map(d => {
            const iso = toISO(d)
            const items = byDate.get(iso) ?? []
            const isToday = iso === today
            const isWeekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <div
                key={iso}
                className="flex min-h-0 flex-col border-r"
                style={{ borderColor: 'var(--color-border)', backgroundColor: overISO === iso ? 'var(--color-bg-tertiary)' : (isWeekend ? 'var(--color-bg-secondary)' : 'transparent') }}
                onDragOver={e => { e.preventDefault(); setOverISO(iso) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverISO(null) }}
                onDrop={e => handleDrop(e, iso)}
                onClick={() => onCreateOnDay(iso)}
              >
                <div className="border-b px-2 py-2 text-center" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{weekdayNames[(d.getDay() + 6) % 7]}</div>
                  <div className="mt-0.5 flex justify-center">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium"
                      style={isToday ? { backgroundColor: 'var(--color-primary)', color: '#fff' } : { color: 'var(--color-text)' }}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
                  {items.map(tk => <TaskChip key={tk.id} task={tk} color={colorOf(tk.project_id)} onOpen={onOpen} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskChip({ task, color, onOpen, inline }: {
  task: Task
  color: string
  onOpen: (task: Task) => void
  inline?: boolean
}) {
  const done = task.status === 'done'
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={e => { e.stopPropagation(); onOpen(task) }}
      className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 ${inline ? 'max-w-[170px] shrink-0' : ''}`}
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span
        className="truncate text-[11px]"
        style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}
      >
        {task.title}
      </span>
    </div>
  )
}
