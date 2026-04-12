import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import { translateSOP } from '../_shared/translate.ts'
import type { TranslationDirection } from '../_shared/translate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { sop_id, direction = 'en-to-id' } = await req.json()
    if (!sop_id) {
      return jsonResponse({ error: 'Missing required field: sop_id' }, 400)
    }

    const validDirections: TranslationDirection[] = ['en-to-id', 'id-to-en']
    if (!validDirections.includes(direction)) {
      return jsonResponse({ error: 'Invalid direction. Use "en-to-id" or "id-to-en"' }, 400)
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

    const sourceContent = direction === 'en-to-id' ? sop.content_markdown : sop.content_markdown_id
    if (!sourceContent) {
      return jsonResponse({ error: `No ${direction === 'en-to-id' ? 'English' : 'Indonesian'} content to translate` }, 400)
    }

    // Translate
    const { text: translated, error: translateError } = await translateSOP(sourceContent, direction)

    if (!translated) {
      return jsonResponse({ error: translateError || 'Translation failed' }, 502)
    }

    // Use admin client to write
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const updateField = direction === 'en-to-id'
      ? { content_markdown_id: translated }
      : { content_markdown: translated }

    await adminClient
      .from('sops')
      .update({ ...updateField, updated_at: new Date().toISOString() })
      .eq('id', sop.id)

    return jsonResponse({
      status: 'translated',
      sop_id: sop.id,
      direction,
    })
  } catch (err) {
    console.error('translate-sop error:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
  }
})
