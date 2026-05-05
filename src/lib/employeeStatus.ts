import type { Employee } from '../types/aliases'

export type DerivedStatus =
  | 'prospective'
  | 'offered'
  | 'onboarding'
  | 'probation'
  | 'active'
  | 'separated'
  | 'talent_pool'

export type SeparationType = 'resigned' | 'terminated'

// Derives the badge an employee should display based on lifecycle_stage and
// the dates on their record. The status column is intentionally not consulted
// — derivation from facts is the whole point.
export function deriveEmployeeStatus(emp: Pick<Employee, 'lifecycle_stage' | 'join_date' | 'probation_end_date'>, today: Date = new Date()): DerivedStatus {
  const stage = emp.lifecycle_stage as string | null

  if (stage === 'prospective') return 'prospective'
  if (stage === 'offered') return 'offered'
  if (stage === 'separated') return 'separated'
  if (stage === 'talent_pool') return 'talent_pool'

  // 'signed' (start_date in the future) or 'active'.
  const todayYmd = ymd(today)
  if (stage === 'signed' && emp.join_date && emp.join_date > todayYmd) {
    return 'onboarding'
  }
  if (emp.probation_end_date && emp.probation_end_date >= todayYmd) {
    return 'probation'
  }
  return 'active'
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
