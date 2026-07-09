// Recruitment pipeline: derived board-column + "whose court is the ball in"
// status. Both are PURE functions of the employee's lifecycle_stage plus a small
// CandidateSignals bundle (contract/JD signature state, onboarding progress,
// join_date) — no new columns, no data access here. The Recruitment page fetches
// the signals and maps the returned `kind` to translated copy. Kept pure so the
// load-bearing progression logic is unit-testable in isolation.
//
// See docs/recruitment-pipeline-plan.md for the full model.

import type { LifecycleStage } from './lifecycle'

// A richer sub-state than lifecycle_stage: `signed` splits by whether onboarding
// is done and a start date exists, so "still filling in" and "ready, waiting for
// their date" land in different columns.
export type BoardColumn =
  | 'prospective'
  | 'shortlisted'
  | 'offered'
  | 'signed_onboarding'
  | 'starting_soon'
  | 'inactive' // talent_pool / no_show — off the forward path

// Who needs to act next. Drives chip colour + the drawer banner.
export type StatusActor =
  | 'needs_you' // your move to advance them
  | 'with_them' // waiting on the candidate; nothing for you
  | 'scheduled' // done, future start date, on track
  | 'ready' // start date is today
  | 'stuck' // ready but blocked by something you own (no start date)
  | 'neutral' // off-path (talent pool / no-show)

export type StatusKind =
  | 'awaiting_profile'
  | 'filling_profile'
  | 'ready_to_offer'
  | 'add_jd'
  | 'awaiting_contract_sign'
  | 'awaiting_jd_sign'
  | 'onboarding'
  | 'set_start_date'
  | 'starts_on'
  | 'ready_today'
  | 'talent_pool'
  | 'no_show'

export interface CandidateSignals {
  /** An active contract is attached (true for a normal offered/signed flow). */
  hasContract: boolean
  /** The candidate has signed the active contract. */
  contractSigned: boolean
  /** applied_for_jd_id is set. */
  jdLinked: boolean
  /** The candidate has signed the linked JD. */
  jdSigned: boolean
  /** Completed onboarding-profile sections (0..total). */
  onboardingDone: number
  /** Total onboarding-profile sections (7 today, see candidateProfile.ts). */
  onboardingTotal: number
  /** yyyy-mm-dd or null. */
  joinDate: string | null
  /** yyyy-mm-dd — injected (never Date.now() inside) so this stays testable. */
  today: string
  /** Per-section onboarding completion — UI-only (the drawer's section grid);
   *  the derivations above rely on onboardingDone/Total, not this. */
  sections?: { key: string; complete: boolean }[]
}

export interface CandidateStatus {
  actor: StatusActor
  kind: StatusKind
  /** Optional payload the page interpolates into copy. */
  data?: { done?: number; total?: number; date?: string; pct?: number }
}

function onboardingComplete(s: CandidateSignals): boolean {
  return s.onboardingTotal > 0 && s.onboardingDone >= s.onboardingTotal
}

function pct(s: CandidateSignals): number {
  if (s.onboardingTotal <= 0) return 0
  return Math.round((s.onboardingDone / s.onboardingTotal) * 100)
}

/** Where the candidate sits on the board. */
export function deriveBoardColumn(stage: LifecycleStage, s: CandidateSignals): BoardColumn {
  switch (stage) {
    case 'prospective': return 'prospective'
    case 'shortlisted': return 'shortlisted'
    case 'offered': return 'offered'
    case 'signed':
      return onboardingComplete(s) && s.joinDate ? 'starting_soon' : 'signed_onboarding'
    default:
      // talent_pool, no_show, active, separated — none belong on the board.
      return 'inactive'
  }
}

/** Whose court the ball is in, and why. */
export function deriveStatus(stage: LifecycleStage, s: CandidateSignals): CandidateStatus {
  switch (stage) {
    case 'prospective':
      // Pre-offer, the ball is always with the candidate: they've been invited to fill
      // the screening profile, and completing it is what advances them to shortlisted.
      // A fresh import is NOT your move — don't nag with needs_you here.
      return s.onboardingDone > 0
        ? { actor: 'with_them', kind: 'filling_profile', data: { pct: pct(s) } }
        : { actor: 'with_them', kind: 'awaiting_profile' }

    case 'shortlisted':
      // JD is now required to send an offer, so surface it as the next move.
      return s.jdLinked
        ? { actor: 'needs_you', kind: 'ready_to_offer' }
        : { actor: 'needs_you', kind: 'add_jd' }

    case 'offered':
      // Portal order is contract-sign then JD-sign; report the first gap.
      if (s.hasContract && !s.contractSigned) return { actor: 'with_them', kind: 'awaiting_contract_sign' }
      if (s.jdLinked && !s.jdSigned) return { actor: 'with_them', kind: 'awaiting_jd_sign' }
      return { actor: 'with_them', kind: 'onboarding', data: { done: s.onboardingDone, total: s.onboardingTotal } }

    case 'signed':
      if (!onboardingComplete(s)) {
        return { actor: 'with_them', kind: 'onboarding', data: { done: s.onboardingDone, total: s.onboardingTotal } }
      }
      if (!s.joinDate) return { actor: 'stuck', kind: 'set_start_date' } // the trap
      if (s.joinDate <= s.today) return { actor: 'ready', kind: 'ready_today' }
      return { actor: 'scheduled', kind: 'starts_on', data: { date: s.joinDate } }

    case 'no_show':
      return { actor: 'neutral', kind: 'no_show' }
    default:
      // talent_pool (and any off-path stage that still renders in a filtered list)
      return { actor: 'neutral', kind: 'talent_pool' }
  }
}

/** Zero-based node index on the Prospective→Active path. */
export function pathIndex(stage: LifecycleStage): number {
  switch (stage) {
    case 'prospective': return 0
    case 'shortlisted': return 1
    case 'offered': return 2
    case 'signed': return 3
    case 'active': return 4
    default: return 0 // talent_pool / no_show / separated aren't on the path
  }
}

/** The "Needs you (N)" filter set: items where you are the bottleneck. */
export function isNeedsYou(actor: StatusActor): boolean {
  return actor === 'needs_you' || actor === 'stuck' || actor === 'ready'
}
