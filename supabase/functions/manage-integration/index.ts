// manage-integration — user-facing credential management.
//
// Called by the Flodok frontend. Authed with a Supabase user JWT; only users
// with role owner/admin in the target org can mutate.
//
// Actions (POST /manage-integration/:action):
//   test    — validate raw creds against the provider's whoami. Not persisted.
//   save    — encrypt + upsert. Tests creds against the provider BEFORE writing
//             (so a typo'd key can't land in the DB). Round-trip-verifies the
//             encrypted blob before returning success.
//   verify  — re-test the currently-saved creds against the provider, update
//             last_verified_at / last_error, return the per-step result.
//             Does not expose decrypted creds to the client.
//   delete  — remove the integration row. Audit trigger logs the action.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'
import { encryptJson, decryptJson } from '../_shared/crypto.ts'

type Provider = 'fireflies' | 'asana'

interface SaveRequest {
  provider: Provider
  credentials: Record<string, string>
  config?: Record<string, unknown>
}

interface TestRequest {
  provider: Provider
  credentials: Record<string, string>
}

interface VerifyRequest {
  provider: Provider
}

interface DeleteRequest {
  provider: Provider
}

interface TestResult {
  ok: boolean
  details?: unknown
  supports_webhooks?: boolean
  error?: string
}

// The "primary secret" we derive a display hint from, per provider. Hint is
// always the last 4 characters of this value — enough to identify a key at a
// glance without exposing it.
const HINT_FIELD_BY_PROVIDER: Record<Provider, string> = {
  fireflies: 'api_key',
  asana: 'access_token',
}

function makeCredentialHint(provider: Provider, credentials: Record<string, string>): string | null {
  const field = HINT_FIELD_BY_PROVIDER[provider]
  const val = credentials[field]
  if (!val || val.length < 4) return null
  return val.slice(-4)
}

function getSupabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL')!
}

function getWorkerToken(): string {
  return Deno.env.get('WORKER_SERVICE_TOKEN')!
}

async function authenticateUser(
  req: Request,
  admin: SupabaseClient,
): Promise<{ user_id: string; org_id: string; role: string } | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null

  const { data: row } = await admin
    .from('users')
    .select('id, org_id, role')
    .eq('id', data.user.id)
    .single()

  if (!row) return null
  return { user_id: row.id, org_id: row.org_id, role: row.role }
}

function requireAdmin(user: { role: string }): boolean {
  return user.role === 'owner' || user.role === 'admin'
}

