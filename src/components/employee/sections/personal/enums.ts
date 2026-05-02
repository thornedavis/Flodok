import type { Translations } from '../../../../lib/translations'

export const GENDER_VALUES = ['male', 'female'] as const
export type Gender = typeof GENDER_VALUES[number]

export const MARITAL_VALUES = ['single', 'married', 'divorced', 'widowed'] as const
export type MaritalStatus = typeof MARITAL_VALUES[number]

export const BLOOD_TYPE_VALUES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const
export type BloodType = typeof BLOOD_TYPE_VALUES[number]

export const RELIGION_VALUES = ['islam', 'protestant', 'catholic', 'hindu', 'buddhist', 'confucian', 'other'] as const
export type Religion = typeof RELIGION_VALUES[number]

export function genderLabel(t: Translations, value: string | null): string | null {
  switch (value) {
    case 'male': return t.empGenderMale
    case 'female': return t.empGenderFemale
    default: return null
  }
}

export function maritalLabel(t: Translations, value: string | null): string | null {
  switch (value) {
    case 'single': return t.empMaritalSingle
    case 'married': return t.empMaritalMarried
    case 'divorced': return t.empMaritalDivorced
    case 'widowed': return t.empMaritalWidowed
    default: return null
  }
}

export function bloodLabel(t: Translations, value: string | null): string | null {
  if (!value) return null
  if (value === 'unknown') return t.empBloodUnknown
  return value
}

export function religionLabel(t: Translations, value: string | null): string | null {
  switch (value) {
    case 'islam': return t.empReligionIslam
    case 'protestant': return t.empReligionProtestant
    case 'catholic': return t.empReligionCatholic
    case 'hindu': return t.empReligionHindu
    case 'buddhist': return t.empReligionBuddhist
    case 'confucian': return t.empReligionConfucian
    case 'other': return t.empReligionOther
    default: return null
  }
}
