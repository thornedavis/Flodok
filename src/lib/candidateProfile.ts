// Candidate-facing profile completion.
//
// Drives two UI surfaces:
//   1. A small chip on the Recruitment list row ("60% complete").
//   2. The candidate-mode portal home checklist (when shown — pre-offer).
//
// "Complete" here means "every required field for this section is filled
// in." We don't gate any hard workflow on this — it's a hint to HR and the
// candidate that the profile is ready for offer. Optional fields (e.g.
// passport, blood type) don't count against completion.

import type { Employee } from '../types/aliases'

export const CANDIDATE_SOURCE_OPTIONS = [
  'jobseek',
  'indeed',
  'linkedin',
  'referral',
  'direct',
  'other',
] as const
export type CandidateSourceOption = typeof CANDIDATE_SOURCE_OPTIONS[number]

// ─── Section model ──────────────────────────────────────────────────────

export type ProfileSectionKey =
  | 'personal'
  | 'identity'
  | 'education'
  | 'experience'
  | 'family'
  | 'emergency'
  | 'bank'

export interface ProfileSectionStatus {
  key: ProfileSectionKey
  complete: boolean
  /** True when at least one field is filled (used to render "in progress"
   *  vs "not started" states). */
  started: boolean
}

interface RelatedCounts {
  formalEducation: number
  workingExperience: number
  familyMembers: number
  emergencyContacts: number
}

/**
 * Compute completion for each section. Pass zeros for relatedCounts when
 * you only have the Employee row in hand (e.g. the list view) — those
 * sections will show as not-started for everyone, which is acceptable
 * for a list chip. The portal home should pass real counts for accuracy.
 */
export function computeProfileSections(
  emp: Pick<Employee,
    | 'name' | 'first_name' | 'last_name' | 'phone' | 'email'
    | 'date_of_birth' | 'place_of_birth' | 'gender' | 'address'
    | 'ktp_nik' | 'npwp' | 'religion' | 'marital_status'
    | 'bank_name' | 'bank_account_number' | 'bank_account_holder'
  >,
  relatedCounts: RelatedCounts = { formalEducation: 0, workingExperience: 0, familyMembers: 0, emergencyContacts: 0 },
): ProfileSectionStatus[] {
  const personalFields = [emp.name, emp.phone, emp.date_of_birth, emp.place_of_birth, emp.gender, emp.address]
  const identityFields = [emp.ktp_nik, emp.religion, emp.marital_status]
  const bankFields = [emp.bank_name, emp.bank_account_number, emp.bank_account_holder]

  return [
    sectionFromFields('personal', personalFields),
    sectionFromFields('identity', identityFields),
    sectionFromCount('education', relatedCounts.formalEducation),
    sectionFromCount('experience', relatedCounts.workingExperience),
    sectionFromCount('family', relatedCounts.familyMembers),
    sectionFromCount('emergency', relatedCounts.emergencyContacts),
    sectionFromFields('bank', bankFields),
  ]
}

function sectionFromFields(key: ProfileSectionKey, fields: (string | null | undefined)[]): ProfileSectionStatus {
  const filled = fields.filter(isFilled).length
  return {
    key,
    complete: filled === fields.length,
    started: filled > 0,
  }
}

function sectionFromCount(key: ProfileSectionKey, count: number): ProfileSectionStatus {
  return { key, complete: count > 0, started: count > 0 }
}

function isFilled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Aggregate percentage across the seven sections. Each section weighs
 * equally — i.e. completing "identity" counts the same as completing
 * "experience". Returns a whole number 0-100.
 */
export function profileCompletionPercent(sections: ProfileSectionStatus[]): number {
  if (sections.length === 0) return 0
  const complete = sections.filter(s => s.complete).length
  return Math.round((complete / sections.length) * 100)
}

/**
 * Cheap variant for the list view: takes just an Employee row (no joins)
 * and returns a percentage. Used for the chip on the Recruitment list.
 * Doesn't peek at related tables so education/experience/family/emergency
 * always show as not-started — acceptable for a glanceable chip.
 */
export function profileCompletionPercentFromEmployee(
  emp: Parameters<typeof computeProfileSections>[0],
): number {
  return profileCompletionPercent(computeProfileSections(emp))
}
