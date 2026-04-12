import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
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
