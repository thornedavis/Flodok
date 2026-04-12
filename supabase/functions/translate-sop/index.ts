import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'
import { translateToIndonesian } from '../_shared/translate.ts'

/**
 * POST /translate-sop
 * Called by the dashboard after any SOP save (manual edit, approval, etc.)
 * Translates the current English content to Indonesian and updates the record.
 *
 * Body: { sop_id: string }
 * Auth: Supabase JWT (dashboard user)
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabase = getSupabaseAdmin()

    // Verify the user is authenticated via Supabase JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { sop_id } = await req.json()
    if (!sop_id) {
      return jsonResponse({ error: 'Missing required field: sop_id' }, 400)
    }

    // Fetch the current SOP
    const { data: sop, error: sopError } = await supabase
      .from('sops')
      .select('id, content_markdown, content_markdown_id')
      .eq('id', sop_id)
      .single()

    if (sopError || !sop) {
      return jsonResponse({ error: 'SOP not found' }, 404)
    }

    if (!sop.content_markdown) {
      return jsonResponse({ error: 'SOP has no English content to translate' }, 400)
    }

    // Translate
    const translated = await translateToIndonesian(sop.content_markdown)

    if (!translated) {
      return jsonResponse({ error: 'Translation failed' }, 502)
    }

    // Update the SOP with the Indonesian translation
    await supabase
      .from('sops')
      .update({
        content_markdown_id: translated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id)

    return jsonResponse({
      status: 'translated',
      sop_id: sop.id,
    })
  } catch {
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
