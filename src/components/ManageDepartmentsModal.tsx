// Shared rename / delete UI for organisation departments.
//
// Departments are stored as a text[] on each employee row, not as their own
// table. Rename = update every employee that has the old name. Delete =
// remove the name from every affected employee. Both ops touch only the
// employees table, so this modal works the same regardless of which page
// surfaced it (Employees, SOPs, Contracts).

import { supabase } from '../lib/supabase'
import { Modal } from './Modal'
import { useLang } from '../contexts/LanguageContext'
import { getEmployeeDepts } from '../lib/employee'
import type { Employee } from '../types/aliases'

export function ManageDepartmentsModal({
  open, onClose, departments, employees, onChanged,
}: {
  open: boolean
  onClose: () => void
  /** Departments currently in use, in display order. */
  departments: string[]
  /** All employees in the org — needed to compute counts and to update rows on rename/delete. */
  employees: Employee[]
  /** Called after a successful mutation so the parent page can re-load its data. */
  onChanged: () => void
}) {
  const { t } = useLang()

  function getCount(dept: string) {
    return employees.filter(e => getEmployeeDepts(e).includes(dept)).length
  }

  async function handleRename(oldName: string) {
    const newName = prompt(t.renameDepartmentPrompt(oldName), oldName)
    if (!newName || newName.trim() === oldName) return
    const trimmed = newName.trim()

    const existing = departments.find(d => d.toLowerCase() === trimmed.toLowerCase() && d !== oldName)
    const target = existing
      ? (confirm(t.mergeDepartmentConfirm(existing, oldName)) ? existing : null)
      : trimmed
    if (!target) return

    const affected = employees.filter(e => getEmployeeDepts(e).includes(oldName))
    await Promise.all(affected.map(emp => {
      const next = [...new Set(getEmployeeDepts(emp).map(d => d === oldName ? target : d))]
      return supabase.from('employees').update({
        departments: next,
        department: next[0] || null,
      }).eq('id', emp.id)
    }))
    onChanged()
  }

  async function handleDelete(dept: string) {
    const count = getCount(dept)
    if (!confirm(t.removeDepartmentConfirm(dept, count))) return
    const affected = employees.filter(e => getEmployeeDepts(e).includes(dept))
    await Promise.all(affected.map(emp => {
      const next = getEmployeeDepts(emp).filter(d => d !== dept)
      return supabase.from('employees').update({
        departments: next,
        department: next[0] || null,
      }).eq('id', emp.id)
    }))
    onChanged()
  }

  return (
    <Modal open={open} onClose={onClose} title={t.manageDepartments}>
      {departments.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noDepartmentsYet}</p>
      ) : (
        <div className="space-y-1">
          {departments.map(dept => (
            <div
              key={dept}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-text)' }}>{dept}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{getCount(dept)}</span>
                <button
                  type="button"
                  onClick={() => handleRename(dept)}
                  className="text-xs"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t.renameDepartment}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(dept)}
                  className="text-xs"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {t.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
