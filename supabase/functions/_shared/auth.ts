import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-worker-token, x-worker-org-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Validates a Bearer API key from the Authorization header.
 * Returns the api_key record (id, org_id) or null if invalid.
 * Updates last_used_at on success.
 */
export async function validateApiKey(
  req: Request,
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<{ id: string; org_id: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer flk_')) return null

  const apiKey = authHeader.slice(7) // Remove 'Bearer '
  const keyHash = await hashApiKey(apiKey)

  const { data: apiKeyRecord } = await supabase
    .from('api_keys')
    .select('id, org_id')
    .eq('key_hash', keyHash)
    .single()

  if (!apiKeyRecord) return null

  // Update last_used_at (fire and forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKeyRecord.id)
    .then(() => {})

  return apiKeyRecord
}

/**
 * Validates the Cloudflare Worker's service token against WORKER_SERVICE_TOKEN.
 * The Worker passes the org it's acting for via the `X-Worker-Org-Id` header.
 * Returns `{ org_id }` on success, null otherwise.
 *
 * Use alongside validateApiKey for endpoints that serve both external API-key
 * callers and the internal Worker (employees, sop-updates).
 */
export function validateWorkerToken(req: Request): { org_id: string } | null {
  const token = req.headers.get('x-worker-token')
  const expected = Deno.env.get('WORKER_SERVICE_TOKEN')
  if (!token || !expected) return null
  if (token.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null

  const orgId = req.headers.get('x-worker-org-id')
  if (!orgId) return null
  return { org_id: orgId }
}

/**
 * Unified auth: accepts either a Bearer `flk_*` API key OR the Worker's
 * service token. Returns `{ org_id }` for both; callers don't need to know
 * which path was used.
 */
export async function validateWorkerOrApiKey(
  req: Request,
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<{ org_id: string } | null> {
  const worker = validateWorkerToken(req)
  if (worker) return worker
  const apiKey = await validateApiKey(req, supabase)
  if (apiKey) return { org_id: apiKey.org_id }
  return null
}
