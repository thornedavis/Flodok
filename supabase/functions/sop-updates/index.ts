// Supabase Edge Function: POST /api/sop-updates
// Handles SOP update proposals from external AI pipeline

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer flk_')) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = authHeader.slice(7) // Remove 'Bearer '

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Hash the API key and find matching key
    const encoder = new TextEncoder()
    const data = encoder.encode(apiKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const { data: apiKeyRecord } = await supabase
      .from('api_keys')
      .select('id, org_id')
      .eq('key_hash', keyHash)
      .single()

    if (!apiKeyRecord) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update last_used_at
    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyRecord.id)

    // Parse request body
    const body = await req.json()
    const { employee_phone, changes, source_meeting } = body

    if (!employee_phone || !changes) {
      return new Response(JSON.stringify({ error: 'Missing required fields: employee_phone, changes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get org settings
    const { data: org } = await supabase
      .from('organizations')
      .select('review_mode, default_country_code')
      .eq('id', apiKeyRecord.org_id)
      .single()

    // Normalize phone number
    let phone = employee_phone.replace(/[\s\-.()\[\]]/g, '')
    const countryCode = org?.default_country_code || '+62'
    if (phone.startsWith('0')) {
      phone = countryCode + phone.slice(1)
    } else if (!phone.startsWith('+')) {
      const codeDigits = countryCode.replace('+', '')
      if (phone.startsWith(codeDigits)) {
        phone = '+' + phone
      } else {
        phone = countryCode + phone
      }
    }

    // Find employee by phone
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('org_id', apiKeyRecord.org_id)
      .eq('phone', phone)
      .single()

    if (!employee) {
      // Unmatched — create pending update for manager triage
      const { data: update } = await supabase
        .from('pending_updates')
        .insert({
          org_id: apiKeyRecord.org_id,
          employee_id: null,
          employee_identifier: employee_phone,
          proposed_changes: { changes },
          source_meeting: source_meeting || null,
          status: 'pending',
        })
        .select('id')
        .single()

      return new Response(JSON.stringify({ status: 'unmatched', update_id: update?.id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Employee matched
    if (org?.review_mode) {
      // Insert as pending
      const { data: update } = await supabase
        .from('pending_updates')
        .insert({
          org_id: apiKeyRecord.org_id,
          employee_id: employee.id,
          employee_identifier: employee_phone,
          proposed_changes: { changes },
          source_meeting: source_meeting || null,
          status: 'pending',
        })
        .select('id')
        .single()

      return new Response(JSON.stringify({ status: 'pending', update_id: update?.id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auto-apply: update SOP directly
    const { data: sop } = await supabase
      .from('sops')
      .select('*')
      .eq('employee_id', employee.id)
      .single()

    if (sop) {
      const newContent = changes
        .map((c: { section?: string; content_markdown?: string; summary?: string }) =>
          `## ${c.section || 'Update'}\n\n${c.content_markdown || c.summary || ''}`
        )
        .join('\n\n')

      const mergedContent = sop.content_markdown
        ? `${sop.content_markdown}\n\n${newContent}`
        : newContent

      const newVersion = sop.current_version + 1

      await Promise.all([
        supabase.from('sops').update({
          content_markdown: mergedContent,
          current_version: newVersion,
          updated_at: new Date().toISOString(),
        }).eq('id', sop.id),
        supabase.from('sop_versions').insert({
          sop_id: sop.id,
          version_number: newVersion,
          content_markdown: mergedContent,
          change_summary: `Auto-applied from ${source_meeting || 'API'}`,
          changed_by: 'api',
        }),
      ])
    }

    // Record for audit trail
    const { data: update } = await supabase
      .from('pending_updates')
      .insert({
        org_id: apiKeyRecord.org_id,
        employee_id: employee.id,
        employee_identifier: employee_phone,
        proposed_changes: { changes },
        source_meeting: source_meeting || null,
        status: 'auto_applied',
        resolved_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    return new Response(JSON.stringify({ status: 'applied', update_id: update?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
