// Kanban board view — columns are task status, cards drag between and within
// columns. Native HTML5 drag-and-drop (no dependency): a card sets its id on
// dragstart; dropping on a column appends to it, dropping on a card inserts
// before that card. onDropTask(id, status, beforeId) lets the page compute the
// fractional position.

import { useState, type DragEvent } from 'react'
import type { Task } from '../../lib/tasks'
import type { Employee } from '../../types/aliases'
import type { EmpDeptShape } from '../../lib/employee'
import type { Translations } from '../../lib/translations'
import { fmtTime } from '../../lib/taskFormat'

type Emp = Employee & EmpDeptShape

const COLUMNS = [
  { status: 'todo', labelKey: 'tasksStatusTodo' },
  { status: 'in_progress', labelKey: 'tasksStatusInProgress' },
  { status: 'blocked', labelKey: 'tasksStatusBlocked' },
  { status: 'done', labelKey: 'tasksStatusDone' },
] as const

function initials(name: string): string {
  const p = name.trim().split(/\s+/)
  return (((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()) || '?'
}
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TaskBoard({ tasks, employees, t, today, onOpen, onDropTask }: {
  tasks: Task[]
  employees: Emp[]
  t: Translations
  today: string
  onOpen: (task: Task) => void
  onDropTask: (taskId: string, status: string, beforeId: string | null) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [overCard, setOverCard] = useState<string | null>(null)

  function reset() { setOverCol(null); setOverCard(null); setDragId(null) }

  function dropOnColumn(e: DragEvent, status: string) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId
    reset()
    if (id) onDropTask(id, status, null)
  }
  function dropOnCard(e: DragEvent, status: string, beforeId: string) {
    e.preventDefault()
    e.stopPropagation()
    const id = e.dataTransfer.getData('text/plain') || dragId
    reset()
    if (id && id !== beforeId) onDropTask(id, status, beforeId)
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-3">
      {COLUMNS.map(col => {
        const items = tasks.filter(x => x.status === col.status)
        const isOver = overCol === col.status
        return (
          <div
            key={col.status}
            className="flex w-72 shrink-0 flex-col rounded-xl border"
            style={{
              borderColor: isOver ? 'var(--color-primary)' : 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
            onDragOver={e => { e.preventDefault(); setOverCol(col.status); setOverCard(null) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
            onDrop={e => dropOnColumn(e, col.status)}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{t[col.labelKey]}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.map(task => {
                const emp = task.assignee_employee_id ? employees.find(e => e.id === task.assignee_employee_id) : null
                const urgent = task.due_date != null && task.due_date <= today
                const done = task.status === 'done'
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; setDragId(task.id) }}
                    onDragEnd={reset}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOverCard(task.id); setOverCol(null) }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCard(null) }}
                    onDrop={e => dropOnCard(e, col.status, task.id)}
                    onClick={() => onOpen(task)}
                    className="cursor-pointer rounded-lg border p-2.5 transition-colors"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      opacity: dragId === task.id ? 0.4 : 1,
                      boxShadow: overCard === task.id ? 'inset 0 2px 0 var(--color-primary)' : undefined,
                    }}
                  >
                    <div
                      className="mb-2 text-sm"
                      style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}
                    >
                      {task.title}
                    </div>
                    <div className="flex items-center gap-2">
                      {task.priority >= 2 && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: task.priority >= 3 ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                      )}
                      {task.due_date && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: urgent ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                            color: urgent ? 'var(--color-danger)' : 'var(--color-primary)',
                          }}
                        >
                          {task.due_date === today ? t.tasksSmartToday : fmtDate(task.due_date)}{task.due_time ? ` ${fmtTime(task.due_time)}` : ''}
                        </span>
                      )}
                      <span className="flex-1" />
                      {task.visible_in_portal && task.assignee_employee_id && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
                          <rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" />
                        </svg>
                      )}
                      {emp && (
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-medium"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}
                          title={emp.name}
                        >
                          {initials(emp.name)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {items.length === 0 && (
                <div
                  className="rounded-lg border border-dashed px-3 py-6 text-center text-xs"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
                >
                  —
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
