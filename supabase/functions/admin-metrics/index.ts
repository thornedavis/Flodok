// admin-metrics — platform-admin-only read of OpenRouter account totals.
//
// The Founder Console's per-org/per-function AI breakdowns come from the
// ai_usage table (admin_ai_usage RPC). This endpoint complements that with the
// ACCOUNT-LEVEL truth from OpenRouter itself: total credits purchased and total
// usage all-time. That covers spend from before we instrumented logging, and
// the Fireflies worker (flodok-router) which isn't yet logging per-call. Reuses
// the existing OPENROUTER_API_KEY secret.
//
// Gated on users.is_platform_admin (the caller reads their own row under RLS).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return jsonResponse({ error: 'Not authenticated' }, 401)

  const { data: profile } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (!(profile as { is_platform_admin?: boolean } | null)?.is_platform_admin) {
    return jsonResponse({ error: 'Not authorized' }, 403)
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'OPENROUTER_API_KEY not set' }, 500)

  // OpenRouter: GET /api/v1/credits → { data: { total_credits, total_usage } }.
  // All amounts are USD. Never let an upstream hiccup 500 the console — return
  // a null-ish payload the panel renders as "unavailable".
  try {
    const res = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('OpenRouter credits failed:', res.status, body)
      return jsonResponse({ available: false, status: res.status })
    }
    const json = await res.json().catch(() => null) as { data?: { total_credits?: number; total_usage?: number } } | null
    const totalCredits = json?.data?.total_credits ?? null
    const totalUsage = json?.data?.total_usage ?? null
    const balance = totalCredits !== null && totalUsage !== null ? totalCredits - totalUsage : null
    return jsonResponse({
      available: true,
      total_credits: totalCredits,
      total_usage: totalUsage,
      balance,
    })
  } catch (err) {
    console.error('admin-metrics error:', err)
    return jsonResponse({ available: false, error: err instanceof Error ? err.message : String(err) })
  }
})
