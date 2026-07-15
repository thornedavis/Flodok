// Right-docked detail panel — the slide-over that opens when you click a task
// (or "New task"). Replaces the centred modal so the list/board stays visible
// beside it. Owns its own draft; hands a completed patch back via onSubmit.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmployeeSelect } from '../EmployeeSelect'
import { DatePicker } from '../DatePicker'
import { DOCUMENT_TYPES, documentEditPath, type DocumentType } from '../../lib/documentTypes'
import { extractUrls } from '../../lib/taskFormat'
import type { Task, TaskProject, TaskStatus, LinkableDoc } from '../../lib/tasks'
import type { DepartmentOption } from '../../lib/departments'
import type { Employee } from '../../types/aliases'
import type { EmpDeptShape } from '../../lib/employee'
import type { Translations } from '../../lib/translations'

type Emp = Employee & EmpDeptShape

export interface TaskPatch {
  title: string
  notes: string | null
  project_id: string | null
  department_id: string | null
  assignee_employee_id: string | null
  due_date: string | null
  due_time: string | null
  url: string | null
  priority: number
  status: TaskStatus
  visible_in_portal: boolean
  related_doc_type: string | null
  related_doc_id: string | null
}

interface Draft {
  title: string
  notes: string
  project_id: string | null
  department_id: string | null
  assignee_employee_id: string | null
  due_date: string
  due_time: string
  url: string
  priority: number
  status: TaskStatus
  visible_in_portal: boolean
  related_doc_type: DocumentType | null
  related_doc_id: string | null
}

function blank(defaults: { project_id: string | null; department_id: string | null; due_date: string }): Draft {
  return {
    title: '', notes: '', project_id: defaults.project_id, department_id: defaults.department_id, assignee_employee_id: null,
    due_date: defaults.due_date, due_time: '', url: '', priority: 0, status: 'todo', visible_in_portal: true,
    related_doc_type: null, related_doc_id: null,
  }
}

function docTypeLabel(type: DocumentType, t: Translations): string {
  return type === 'sop' ? t.documentsAllTypeBadgeSop
    : type === 'contract' ? t.documentsAllTypeBadgeContract
    : type === 'nda' ? t.documentsAllTypeBadgeNda
    : type === 'letter' ? t.documentsAllTypeBadgeLetter
    : t.documentsAllTypeBadgeJobDescription
}

