// Pair the blocks of a dual-language imported document (P4 of Upload &
// Analyse). Given the ordered plain-text blocks of a single .docx that holds
// BOTH English and Bahasa Indonesia, label each block's language and pair each
// English passage with its Indonesian translation, so the client can assemble
// a true bilingual DocumentDoc (instead of a monolingual one).
//
// Text-only, cheap, JSON-mode. Reuses the same OpenRouter key + analysis model
// as analyse-document (OPENROUTER_ANALYSIS_MODEL, default
// google/gemini-2.5-flash-lite) — no vision needed, the .docx was already
// extracted to text client-side by mammoth. This is opt-in (the import modal
// only calls it when the user ticks "this document has both languages").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import { extractUsage, logAiUsage } from '../_shared/logUsage.ts'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Guardrails on payload size — letters are short; this is plenty and keeps a
// runaway upload off our token bill.
const MAX_BLOCKS = 400
const MAX_BLOCK_CHARS = 1500

const SYSTEM_PROMPT = `You are given the ordered text blocks of ONE document that contains BOTH English and Bahasa Indonesia (a bilingual document). Each block is one paragraph, heading, or list item. The two languages may alternate block-by-block, be split into two halves, or be interleaved.

Your job: reconstruct the document as bilingual ROWS by pairing each English block with its Indonesian translation.

Return ONLY a JSON object, no markdown fences, no commentary:
{ "pairs": [ { "en": <block index or null>, "id": <block index or null> }, ... ] }

Rules:
- Indices are 0-based positions in the input array.
- Each pair links one English block to its Indonesian translation. When a block has no counterpart (a shared heading, a date line, a reference number, a signature block), emit it as a pair with the OTHER side null.
- Every input index MUST appear EXACTLY ONCE across all pairs — never drop a block, never use an index twice.
- Preserve the document's natural reading order in the "pairs" array.
- Decide each block's language from its actual text, not its position.`

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return jsonResponse({ error: 'Not authenticated' }, 401)

  let body: { blocks?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
    return jsonResponse({ error: 'Expected a non-empty `blocks` array' }, 400)
  }
  const blocks = body.blocks
    .slice(0, MAX_BLOCKS)
    .map(b => (typeof b === 'string' ? b : ''))
    .map(b => (b.length > MAX_BLOCK_CHARS ? b.slice(0, MAX_BLOCK_CHARS) : b))
  const n = blocks.length

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY not set' }, 500)
  }
  const model = Deno.env.get('OPENROUTER_ANALYSIS_MODEL') || 'google/gemini-2.5-flash-lite'

  const blockList = blocks.map((b, i) => `[${i}] ${b.replace(/\s+/g, ' ').trim()}`).join('\n')

  let modelResponse: Response
  try {
    modelResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://flodok.com',
        'X-Title': 'Flodok Bilingual Pairing',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Blocks (index: text):\n${blockList}\n\nReturn the pairs JSON.` },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
        usage: { include: true },
      }),
    })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Model call failed' }, 502)
  }

  if (!modelResponse.ok) {
    const text = await modelResponse.text().catch(() => '')
    console.error('OpenRouter pairing failed:', modelResponse.status, text)
    return jsonResponse({ error: `OpenRouter returned ${modelResponse.status}` }, 502)
  }

  const completion = await modelResponse.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: unknown
  } | null
  const content = completion?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return jsonResponse({ error: 'Empty model response' }, 502)
  }

  await logAiUsage({ functionName: 'pair-bilingual', model, calledBy: user.user.id, usage: extractUsage(completion) })

  let parsed: { pairs?: unknown }
  try {
    parsed = JSON.parse(content)
  } catch {
    return jsonResponse({ error: 'Model returned invalid JSON' }, 502)
  }

  // Sanitize: keep only well-formed pairs with in-range indices, each index
  // used at most once. Whatever the model misses, the client appends as
  // monolingual rows so no block is ever lost.
  const seen = new Set<number>()
  const validIndex = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n) return null
    if (seen.has(v)) return null
    seen.add(v)
    return v
  }
  const rawPairs = Array.isArray(parsed.pairs) ? parsed.pairs : []
  const pairs: Array<{ en: number | null; id: number | null }> = []
  for (const p of rawPairs) {
    if (!p || typeof p !== 'object') continue
    const en = validIndex((p as { en?: unknown }).en)
    const id = validIndex((p as { id?: unknown }).id)
    if (en === null && id === null) continue
    pairs.push({ en, id })
  }

  return jsonResponse({ pairs })
})
