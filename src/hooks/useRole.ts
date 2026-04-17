import type { User } from '../types/database'

export type Role = 'owner' | 'admin' | 'manager'

export function useRole(user: User) {
  const role = (user.role || 'manager') as Role
  return {
    role,
    isOwner: role === 'owner',
    isAdmin: role === 'owner' || role === 'admin',
  }
}
