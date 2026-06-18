// Captures the signer's public IP onto a contract_signatures row.
//
// The browser cannot read its own public IP, so the client inserts the
// signature first (carrying user_agent, consent_text, document_hash,
// signer_email/phone) and immediately calls this endpoint with the
// signature id. Cloudflare populates CF-Connecting-IP for us; we copy
// that onto the row, but only if ip_address is still null (so a row
// can't be re-stamped after the fact).
//
// Two auth paths:
//   - Employer side: standard user JWT in Authorization header. The user
//     must own (or admin) the org that owns the contract.
//   - Employee/candidate side: portal callers don't have a JWT, so they
//     pass { slug, access_token } from the URL. We resolve the employee
//     and verify the signature row belongs to a contract for the same
//     employee.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'

interface Body {
  signature_id: string
  // Which signatures table the id lives in. Defaults to 'contract' for
  // backward compatibility; NDAs pass 'nda' to stamp nda_signatures.
  doc_type?: 'contract' | 'nda'
  // Employee/candidate auth (no JWT available in the portal):
  slug?: string
  access_token?: string
}

function readClientIp(req: Request): string | null {
  const cf = req.headers.get('CF-Connecting-IP')
  if (cf) return cf.trim()
  const xff = req.headers.get('X-Forwarded-For')
  if (xff) return xff.split(',')[0].trim()
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (!body.signature_id) return jsonResponse({ error: 'Missing signature_id' }, 400)

  const ip = readClientIp(req)
  if (!ip) {
    // Nothing to record. Return success so the caller doesn't treat it as
    // a hard failure — IP is best-effort, the rest of the row stands alone.
    return jsonResponse({ ok: true, ip: null })
  }

  const admin = getSupabaseAdmin()
  const sigTable = body.doc_type === 'nda' ? 'nda_signatures' : 'contract_signatures'

  // Pull the signature so we can check both ownership paths. The ownership
  // columns (employee_id / signer_user_id) are identical across the contract
  // and nda signatures tables, so the checks below are table-agnostic.
  const { data: sig, error: sigErr } = await admin
    .from(sigTable)
    .select('id, employee_id, signer_user_id, ip_address')
    .eq('id', body.signature_id)
    .single()
  if (sigErr || !sig) return jsonResponse({ error: 'Signature not found' }, 404)
  if (sig.ip_address) return jsonResponse({ ok: true, ip: sig.ip_address, alreadySet: true })

  // ── Path A: candidate/employee via slug + access_token ───────────────
  if (body.slug && body.access_token) {
    const { data: emp } = await admin
      .from('employees')
      .select('id')
      .eq('slug', body.slug)
      .eq('access_token', body.access_token)
      .single()
    if (!emp) return jsonResponse({ error: 'Invalid portal credentials' }, 401)
    if (sig.employee_id !== emp.id) {
      return jsonResponse({ error: 'Signature does not belong to this candidate' }, 403)
    }
  } else {
    // ── Path B: employer via user JWT ──────────────────────────────────
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return jsonResponse({ error: 'Invalid token' }, 401)
    if (sig.signer_user_id !== userData.user.id) {
      // The signature row records who signed; we only let that same user
      // patch its IP. Prevents an admin from later "claiming" another
      // signer's IP.
      return jsonResponse({ error: 'Signature was not signed by this user' }, 403)
    }
  }

  const { error: updErr } = await admin
    .from(sigTable)
    .update({ ip_address: ip })
    .eq('id', body.signature_id)
    .is('ip_address', null) // Idempotency / anti-replay guard.
  if (updErr) return jsonResponse({ error: updErr.message }, 500)

  return jsonResponse({ ok: true, ip })
})
