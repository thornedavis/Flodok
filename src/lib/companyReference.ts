import type { CompanyReferenceValue, Employee } from '../types/aliases'

export const COMPANY_REFERENCE_KINDS = [
  'department',
  'branch',
  'job_position',
  'job_level',
  'employee_class',
] as const

export type CompanyReferenceKind = typeof COMPANY_REFERENCE_KINDS[number]

export type ReferenceBuckets = Record<CompanyReferenceKind, CompanyReferenceValue[]>

export const emptyReferenceBuckets = (): ReferenceBuckets => ({
  department: [],
  branch: [],
  job_position: [],
  job_level: [],
  employee_class: [],
})

export function bucketReferenceValues(values: CompanyReferenceValue[]): ReferenceBuckets {
  const buckets = emptyReferenceBuckets()
  for (const value of values) {
    if (COMPANY_REFERENCE_KINDS.includes(value.kind as CompanyReferenceKind)) {
      buckets[value.kind as CompanyReferenceKind].push(value)
    }
  }
  for (const kind of COMPANY_REFERENCE_KINDS) {
    buckets[kind].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
  }
  return buckets
}

export function referenceNames(values: CompanyReferenceValue[]): string[] {
  return values.map(v => v.name)
}

export function getReferenceUsage(kind: CompanyReferenceKind, employees: Employee[]): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (name: string | null | undefined) => {
    const clean = name?.trim()
    if (!clean) return
    counts.set(clean.toLowerCase(), (counts.get(clean.toLowerCase()) ?? 0) + 1)
  }

  for (const employee of employees) {
    if (kind === 'department') {
      const departments = employee.departments?.length
        ? employee.departments
        : employee.department
        ? [employee.department]
        : []
      for (const dept of departments) add(dept)
    } else if (kind === 'branch') {
      add(employee.branch_name)
    } else if (kind === 'job_position') {
      add(employee.job_position)
    } else if (kind === 'job_level') {
      add(employee.job_level)
    } else if (kind === 'employee_class') {
      add(employee.class)
    }
  }

  return counts
}
