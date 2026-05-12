// Helpers for managing employee_departments assignments by department name.
//
// Departments live in company_departments (one row per org/name), and an
// employee's membership lives in employee_departments (composite PK
// employee_id+department_id, with one row marked is_primary). UI surfaces
// across the app still pick departments by name (single-select), so these
// helpers translate name → id, create new departments inline when needed,
// and keep each employee's assignments tidy.

import { supabase } from './supabase'

export type DepartmentOption = { id: string; name: string }

export type SetDepartmentResult = {
  error?: string
  /** Set when a new department row was created (caller can splice into its
   *  local list of available departments to avoid a refetch). */
  created?: DepartmentOption
}

/**
 * Replace an employee's department assignment with a single primary row.
 * Pass null/empty to clear the assignment entirely. If the supplied name
 * does not match any existing department (case-insensitive), a new
 * company_departments row is created first.
 *
 * Returns `error` on failure; `created` is set when a new department was
 * minted so the caller can update its local list.
 */
export async function setEmployeePrimaryDepartment(params: {
  employeeId: string
  orgId: string
  name: string | null
  available: DepartmentOption[]
}): Promise<SetDepartmentResult> {
  const { employeeId, orgId, name, available } = params

  if (!name || !name.trim()) {
    const { error } = await supabase
      .from('employee_departments')
      .delete()
      .eq('employee_id', employeeId)
    if (error) return { error: error.message }
    return {}
  }

  const trimmed = name.trim()
  let departmentId = available.find(d => d.name.toLowerCase() === trimmed.toLowerCase())?.id
  let created: DepartmentOption | undefined

  if (!departmentId) {
    const { data, error } = await supabase
      .from('company_departments')
      .insert({ org_id: orgId, name: trimmed })
      .select('id, name')
      .single()
    if (error) return { error: error.message }
    departmentId = data.id
    created = data
  }

  const { error: delErr } = await supabase
    .from('employee_departments')
    .delete()
    .eq('employee_id', employeeId)
  if (delErr) return { error: delErr.message }

  const { error: insErr } = await supabase
    .from('employee_departments')
    .insert({ employee_id: employeeId, department_id: departmentId, is_primary: true })
  if (insErr) return { error: insErr.message }

  return { created }
}
