// AI usage logging — fire-and-forget capture of OpenRouter token + cost data
// for the Founder Console's AI-cost panel (Phase 2). See docs/founder-console.md.
//
// Every AI edge function adds `usage: { include: true }` to its OpenRouter
// request body so the response carries a `usage` object (token counts AND cost
// in USD — OpenRouter does the pricing, so we never maintain a rate table).
// After a successful call, the function passes that object here and we insert a
// row into public.ai_usage using the service-role client (the table is
// admin-read-only via RLS; service role bypasses it).
//
// Logging must NEVER break the user's request: every path is wrapped so a
// logging failure only console.errors. We await the insert (one fast indexed
// write, negligible next to a multi-second model call) so the row is durable
// before the edge function returns.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Shape OpenRouter returns when the request includes `usage: { include: true }`.
// All fields optional — providers/models vary, and we degrade gracefully.
export interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost?: number
}

// Pull the usage object off any OpenRouter chat-completion JSON. Returns null
// when absent (e.g. the request didn't opt into usage accounting).
export function extractUsage(json: unknown): OpenRouterUsage | null {
  if (!json || typeof json !== 'object') return null
  const u = (json as { usage?: unknown }).usage
  if (!u || typeof u !== 'object') return null
  return u as OpenRouterUsage
}

export interface LogUsageOpts {
  functionName: string
  model: string
  // org attribution — pass orgId when the caller already knows it; otherwise
  // pass calledBy (the auth user id) and we resolve their org via a lookup.
  orgId?: string | null
  calledBy?: string | null
  usage: OpenRouterUsage | null | undefined
}

export async function logAiUsage(opts: LogUsageOpts): Promise<void> {
  const u = opts.usage
  if (!u) return
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return
    const admin = createClient(url, key)

    let orgId = opts.orgId ?? null
    if (!orgId && opts.calledBy) {
      const { data } = await admin
        .from('users')
        .select('org_id')
        .eq('id', opts.calledBy)
        .maybeSingle()
      orgId = (data as { org_id?: string } | null)?.org_id ?? null
    }

    const prompt = u.prompt_tokens ?? 0
    const completion = u.completion_tokens ?? 0
    await admin.from('ai_usage').insert({
      org_id: orgId,
      called_by: opts.calledBy ?? null,
      function_name: opts.functionName,
      model: opts.model,
      provider: 'openrouter',
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: u.total_tokens ?? (prompt + completion),
      cost_usd: typeof u.cost === 'number' ? u.cost : null,
    })
  } catch (err) {
    console.error('ai_usage log failed:', err)
  }
}
