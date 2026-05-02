// Frontend billing types, helpers, and Edge Function client. The Stripe API
// itself is never called from the browser — all checkout/portal/webhook work
// happens in the `billing` Supabase Edge Function.

import { supabase } from './supabase'

export type PlanTier = 'free' | 'pro'

// Mirrors Stripe Subscription.status. Null = no subscription on file (free org).
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

// The set of statuses we treat as "Pro is active right now". past_due/unpaid
// orgs keep Pro features until Stripe cancels for non-payment — we mirror
// Stripe's grace-period behavior rather than yanking access on the first
// failed charge.
const ACTIVE_STATUSES = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
])

export interface OrgBilling {
  plan_tier: PlanTier
  subscription_status: SubscriptionStatus | null
  subscription_quantity: number | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  past_due_since: string | null
}

// ─── Dunning state machine ─────────────────────────────────────────────────
//
// Five UI states, derived from Stripe subscription_status + plan_tier +
// past_due_since timestamp. Drives the dashboard banner and the canWrite()
// gate that disables write operations during payment-failure phases.
//
//   pro_active       → all good, full access
//   pro_grace        → past_due, day 0–6, soft banner, full access
//   pro_readonly     → past_due, day 7–13, hard banner, writes blocked
//   free_legitimate  → never had Pro, normal Free experience
//   free_frozen      → was Pro, sub canceled (day 14+), writes blocked AND
//                      listings collapsed to first 2 items per type

export type DunningState =
  | 'pro_active'
  | 'pro_grace'
  | 'pro_readonly'
  | 'free_legitimate'
  | 'free_frozen'

const GRACE_DAYS = 7
const READONLY_DAYS = 14

export function dunningState(billing: OrgBilling | null): DunningState {
  if (!billing) return 'free_legitimate'

  if (billing.plan_tier === 'pro') {
    if (billing.subscription_status === 'past_due' && billing.past_due_since) {
      const elapsedDays = (Date.now() - new Date(billing.past_due_since).getTime()) / 86_400_000
      if (elapsedDays < GRACE_DAYS) return 'pro_grace'
      if (elapsedDays < READONLY_DAYS) return 'pro_readonly'
      // Beyond day 14: Stripe should have cancelled by now per the retry
      // config. If we're here, Stripe is still retrying — treat as readonly
      // until the cancellation webhook lands.
      return 'pro_readonly'
    }
    return 'pro_active'
  }

  // plan_tier === 'free'
  // 'canceled' or 'unpaid' on a Free org means they were on Pro and
  // dropped — frozen experience. null subscription_status means they
  // never paid — normal Free.
  if (billing.subscription_status === 'canceled' || billing.subscription_status === 'unpaid') {
    return 'free_frozen'
  }
  return 'free_legitimate'
}

export function canWrite(state: DunningState): boolean {
  return state !== 'pro_readonly' && state !== 'free_frozen'
}

// Returns the maximum number of items (employees, SOPs, contracts) the
// dashboard should display in listings. null = no cap. Frozen-Free orgs
// get the same 2-item cap as the legitimate Free plan, even though they
// likely have more rows in the DB — accessible again on resume.
export function visibleItemLimit(state: DunningState, planTier: PlanTier): number | null {
  if (state === 'free_frozen') return 2
  if (state === 'free_legitimate' && planTier === 'free') return 2
  return null
}

// Days remaining in the past_due grace window. Used by the soft banner to
// say "5 days until your subscription is paused." Returns null when not
// applicable.
export function daysUntilReadonly(billing: OrgBilling | null): number | null {
  if (!billing?.past_due_since || billing.subscription_status !== 'past_due') return null
  const elapsed = (Date.now() - new Date(billing.past_due_since).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(GRACE_DAYS - elapsed))
}

export function daysUntilCancel(billing: OrgBilling | null): number | null {
  if (!billing?.past_due_since || billing.subscription_status !== 'past_due') return null
  const elapsed = (Date.now() - new Date(billing.past_due_since).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(READONLY_DAYS - elapsed))
}

// Accepts the wider Supabase-generated row type too (plan_tier is `string`
// at the type layer because the CHECK constraint isn't propagated to TS).
export function isPro(org: { plan_tier: string; subscription_status: string | null }): boolean {
  if (org.plan_tier !== 'pro') return false
  if (!org.subscription_status) return false
  return ACTIVE_STATUSES.has(org.subscription_status as SubscriptionStatus)
}

// ─── Edge function client ──────────────────────────────────────────────────

async function callBilling<T>(action: string, body: unknown = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing/${action}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(json.error || `billing/${action} failed (${res.status})`)
  return json
}

export async function startCheckout(opts: {
  successUrl: string
  cancelUrl: string
  seats?: number
}): Promise<string> {
  const { url } = await callBilling<{ url: string }>('checkout', {
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    seats: opts.seats,
  })
  return url
}

export async function openPortal(opts: {
  returnUrl: string
  flow?: 'payment_method_update' | 'subscription_cancel'
}): Promise<string> {
  const { url } = await callBilling<{ url: string }>('portal', {
    return_url: opts.returnUrl,
    flow: opts.flow,
  })
  return url
}

export async function syncSeats(): Promise<{ ok: true; quantity?: number }> {
  return callBilling('sync-seats')
}

export async function updateSeats(seats: number): Promise<{ ok: true; quantity: number }> {
  return callBilling('update-seats', { seats })
}

export interface PaymentMethod {
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

export async function getPaymentMethod(): Promise<PaymentMethod | null> {
  const { payment_method } = await callBilling<{ payment_method: PaymentMethod | null }>('payment-method')
  return payment_method
}

// Read all billing fields off the org row. Anyone in the org can read these
// (they're not secrets) — RLS already gates the row by org membership.
export async function loadOrgBilling(orgId: string): Promise<OrgBilling | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan_tier, subscription_status, subscription_quantity, current_period_end, cancel_at_period_end, past_due_since')
    .eq('id', orgId)
    .single()
  if (error) throw error
  return (data as OrgBilling | null) ?? null
}
