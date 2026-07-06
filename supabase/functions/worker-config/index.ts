// worker-config — private Edge Function called only by the Cloudflare Worker.
//
// Exposes the multi-tenant surface the Worker needs:
//   POST /resolve            — fetch all active integrations for one org
//   POST /list-active-orgs   — list every org with any active integration (cron fan-out)
//   POST /dedup-claim        — atomic insert into processed_meetings
//   POST /log-processing     — append a processing_logs row
//   POST /test-credentials   — call a provider's "whoami" with raw creds (not persisted)
//
// Auth: header `X-Worker-Token` must match WORKER_SERVICE_TOKEN. The Worker is
// the only caller. We intentionally do NOT accept Supabase user JWTs here —
// user-facing actions go through the separate `manage-integration` function.
//
// The Worker caches `/resolve` responses in KV keyed by org_id+version for 60s.
// Ciphertext is returned as-is; the Worker decrypts locally with its own copy
// of ENCRYPTION_KEY. This function can also decrypt (for test-credentials),
// but it never sends plaintext back to the Worker.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'

interface ResolveRequest {
  org_id: string
}

interface DedupClaimRequest {
  org_id: string
  provider: string
  external_id: string
}

interface MarkMeetingRequest {
  org_id: string
  provider: string
  external_id: string
  success: boolean
}

// Bounded retries: a transiently-failed meeting is re-claimable by the cron poll
// up to this many attempts before it's marked 'poison' and left alone.
const MAX_MEETING_ATTEMPTS = 3

interface LogProcessingRequest {
  org_id: string
  provider: string
  external_id: string
  meeting_title?: string
  meeting_date?: string
  employees_matched?: number
  tasks_created?: number
  tasks_deduped?: number
  tasks_failed?: number
  sop_updates_sent?: number
  unmatched_items?: number
  errors?: string[]
}

interface TestCredentialsRequest {
  provider: 'fireflies' | 'asana' | 'openrouter'
  credentials: Record<string, string>
}

function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function authorizeWorker(req: Request): boolean {
  const token = req.headers.get('x-worker-token')
  const expected = Deno.env.get('WORKER_SERVICE_TOKEN')
  if (!token || !expected) return false
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

async function handleResolve(supabase: SupabaseClient, body: ResolveRequest) {
  if (!body.org_id) {
    return jsonResponse({ error: 'org_id required' }, 400)
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', body.org_id)
    .single()
  if (orgErr || !org) return jsonResponse({ error: 'Org not found' }, 404)

  const { data: rows, error } = await supabase
    .from('org_integrations')
    .select('provider, status, credentials_encrypted, config, version, last_verified_at')
    .eq('org_id', org.id)
    .eq('status', 'active')

  if (error) return jsonResponse({ error: error.message }, 500)

  return jsonResponse({
    org: { id: org.id, name: org.name },
    integrations: rows || [],
  })
}

async function handleAutoClosePeriods(supabase: SupabaseClient) {
  // Delegates to the SQL RPC, which gates itself on the `service_role` grant.
  // The RPC reads org.pay_day_of_month + today's Asia/Jakarta date to freeze
  // the correct period for any org whose pay day matches today.
  const { data, error } = await supabase.rpc('auto_close_periods')
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse(data)
}

async function handleRunDailyAchievements(supabase: SupabaseClient) {
  // Awards tenure milestones (calendar-based) and compensation firsts
  // (24h-delayed) for every active employee across all orgs.
  const { data, error } = await supabase.rpc('run_daily_achievements')
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse(data)
}

async function handleRunMonthlyLeaderboard(supabase: SupabaseClient, body: { period_start?: string }) {
  // Snapshots last completed month's leaderboard and awards Podium / Number One /
  // Reigning Champion. Period defaults to last completed month in WIB if omitted.
  const args = body.period_start ? { p_period_start: body.period_start } : {}
  const { data, error } = await supabase.rpc('run_monthly_leaderboard', args)
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse(data)
}

async function handleListActiveOrgs(supabase: SupabaseClient) {
  // Distinct list of orgs that have an active fireflies integration (polling
  // target). Cron only needs orgs with fireflies — Asana is triggered inline
  // during processing, not on the poll loop.
  const { data, error } = await supabase
    .from('org_integrations')
    .select('org_id, organizations!inner(id, name)')
    .eq('status', 'active')
    .eq('provider', 'fireflies')

  if (error) return jsonResponse({ error: error.message }, 500)

  const seen = new Set<string>()
  const orgs: { id: string; name: string }[] = []
  for (const row of data || []) {
    if (seen.has(row.org_id)) continue
    seen.add(row.org_id)
    // @ts-expect-error Supabase join typing
    orgs.push({ id: row.organizations.id, name: row.organizations.name })
  }

  return jsonResponse({ orgs })
}

async function handleDedupClaim(supabase: SupabaseClient, body: DedupClaimRequest) {
  if (!body.org_id || !body.provider || !body.external_id) {
    return jsonResponse({ error: 'org_id, provider, external_id required' }, 400)
  }

  // Atomic claim-or-revive (see migration 209). Returns true iff this caller may
  // process the meeting: brand-new, or a 'failed' row still under the attempt
  // cap (revived to 'processing'). Concurrent webhook+poll can't both win.
  const { data, error } = await supabase.rpc('claim_meeting', {
    p_org: body.org_id,
    p_provider: body.provider,
    p_external_id: body.external_id,
    p_max_attempts: MAX_MEETING_ATTEMPTS,
  })

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ claimed: data === true })
}

