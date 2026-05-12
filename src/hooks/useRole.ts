import type { User } from '../types/aliases'

// Org-level roles. Department-management authority is a separate concept,
// derived from company_departments.manager_employee_id — not a role here.
//
//   owner  — one per org, final approver, full control.
//   admin  — org settings, billing, invites, integrations.
//   hr     — owns the employee lifecycle (hiring, contracts, onboarding,
//            separations) without billing/integrations powers.
//   member — default. Has app access; can be assigned as a department's
//            manager to gain approval authority over that department.
export type Role = 'owner' | 'admin' | 'hr' | 'member'

export function useRole(user: User) {
  const role = (user.role || 'member') as Role
  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'owner' || role === 'admin',
    isHR: role === 'hr',
    /** True for anyone who should see HR surfaces (hiring, contracts UI,
     *  employee management). Owners and admins inherit HR powers; a
     *  dedicated HR user gets them without org-settings access. */
    canManagePeople: role === 'owner' || role === 'admin' || role === 'hr',
  }
}
