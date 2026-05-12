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
export type CompanyReferenceValue = Database['public']['Tables']['company_reference_values']['Row']
export type CompanyBranch = Database['public']['Tables']['company_branches']['Row']
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
export type DocumentViewPref = Database['public']['Tables']['document_view_prefs']['Row']
export type DocumentTemplate = Database['public']['Tables']['document_templates']['Row']
export type EmployeeFamilyMember = Database['public']['Tables']['employee_family_members']['Row']
export type EmployeeEmergencyContact = Database['public']['Tables']['employee_emergency_contacts']['Row']
export type EmployeeFormalEducation = Database['public']['Tables']['employee_formal_education']['Row']
export type EmployeeInformalEducation = Database['public']['Tables']['employee_informal_education']['Row']
export type EmployeeWorkingExperience = Database['public']['Tables']['employee_working_experience']['Row']
export type EmployeeCustomField = Database['public']['Tables']['employee_custom_fields']['Row']
export type InboxDismissal = Database['public']['Tables']['inbox_dismissals']['Row']
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
export type SpotlightPostedAsKind = 'self' | 'org'
