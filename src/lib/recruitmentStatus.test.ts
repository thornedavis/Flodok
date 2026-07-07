import { describe, it, expect } from 'vitest'
import {
  deriveBoardColumn,
  deriveStatus,
  pathIndex,
  isNeedsYou,
  type CandidateSignals,
} from './recruitmentStatus'

// A "nothing done yet" baseline; each test overrides only what it exercises.
function signals(over: Partial<CandidateSignals> = {}): CandidateSignals {
  return {
    hasContract: false,
    contractSigned: false,
    jdLinked: false,
    jdSigned: false,
    onboardingDone: 0,
    onboardingTotal: 7,
    joinDate: null,
    today: '2026-07-07',
    ...over,
  }
}

describe('deriveBoardColumn', () => {
  it('maps the plain recruitment stages 1:1', () => {
    expect(deriveBoardColumn('prospective', signals())).toBe('prospective')
    expect(deriveBoardColumn('shortlisted', signals())).toBe('shortlisted')
    expect(deriveBoardColumn('offered', signals())).toBe('offered')
  })

  it('keeps a signed hire in onboarding until profile is complete', () => {
    expect(deriveBoardColumn('signed', signals({ onboardingDone: 4, joinDate: '2026-07-20' })))
      .toBe('signed_onboarding')
  })

  it('keeps a signed hire in onboarding when complete but no start date (the trap)', () => {
    expect(deriveBoardColumn('signed', signals({ onboardingDone: 7, joinDate: null })))
      .toBe('signed_onboarding')
  })

  it('moves a complete + dated hire to starting_soon', () => {
    expect(deriveBoardColumn('signed', signals({ onboardingDone: 7, joinDate: '2026-07-20' })))
      .toBe('starting_soon')
  })

  it('files talent_pool / no_show off-board', () => {
    expect(deriveBoardColumn('talent_pool', signals())).toBe('inactive')
    expect(deriveBoardColumn('no_show', signals())).toBe('inactive')
  })
})

describe('deriveStatus', () => {
  it('prospective: your move to review, or waiting on them if they started a profile', () => {
    expect(deriveStatus('prospective', signals())).toMatchObject({ actor: 'needs_you', kind: 'review' })
    expect(deriveStatus('prospective', signals({ onboardingDone: 3 })))
      .toMatchObject({ actor: 'with_them', kind: 'filling_profile', data: { pct: 43 } })
  })

  it('shortlisted: needs a JD before you can offer', () => {
    expect(deriveStatus('shortlisted', signals({ jdLinked: false })))
      .toMatchObject({ actor: 'needs_you', kind: 'add_jd' })
    expect(deriveStatus('shortlisted', signals({ jdLinked: true })))
      .toMatchObject({ actor: 'needs_you', kind: 'ready_to_offer' })
  })

  it('offered: reports the first missing signature (contract before JD)', () => {
    expect(deriveStatus('offered', signals({ hasContract: true, contractSigned: false })))
      .toMatchObject({ actor: 'with_them', kind: 'awaiting_contract_sign' })
    expect(deriveStatus('offered', signals({ hasContract: true, contractSigned: true, jdLinked: true, jdSigned: false })))
      .toMatchObject({ actor: 'with_them', kind: 'awaiting_jd_sign' })
  })

  it('signed + incomplete: waiting on them to finish onboarding', () => {
    expect(deriveStatus('signed', signals({ onboardingDone: 5, contractSigned: true, jdSigned: true })))
      .toMatchObject({ actor: 'with_them', kind: 'onboarding', data: { done: 5, total: 7 } })
  })

  it('signed + complete + no start date: STUCK — needs you to set one', () => {
    expect(deriveStatus('signed', signals({ onboardingDone: 7, joinDate: null })))
      .toMatchObject({ actor: 'stuck', kind: 'set_start_date' })
  })

  it('signed + complete + future date: scheduled', () => {
    expect(deriveStatus('signed', signals({ onboardingDone: 7, joinDate: '2026-07-20' })))
      .toMatchObject({ actor: 'scheduled', kind: 'starts_on', data: { date: '2026-07-20' } })
  })

  it('signed + complete + today (or past): ready to activate', () => {
    expect(deriveStatus('signed', signals({ onboardingDone: 7, joinDate: '2026-07-07' })))
      .toMatchObject({ actor: 'ready', kind: 'ready_today' })
    expect(deriveStatus('signed', signals({ onboardingDone: 7, joinDate: '2026-07-01' })))
      .toMatchObject({ actor: 'ready', kind: 'ready_today' })
  })
})

describe('pathIndex', () => {
  it('orders the forward path', () => {
    expect((['prospective', 'shortlisted', 'offered', 'signed', 'active'] as const).map(pathIndex))
      .toEqual([0, 1, 2, 3, 4])
  })
})

describe('isNeedsYou', () => {
  it('includes needs_you, stuck and ready; excludes with_them / scheduled / neutral', () => {
    expect((['needs_you', 'stuck', 'ready'] as const).map(isNeedsYou)).toEqual([true, true, true])
    expect((['with_them', 'scheduled', 'neutral'] as const).map(isNeedsYou)).toEqual([false, false, false])
  })
})
