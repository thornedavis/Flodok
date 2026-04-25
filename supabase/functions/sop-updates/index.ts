import { corsHeaders, jsonResponse, getSupabaseAdmin, validateWorkerOrApiKey } from '../_shared/auth.ts'
import { normalizePhone } from '../_shared/phone.ts'
import { writeSnapshot } from '../_shared/snapshot.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabase = getSupabaseAdmin()
    const authed = await validateWorkerOrApiKey(req, supabase)

    if (!authed) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    // Parse request body
    const body = await req.json()
    const { employee_phone, changes, source_meeting } = body

    if (!employee_phone || !changes) {
      return jsonResponse({ error: 'Missing required fields: employee_phone, changes' }, 400)
    }

    // Get org settings
    const { data: org } = await supabase
      .from('organizations')
      .select('review_mode, default_country_code')
      .eq('id', authed.org_id)
      .single()

    // Normalize phone number
    const phone = normalizePhone(employee_phone, org?.default_country_code || '+62')

    // Find employee by phone
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('org_id', authed.org_id)
      .eq('phone', phone)
      .single()

    if (!employee) {
      // Unmatched — create pending update for manager triage
      const { data: update } = await supabase
        .from('pending_updates')
        .insert({
          org_id: authed.org_id,
          employee_id: null,
          employee_identifier: employee_phone,
          proposed_changes: { changes },
          source_meeting: source_meeting || null,
          status: 'pending',
        })
        .select('id')
        .single()

      return jsonResponse({ status: 'unmatched', update_id: update?.id })
    }

    // Employee matched
    if (org?.review_mode) {
      const { data: update } = await supabase
        .from('pending_updates')
        .insert({
          org_id: authed.org_id,
          employee_id: employee.id,
          employee_identifier: employee_phone,
          proposed_changes: { changes },
          source_meeting: source_meeting || null,
          status: 'pending',
        })
        .select('id')
        .single()

      return jsonResponse({ status: 'pending', update_id: update?.id })
    }

    // Auto-apply: update SOP directly
    const { data: sop } = await supabase
      .from('sops')
      .select('*')
      .eq('employee_id', employee.id)
      .single()

    if (sop) {
      // If change_type is "revision", the content is a full SOP replacement
      // Otherwise, append as before (backwards compatible)
      const isRevision = changes.some((c: { change_type?: string }) => c.change_type === 'revision')

      let mergedContent: string
      if (isRevision) {
        // Use the first revision's content as the full replacement
        const revision = changes.find((c: { change_type?: string }) => c.change_type === 'revision')
        mergedContent = revision?.content_markdown || sop.content_markdown
      } else {
        const newContent = changes
          .map((c: { section?: string; content_markdown?: string; summary?: string }) =>
            `## ${c.section || 'Update'}\n\n${c.content_markdown || c.summary || ''}`
          )
          .join('\n\n')
        mergedContent = sop.content_markdown
          ? `${sop.content_markdown}\n\n${newContent}`
          : newContent
      }

      // Funnel through the shared snapshot writer so this path produces the
      // same version-row columns (resolved_markdown_*, translation_status)
      // as user-driven saves. The helper handles EN→ID translation, the
      // live-row update, and the snapshot insert.
      await writeSnapshot(supabase, {
        table: 'sops',
        doc_id: sop.id,
        new_content_en: mergedContent,
        change_summary: `Auto-applied from ${source_meeting || 'API'}`,
        changed_by: 'api',
      })
    }

    // Record for audit trail
    const { data: update } = await supabase
      .from('pending_updates')
      .insert({
        org_id: authed.org_id,
        employee_id: employee.id,
        employee_identifier: employee_phone,
        proposed_changes: { changes },
        source_meeting: source_meeting || null,
        status: 'auto_applied',
        resolved_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    return jsonResponse({ status: 'applied', update_id: update?.id })
  } catch {
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
