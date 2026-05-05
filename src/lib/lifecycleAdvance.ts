import { supabase } from './supabase'

// Lazy lifecycle advancement: a candidate who has signed their contract
// stays in `signed` until their `join_date` arrives, at which point they
// graduate to `active` and start showing up in the regular Employees list.
//
// Without a cron job to flip these automatically, we run a lightweight
// idempotent check on each read path (Hiring page load + Portal load).
// One UPDATE per page load with a tight WHERE clause — no-op when there's
// nothing to advance.

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Bulk-advance any `signed` employees in this org whose join_date has
// arrived. Called from the Hiring page so HR sees them disappear out of
// the Signed tab and reappear in Employees the moment they start.
export async function advanceSignedToActiveForOrg(orgId: string): Promise<void> {
  await supabase
    .from('employees')
    .update({ lifecycle_stage: 'active' })
    .eq('org_id', orgId)
    .eq('lifecycle_stage', 'signed')
    .not('join_date', 'is', null)
    .lte('join_date', todayYmd())
}

// Single-employee version for the Portal: when a signed employee opens
// their portal on or after their start date, advance them so the onboarding
// flow steps aside and the normal portal renders.
export async function advanceSignedToActive(employeeId: string, joinDate: string | null, currentStage: string): Promise<boolean> {
  if (currentStage !== 'signed') return false
  if (!joinDate) return false
  if (joinDate > todayYmd()) return false
  const { error } = await supabase
    .from('employees')
    .update({ lifecycle_stage: 'active' })
    .eq('id', employeeId)
    .eq('lifecycle_stage', 'signed')
  return !error
}
