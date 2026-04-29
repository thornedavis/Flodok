// Manually-maintained row-type aliases used throughout the app.
//
// These live in their own file (instead of inside `database.ts`) so they
// survive when `supabase gen types typescript` regenerates the schema —
// that command overwrites the entire file it writes into. Keep new aliases
// here, not in database.ts.

import type { Database } from './database'

export type Organization = Database['public']['Tables']['organizations']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Employee = Database['public']['Tables']['employees']['Row']
export type SopCategory = Database['public']['Tables']['sop_categories']['Row']
export type Sop = Database['public']['Tables']['sops']['Row']
export type SopVersion = Database['public']['Tables']['sop_versions']['Row']
export type SopSignature = Database['public']['Tables']['sop_signatures']['Row']
export type PendingUpdate = Database['public']['Tables']['pending_updates']['Row']
export type ApiKey = Database['public']['Tables']['api_keys']['Row']
export type Tag = Database['public']['Tables']['tags']['Row']
export type Contract = Database['public']['Tables']['contracts']['Row']
export type ContractVersion = Database['public']['Tables']['contract_versions']['Row']
export type FeedEvent = Database['public']['Tables']['feed_events']['Row']
export type OrgInvitation = Database['public']['Tables']['org_invitations']['Row']
export type ContractSignature = Database['public']['Tables']['contract_signatures']['Row']
export type AllowanceAdjustment = {
  id: string
  org_id: string
  employee_id: string
  period_month: string
  amount_idr: number
  reason: string
  awarded_by: string
  created_at: string
}
export type CreditAdjustment = Database['public']['Tables']['credit_adjustments']['Row']
export type BonusAdjustment = Database['public']['Tables']['bonus_adjustments']['Row']
export type AchievementDefinition = Database['public']['Tables']['achievement_definitions']['Row']
export type AchievementUnlock = Database['public']['Tables']['achievement_unlocks']['Row']
export type LeaderboardSnapshot = Database['public']['Tables']['leaderboard_snapshots']['Row']
export type SpotlightPost = Database['public']['Tables']['spotlight_posts']['Row']
export type SpotlightPostView = Database['public']['Tables']['spotlight_post_views']['Row']
export type SpotlightPriority = 'critical' | 'important' | 'fyi'
export type SpotlightDisplayMode = 'modal' | 'banner' | 'bell_only'
export type SpotlightVisibilityScope = 'org_wide' | 'departments' | 'specific_employees'
export type SpotlightStatus = 'draft' | 'scheduled' | 'published' | 'archived'
