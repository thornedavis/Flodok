// Rewrite-on-demand endpoint for the editor's selection bubble menu.
//
// Caller sends a short string + action (improve | proofread | explain)
// and gets the result back synchronously. Stateless and uncached —
// rewrites are intentional, one-off edits, not reusable like
// translations. Mirrors translate-text's auth/CORS shape.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import { rewriteText, isRewriteAction } from '../_shared/rewrite.ts'

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

  // Authenticate the caller (members-only); we don't read any org data
  // here, but we still require a valid session to gate model usage.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return jsonResponse({ error: 'Not authenticated' }, 401)

  let body: { text?: unknown; action?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (typeof body.text !== 'string') return jsonResponse({ error: 'Missing text' }, 400)
  if (!isRewriteAction(body.action)) return jsonResponse({ error: 'Invalid action' }, 400)

  const text = body.text.trim()
  if (!text) return jsonResponse({ result: '' })

  const { text: result, error } = await rewriteText(text, body.action, {
    functionName: 'rewrite-text',
    calledBy: user.user.id,
  })
  if (!result) return jsonResponse({ error: error || 'Rewrite failed' }, 502)

  return jsonResponse({ result: result.trim() })
})
