import type { Employee } from '../types/aliases'

type EmpDeptShape = Pick<Employee, 'department' | 'departments'>

/**
 * An employee's departments, preferring the `departments` array column and
 * falling back to the legacy `department` single column for any records that
 * predate migration 021.
 */
export function getEmployeeDepts(e: EmpDeptShape): string[] {
  if (e.departments && e.departments.length > 0) return e.departments
  if (e.department) return [e.department]
  return []
}

/** First / primary department, for compact displays (picker labels, etc.). */
export function primaryDept(e: EmpDeptShape): string | null {
  const depts = getEmployeeDepts(e)
  return depts[0] || null
}

/** All departments joined by comma — for contract templates, summary lines, etc. */
export function deptsJoined(e: EmpDeptShape, separator = ', '): string {
  return getEmployeeDepts(e).join(separator)
}
