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
export type CompanyDepartment = Database['public']['Tables']['company_departments']['Row']
export type EmployeeDepartmentLink = Database['public']['Tables']['employee_departments']['Row']
export type HiringRequest = Database['public']['Tables']['hiring_requests']['Row']
export type HiringRequestInsert = Database['public']['Tables']['hiring_requests']['Insert']
export type JobDescription = Database['public']['Tables']['job_descriptions']['Row']
export type JobDescriptionInsert = Database['public']['Tables']['job_descriptions']['Insert']
export type JobDescriptionVersion = Database['public']['Tables']['job_description_versions']['Row']
export type JobDescriptionSignature = Database['public']['Tables']['job_description_signatures']['Row']

// ─── Forms (leave / overtime requests) ──────────────────────────────────────
// form_type and status are text+CHECK columns, so the generated Row types them
// as `string`; these unions narrow them at call sites (cast like HiringRequest).
export type FormType = 'leave_request' | 'overtime_request'
export type FormStatus =
  | 'draft'
  | 'submitted'
  | 'manager_approved'
  | 'approved'
  | 'rejected_by_manager'
  | 'rejected_by_owner'
export type FormSubmission = Database['public']['Tables']['form_submissions']['Row']
export type FormSubmissionInsert = Database['public']['Tables']['form_submissions']['Insert']
export type FormLineItem = Database['public']['Tables']['form_line_items']['Row']
export type LeaveLedger = Database['public']['Tables']['leave_ledger']['Row']
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
export type Nda = Database['public']['Tables']['ndas']['Row']
export type NdaVersion = Database['public']['Tables']['nda_versions']['Row']
export type NdaSignature = Database['public']['Tables']['nda_signatures']['Row']
export type Letter = Database['public']['Tables']['letters']['Row']
export type LetterVersion = Database['public']['Tables']['letter_versions']['Row']
export type LetterAcknowledgement = Database['public']['Tables']['letter_acknowledgements']['Row']
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
export type PayAdjustment = Database['public']['Tables']['pay_adjustments']['Row']
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