// Hit worker-config/test-credentials. Both handleTest and handleSave use this.
async function callProviderTest(body: TestRequest): Promise<TestResult> {
  const res = await fetch(`${getSupabaseUrl()}/functions/v1/worker-config/test-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': getWorkerToken(),
    },
    body: JSON.stringify(body),
  })
  return (await res.json()) as TestResult
}

async function handleTest(body: TestRequest): Promise<Response> {
  if (!body.provider || !body.credentials) {
    return jsonResponse({ ok: false, error: 'provider and credentials required' }, 400)
  }
  const result = await callProviderTest(body)
  return jsonResponse(result)
}

async function handleSave(
  admin: SupabaseClient,
  user: { user_id: string; org_id: string },
  body: SaveRequest,
): Promise<Response> {
  if (!body.provider || !body.credentials) {
    return jsonResponse({ error: 'provider and credentials required' }, 400)
  }

  const key = Deno.env.get('ENCRYPTION_KEY')
  if (!key) return jsonResponse({ error: 'Server not configured' }, 500)

  // Test against the provider BEFORE we write. Catches typo'd keys at save
  // time instead of silently persisting junk that fails on the next cron.
  const testResult = await callProviderTest({ provider: body.provider, credentials: body.credentials })
  if (!testResult.ok) {
    return jsonResponse(
      { error: testResult.error || 'Credentials did not validate with the provider' },
      400,
    )
  }

  // Encrypt, then round-trip verify so a bad ENCRYPTION_KEY doesn't write
  // unrecoverable ciphertext.
  const ciphertext = await encryptJson(body.credentials, key)
  try {
    const roundtrip = await decryptJson<Record<string, string>>(ciphertext, key)
    const inputKeys = Object.keys(body.credentials).sort().join(',')
    const outputKeys = Object.keys(roundtrip).sort().join(',')
    if (inputKeys !== outputKeys) {
      return jsonResponse({ error: 'Encryption self-check failed (shape mismatch)' }, 500)
    }
  } catch (e) {
    return jsonResponse(
      { error: `Encryption self-check failed: ${e instanceof Error ? e.message : String(e)}` },
      500,
    )
  }

  // Merge the non-secret config bag with our computed credential_hint. The
  // hint is safe to expose (last 4 chars only) and appears on the public view.
  const hint = makeCredentialHint(body.provider, body.credentials)
  const config = { ...(body.config ?? {}), ...(hint ? { credential_hint: hint } : {}) }

  const { data, error } = await admin
    .from('org_integrations')
    .upsert(
      {
        org_id: user.org_id,
        provider: body.provider,
        status: 'active',
        credentials_encrypted: ciphertext,
        config,
        created_by: user.user_id,
        last_error: null,
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,provider' },
    )
    .select('id, version')
    .single()

  if (error) return jsonResponse({ error: error.message }, 500)

  return jsonResponse({ ok: true, id: data.id, version: data.version })
}

async function handleVerify(
  admin: SupabaseClient,
  user: { user_id: string; org_id: string },
  body: VerifyRequest,
): Promise<Response> {
  if (!body.provider) return jsonResponse({ error: 'provider required' }, 400)

  const key = Deno.env.get('ENCRYPTION_KEY')
  if (!key) return jsonResponse({ error: 'Server not configured' }, 500)

  // Fetch the encrypted blob for this org + provider.
  const { data: row, error: readErr } = await admin
    .from('org_integrations')
    .select('id, credentials_encrypted, config')
    .eq('org_id', user.org_id)
    .eq('provider', body.provider)
    .single()

  if (readErr || !row) return jsonResponse({ error: 'Integration not found' }, 404)

  // Decrypt, test, update verification stamps, return the result.
  let credentials: Record<string, string>
  try {
    credentials = await decryptJson<Record<string, string>>(row.credentials_encrypted, key)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin
      .from('org_integrations')
      .update({ status: 'error', last_error: `Decryption failed: ${msg}` })
      .eq('id', row.id)
    return jsonResponse({ ok: false, error: `Stored credentials could not be decrypted: ${msg}` }, 500)
  }

  const result = await callProviderTest({ provider: body.provider, credentials })

  // Backfill credential_hint if missing — row may pre-date this field. We've
  // already decrypted the creds for the test, so this is essentially free.
  const existingConfig = (row.config ?? {}) as { credential_hint?: string }
  const nextConfig = existingConfig.credential_hint
    ? existingConfig
    : { ...existingConfig, ...(makeCredentialHint(body.provider, credentials) ? { credential_hint: makeCredentialHint(body.provider, credentials) } : {}) }

  await admin
    .from('org_integrations')
    .update({
      last_verified_at: result.ok ? new Date().toISOString() : null,
      last_error: result.ok ? null : result.error ?? 'Provider test failed',
      status: result.ok ? 'active' : 'error',
      config: nextConfig,
    })
    .eq('id', row.id)

  return jsonResponse(result)
}

async function handleDelete(
  admin: SupabaseClient,
  user: { user_id: string; org_id: string },
  body: DeleteRequest,
): Promise<Response> {
  if (!body.provider) return jsonResponse({ error: 'provider required' }, 400)

  const { error } = await admin
    .from('org_integrations')
    .delete()
    .eq('org_id', user.org_id)
    .eq('provider', body.provider)

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ ok: true })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const admin = getSupabaseAdmin()
  const user = await authenticateUser(req, admin)
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
  if (!requireAdmin(user)) return jsonResponse({ error: 'Forbidden' }, 403)

  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/manage-integration/, '').replace(/\/$/, '') || '/'

  try {
    switch (path) {
      case '/test':
        return await handleTest(body as unknown as TestRequest)
      case '/save':
        return await handleSave(admin, user, body as unknown as SaveRequest)
      case '/verify':
        return await handleVerify(admin, user, body as unknown as VerifyRequest)
      case '/delete':
        return await handleDelete(admin, user, body as unknown as DeleteRequest)
      default:
        return jsonResponse({ error: 'Not found', path }, 404)
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
