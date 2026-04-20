// Client-side data layer for the Integrations tab. Talks to the
// manage-integration Edge Function for save/test/delete, and reads list state
// from the org_integrations_public view.

import { supabase } from './supabase'

export type IntegrationProvider = 'fireflies' | 'asana'
export type IntegrationStatus = 'active' | 'disabled' | 'error'

export interface IntegrationRow {
  id: string
  provider: IntegrationProvider
  status: IntegrationStatus
  config: Record<string, unknown>
  version: number
  last_verified_at: string | null
  last_error: string | null
  has_credentials: boolean
  created_at: string
  updated_at: string
}

interface TestResult {
  ok: boolean
  details?: unknown
  supports_webhooks?: boolean
  error?: string
}

async function callEdge<T>(path: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${supabaseUrl}/functions/v1/manage-integration${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `Request failed (${res.status})`)
  }
  return json
}

export async function listIntegrations(orgId: string): Promise<IntegrationRow[]> {
  const { data, error } = await supabase
    .from('org_integrations_public')
    .select('*')
    .eq('org_id', orgId)
  if (error) throw error
  return (data as IntegrationRow[]) || []
}

export async function testIntegration(
  provider: IntegrationProvider,
  credentials: Record<string, string>,
): Promise<TestResult> {
  return callEdge<TestResult>('/test', { provider, credentials })
}

export async function saveIntegration(
  provider: IntegrationProvider,
  credentials: Record<string, string>,
  config: Record<string, unknown> = {},
): Promise<{ ok: true; id: string; version: number }> {
  return callEdge('/save', { provider, credentials, config })
}

export async function deleteIntegration(provider: IntegrationProvider): Promise<{ ok: true }> {
  return callEdge('/delete', { provider })
}

// Re-test the currently saved credentials against the provider. Updates
// last_verified_at / last_error server-side; caller should reload integrations
// after this resolves to show fresh status.
export async function verifyIntegration(provider: IntegrationProvider): Promise<TestResult> {
  return callEdge<TestResult>('/verify', { provider })
}

// Read the non-secret "credential_hint" from an integration's config jsonb.
// Populated by manage-integration/save — last 4 chars of the primary secret
// (e.g. api_key). Used in the UI to confirm which key is currently stored.
export function getCredentialHint(row: IntegrationRow | null): string | null {
  if (!row) return null
  const hint = (row.config as { credential_hint?: unknown })?.credential_hint
  return typeof hint === 'string' && hint.length > 0 ? hint : null
}

// The operator-owned Worker hostname. One value for the whole deployment.
// Set in .env as VITE_FLODOK_ROUTER_URL, e.g. https://flodok-router.acme.workers.dev
export function firefliesWebhookUrl(orgId: string): string {
  const base = import.meta.env.VITE_FLODOK_ROUTER_URL
  if (!base) return '' // UI should treat empty as "not configured"
  return `${base.replace(/\/$/, '')}/webhook/fireflies/${orgId}`
}
