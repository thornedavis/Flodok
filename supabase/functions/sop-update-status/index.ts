import { corsHeaders, jsonResponse, getSupabaseAdmin, validateApiKey } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabase = getSupabaseAdmin()
    const apiKeyRecord = await validateApiKey(req, supabase)

    if (!apiKeyRecord) {
      return jsonResponse({ error: 'Invalid API key' }, 401)
    }

    // Extract update ID from URL path or query param
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const updateId = pathParts[pathParts.length - 1] || url.searchParams.get('id')

    if (!updateId) {
      return jsonResponse({ error: 'Missing update ID' }, 400)
    }

    // Get update status (scoped to org)
    const { data: update } = await supabase
      .from('pending_updates')
      .select('id, status, created_at, resolved_at')
      .eq('id', updateId)
      .eq('org_id', apiKeyRecord.org_id)
      .single()

    if (!update) {
      return jsonResponse({ error: 'Update not found' }, 404)
    }

    return jsonResponse(update)
  } catch {
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