async function handleMarkMeeting(supabase: SupabaseClient, body: MarkMeetingRequest) {
  if (!body.org_id || !body.provider || !body.external_id || typeof body.success !== 'boolean') {
    return jsonResponse({ error: 'org_id, provider, external_id, success required' }, 400)
  }

  // Record the outcome: 'done' on success, else 'failed' (poll-retryable) or
  // 'poison' once attempts are exhausted.
  const { error } = await supabase.rpc('mark_meeting', {
    p_org: body.org_id,
    p_provider: body.provider,
    p_external_id: body.external_id,
    p_success: body.success,
    p_max_attempts: MAX_MEETING_ATTEMPTS,
  })

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ ok: true })
}

async function handleLogProcessing(supabase: SupabaseClient, body: LogProcessingRequest) {
  if (!body.org_id || !body.provider || !body.external_id) {
    return jsonResponse({ error: 'org_id, provider, external_id required' }, 400)
  }

  const { error } = await supabase.from('processing_logs').insert({
    org_id: body.org_id,
    provider: body.provider,
    external_id: body.external_id,
    meeting_title: body.meeting_title ?? null,
    meeting_date: body.meeting_date ?? null,
    employees_matched: body.employees_matched ?? 0,
    tasks_created: body.tasks_created ?? 0,
    tasks_deduped: body.tasks_deduped ?? 0,
    tasks_failed: body.tasks_failed ?? 0,
    sop_updates_sent: body.sop_updates_sent ?? 0,
    unmatched_items: body.unmatched_items ?? 0,
    errors: body.errors && body.errors.length > 0 ? body.errors : null,
  })

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ ok: true })
}

async function testFireflies(apiKey: string): Promise<{ ok: boolean; details?: unknown; supports_webhooks?: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: '{ user { user_id email name integrations } }' }),
    })
    if (!res.ok) return { ok: false, error: `Fireflies returned ${res.status}` }
    const json = await res.json() as { data?: { user?: { user_id?: string; email?: string; name?: string; integrations?: string[] } }; errors?: unknown[] }
    if (json.errors || !json.data?.user?.user_id) {
      return { ok: false, error: 'Invalid API key or empty response' }
    }
    // Fireflies free plan doesn't expose a `plan` field via GraphQL. Best
    // heuristic: attempt to query something plan-gated and observe the error,
    // or just mark `supports_webhooks: null` and let the user pick in UI. For
    // now surface what we know and default to false.
    return {
      ok: true,
      details: json.data.user,
      supports_webhooks: false,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function testAsana(token: string): Promise<{ ok: boolean; details?: unknown; error?: string }> {
  try {
    const res = await fetch('https://app.asana.com/api/1.0/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, error: `Asana returned ${res.status}` }
    const json = await res.json()
    return { ok: true, details: json.data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function testOpenRouter(apiKey: string): Promise<{ ok: boolean; details?: unknown; error?: string }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return { ok: false, error: `OpenRouter returned ${res.status}` }
    const json = await res.json()
    return { ok: true, details: json.data }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function handleTestCredentials(body: TestCredentialsRequest) {
  if (!body.provider || !body.credentials) {
    return jsonResponse({ error: 'provider and credentials required' }, 400)
  }

  switch (body.provider) {
    case 'fireflies': {
      const key = body.credentials.api_key
      if (!key) return jsonResponse({ ok: false, error: 'api_key required' }, 400)
      return jsonResponse(await testFireflies(key))
    }
    case 'asana': {
      const token = body.credentials.access_token
      if (!token) return jsonResponse({ ok: false, error: 'access_token required' }, 400)
      return jsonResponse(await testAsana(token))
    }
    case 'openrouter': {
      const key = body.credentials.api_key
      if (!key) return jsonResponse({ ok: false, error: 'api_key required' }, 400)
      return jsonResponse(await testOpenRouter(key))
    }
    default:
      return jsonResponse({ error: 'Unsupported provider' }, 400)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (!authorizeWorker(req)) return jsonResponse({ error: 'Unauthorized' }, 401)

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/worker-config/, '').replace(/\/$/, '') || '/'

  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const supabase = getSupabaseAdmin()

  try {
    switch (path) {
      case '/resolve':
        return await handleResolve(supabase, body as ResolveRequest)
      case '/list-active-orgs':
        return await handleListActiveOrgs(supabase)
      case '/auto-close-periods':
        return await handleAutoClosePeriods(supabase)
      case '/run-daily-achievements':
        return await handleRunDailyAchievements(supabase)
      case '/run-monthly-leaderboard':
        return await handleRunMonthlyLeaderboard(supabase, body as { period_start?: string })
      case '/dedup-claim':
        return await handleDedupClaim(supabase, body as DedupClaimRequest)
      case '/mark-meeting':
        return await handleMarkMeeting(supabase, body as unknown as MarkMeetingRequest)
      case '/log-processing':
        return await handleLogProcessing(supabase, body as LogProcessingRequest)
      case '/test-credentials':
        return await handleTestCredentials(body as unknown as TestCredentialsRequest)
      default:
        return jsonResponse({ error: 'Not found', path }, 404)
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
