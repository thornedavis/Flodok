// Department-display helpers. Employees own zero or more departments through
// the employee_departments join table; exactly one row per employee may carry
// is_primary=true (enforced by a partial unique index in migration 085).
//
// Callers fetch employees with a relational select like:
//   select('*, employee_departments(is_primary, department:company_departments(id, name))')
// and pass the resulting row into these helpers. The shape below describes
// only the fields these helpers read so callers can pass partial selects.

export type EmployeeDepartmentRow = {
  is_primary: boolean
  department: { id: string; name: string } | null
}

export type EmpDeptShape = {
  employee_departments?: EmployeeDepartmentRow[] | null
}

function sortedAssignments(e: EmpDeptShape): EmployeeDepartmentRow[] {
  const rows = e.employee_departments ?? []
  // Primary first, then alphabetical by name for stable display ordering.
  return [...rows].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return (a.department?.name ?? '').localeCompare(b.department?.name ?? '')
  })
}

/** Department names for an employee, primary first. */
export function getEmployeeDepts(e: EmpDeptShape): string[] {
  return sortedAssignments(e)
    .map(row => row.department?.name)
    .filter((n): n is string => !!n && n.length > 0)
}

/** Primary department name, for compact displays (picker labels, etc.). */
export function primaryDept(e: EmpDeptShape): string | null {
  const primary = (e.employee_departments ?? []).find(r => r.is_primary)
  return primary?.department?.name ?? null
}

/** All departments joined by separator — for contract templates, summary lines, etc. */
export function deptsJoined(e: EmpDeptShape, separator = ', '): string {
  return getEmployeeDepts(e).join(separator)
}