export function TaskDetailPanel({
  open, mode, task, defaults, projects, departments, employees, linkableDocs, t, saving, onClose, onSubmit, onDelete,
}: {
  open: boolean
  mode: 'create' | 'edit'
  task: Task | null
  defaults: { project_id: string | null; department_id: string | null; due_date: string }
  projects: TaskProject[]
  departments: DepartmentOption[]
  employees: Emp[]
  linkableDocs: LinkableDoc[]
  t: Translations
  saving: boolean
  onClose: () => void
  onSubmit: (patch: TaskPatch) => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(() => blank(defaults))

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && task) {
      setD({
        title: task.title,
        notes: task.notes ?? '',
        project_id: task.project_id,
        department_id: task.department_id,
        assignee_employee_id: task.assignee_employee_id,
        due_date: task.due_date ?? '',
        due_time: task.due_time ?? '',
        url: task.url ?? '',
        priority: task.priority,
        status: task.status as TaskStatus,
        visible_in_portal: task.visible_in_portal,
        related_doc_type: (task.related_doc_type as DocumentType | null),
        related_doc_id: task.related_doc_id,
      })
    } else {
      setD(blank(defaults))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, task])

  function submit() {
    if (!d.title.trim()) return
    onSubmit({
      title: d.title.trim(),
      notes: d.notes.trim() || null,
      project_id: d.project_id,
      department_id: d.department_id,
      assignee_employee_id: d.assignee_employee_id,
      due_date: d.due_date || null,
      due_time: d.due_date ? (d.due_time || null) : null,
      url: d.url.trim() || null,
      priority: d.priority,
      status: d.status,
      visible_in_portal: d.visible_in_portal,
      related_doc_type: d.related_doc_type,
      related_doc_id: d.related_doc_id,
    })
  }

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }
  const notesUrls = extractUrls(d.notes)

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className="fixed right-0 z-50 flex w-[380px] max-w-full flex-col border-l shadow-lg transition-transform"
        style={{
          top: '56px',
          height: 'calc(100vh - 56px)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{mode === 'edit' ? t.tasksEditTask : t.tasksNewTask}</h2>
          <button type="button" onClick={onClose} aria-label={t.tasksCancel} style={{ color: 'var(--color-text-tertiary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksTitleLabel}</label>
            <input
              value={d.title}
              onChange={e => setD({ ...d, title: e.target.value })}
              placeholder={t.tasksTitlePlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksNotesLabel}</label>
            <textarea
              value={d.notes}
              onChange={e => setD({ ...d, notes: e.target.value })}
              placeholder={t.tasksNotesPlaceholder}
              rows={3}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            {notesUrls.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {notesUrls.map((u, i) => (
                  <a
                    key={i}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block max-w-[220px] truncate rounded-md border px-1.5 py-0.5 text-[11px]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
                  >
                    {u}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksUrlLabel}</label>
            <input
              type="url"
              value={d.url}
              onChange={e => setD({ ...d, url: e.target.value })}
              placeholder={t.tasksUrlPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
            {d.url.trim() && /^https?:\/\//.test(d.url.trim()) && (
              <a href={d.url.trim()} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium" style={{ color: 'var(--color-primary)' }}>{t.tasksOpenDoc} →</a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksProjectLabel}</label>
              <select
                value={d.project_id ?? ''}
                onChange={e => setD({ ...d, project_id: e.target.value || null })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="">{t.tasksNoProject}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksDueDateLabel}</label>
              <DatePicker value={d.due_date} onChange={v => setD({ ...d, due_date: v, due_time: v ? d.due_time : '' })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksDepartmentLabel}</label>
            <select
              value={d.department_id ?? ''}
              onChange={e => setD({ ...d, department_id: e.target.value || null })}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              <option value="">{t.tasksNoDepartment}</option>
              {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
            </select>
          </div>

          {d.due_date && (
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksTimeLabel}</label>
              <input
                type="time"
                value={d.due_time}
                onChange={e => setD({ ...d, due_time: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksAssigneeLabel}</label>
            <EmployeeSelect
              value={d.assignee_employee_id}
              onChange={id => setD({ ...d, assignee_employee_id: id })}
              employees={employees}
              emptyLabel={t.tasksUnassigned}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksLinkedDoc}</label>
            <select
              value={d.related_doc_id && d.related_doc_type ? `${d.related_doc_type}:${d.related_doc_id}` : ''}
              onChange={e => {
                const v = e.target.value
                if (!v) { setD({ ...d, related_doc_type: null, related_doc_id: null }); return }
                const sep = v.indexOf(':')
                setD({ ...d, related_doc_type: v.slice(0, sep) as DocumentType, related_doc_id: v.slice(sep + 1) })
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              <option value="">{t.tasksNoDoc}</option>
              {DOCUMENT_TYPES.map(ty => {
                const docs = linkableDocs.filter(x => x.type === ty)
                if (docs.length === 0) return null
                return (
                  <optgroup key={ty} label={docTypeLabel(ty, t)}>
                    {docs.map(dc => <option key={dc.id} value={`${ty}:${dc.id}`}>{dc.title}</option>)}
                  </optgroup>
                )
              })}
            </select>
            {d.related_doc_id && d.related_doc_type && (
              <button
                type="button"
                onClick={() => navigate(documentEditPath(d.related_doc_type!, d.related_doc_id!))}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                {t.tasksOpenDoc} →
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksPriorityLabel}</label>
              <select
                value={d.priority}
                onChange={e => setD({ ...d, priority: Number(e.target.value) })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value={0}>{t.tasksPriorityNone}</option>
                <option value={1}>{t.tasksPriorityLow}</option>
                <option value={2}>{t.tasksPriorityMedium}</option>
                <option value={3}>{t.tasksPriorityHigh}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tasksStatusLabel}</label>
              <select
                value={d.status}
                onChange={e => setD({ ...d, status: e.target.value as TaskStatus })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              >
                <option value="todo">{t.tasksStatusTodo}</option>
                <option value="in_progress">{t.tasksStatusInProgress}</option>
                <option value="blocked">{t.tasksStatusBlocked}</option>
                <option value="done">{t.tasksStatusDone}</option>
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
            <input
              type="checkbox"
              checked={d.visible_in_portal}
              onChange={e => setD({ ...d, visible_in_portal: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm" style={{ color: 'var(--color-text)' }}>{t.tasksVisibleInPortal}</span>
              <span className="block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.tasksVisibleInPortalHint}</span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
          {mode === 'edit' ? (
            <button type="button" onClick={onDelete} className="rounded-lg px-2 py-2 text-sm font-medium" style={{ color: 'var(--color-danger)' }}>{t.tasksDelete}</button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.tasksCancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || !d.title.trim()}
              className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            >
              {t.tasksSave}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
