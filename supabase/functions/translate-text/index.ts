// Translate-on-demand endpoint for the editor's BubbleMenu (Phase F).
//
// Caller sends a short string + direction and gets the translation
// back synchronously. Unlike `translate-sop`, this doesn't touch any
// document — it's a stateless text-in / text-out service the
// selection-translate UI in DocumentEditor uses to fill the paired
// blockBody with a translation of the highlighted text.
//
// The `translation_cache` table is consulted before calling
// OpenRouter so a selection that's been translated before in the
// same org returns instantly. Cache writes are best-effort: a
// failure to write doesn't fail the request, since the model has
// already produced a usable translation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import { translateSOP, type TranslationDirection } from '../_shared/translate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // We use the caller's JWT so cache reads/writes respect the
  // members-read-own-org RLS policy on translation_cache.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  let body: { text?: unknown; direction?: unknown; org_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (typeof body.text !== 'string') return jsonResponse({ error: 'Missing text' }, 400)
  if (body.direction !== 'en-to-id' && body.direction !== 'id-to-en') {
    return jsonResponse({ error: 'Invalid direction' }, 400)
  }
  const text = body.text.trim()
  if (!text) return jsonResponse({ translated: '' })
  const direction = body.direction as TranslationDirection

  // Need the caller's org_id for the cache lookup/insert. Without it
  // we'd still be functional (just no cache) — but it's cheap to grab
  // from the users table, so we always do.
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return jsonResponse({ error: 'Not authenticated' }, 401)
  const { data: profile } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.user.id)
    .single()
  const orgId = (profile as { org_id?: string } | null)?.org_id ?? null

  // ── Cache lookup ──
  const hash = await sha256Hex(text)
  if (orgId) {
    const { data: cached } = await supabase
      .from('translation_cache')
      .select('translated_content')
      .eq('source_hash', hash)
      .eq('direction', direction)
      .eq('org_id', orgId)
      .maybeSingle()
    if (cached?.translated_content) {
      return jsonResponse({ translated: cached.translated_content as string, cached: true })
    }
  }

  // ── Model call ──
  const result = await translateSOP(text, direction, {
    functionName: 'translate-text',
    orgId,
    calledBy: user.user.id,
  })
  if (!result.text) {
    return jsonResponse({ error: result.error || 'Translation failed' }, 502)
  }
  const translated = result.text.trim()

  // ── Cache insert (best-effort) ──
  if (orgId) {
    await supabase
      .from('translation_cache')
      .insert({
        source_hash: hash,
        direction,
        org_id: orgId,
        source_excerpt: text.slice(0, 500),
        translated_content: translated,
        model: Deno.env.get('OPENROUTER_TRANSLATION_MODEL') || null,
      })
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          // 23505 = unique_violation, which is fine — another save
          // wrote the same entry first.
          console.warn('translation_cache insert failed:', error.message)
        }
      })
  }

  return jsonResponse({ translated, cached: false })
})

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
