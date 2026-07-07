// Single-select employee picker with built-in search.
//
// A thin wrapper over the generic <SearchSelect>, preserving the exact API the
// document editors and the Documents filter already use. It just teaches the
// combobox how to search/label/render an employee (name + department).

import { useLang } from '../contexts/LanguageContext'
import { getEmployeeDepts, primaryDept, type EmpDeptShape } from '../lib/employee'
import type { Employee } from '../types/aliases'
import { SearchSelect } from './SearchSelect'

type EmployeeWithDepartments = Employee & EmpDeptShape

export function EmployeeSelect({
  value,
  onChange,
  employees,
  disabled,
  emptyLabel,
  invalid,
  extraOption,
}: {
  value: string | null
  onChange: (next: string | null) => void
  employees: EmployeeWithDepartments[]
  disabled?: boolean
  // Label for the "no selection" state. Defaults to "No employee linked"
  // (assignment context); a filter passes e.g. "All employees".
  emptyLabel?: string
  invalid?: boolean
  extraOption?: { value: string; label: string }
}) {
  const { t } = useLang()
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={employees}
      getKey={e => e.id}
      getSearchText={e => `${e.name} ${getEmployeeDepts(e).join(' ')}`}
      getSelectedLabel={e => `${e.name}${primaryDept(e) ? ` (${primaryDept(e)})` : ''}`}
      renderOption={e => (
        <>
          <span>{e.name}</span>
          {primaryDept(e) && (
            <span className="ml-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              ({primaryDept(e)})
            </span>
          )}
        </>
      )}
      placeholder={t.searchEmployeesPlaceholder}
      emptyLabel={emptyLabel ?? t.noEmployeeLinked}
      noMatchLabel={t.noEmployeesMatch}
      disabled={disabled}
      invalid={invalid}
      extraOption={extraOption}
    />
  )
}
