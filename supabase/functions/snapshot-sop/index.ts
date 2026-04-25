// HTTP wrapper for the centralized snapshot helper.
//
// Browser callers (SOPEdit, ContractEdit, Pending) hit this endpoint with a
// user JWT — we use the user's own client so RLS still gates which docs they
// can write. Internal Deno callers (sop-updates webhook) bypass this and
// import _shared/snapshot.ts directly with the admin client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import { writeSnapshot, type SnapshotInput } from '../_shared/snapshot.ts'

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

    const body = await req.json()
    if (!body.doc_id || !body.changed_by) {
      return jsonResponse({ error: 'Missing required fields: doc_id, changed_by' }, 400)
    }
    const table = body.table === 'contracts' ? 'contracts' : 'sops'

    const input: SnapshotInput = {
      table,
      doc_id: body.doc_id,
      new_content_en: body.new_content_en,
      new_content_id: body.new_content_id,
      auto_translate: body.auto_translate,
      change_summary: body.change_summary,
      changed_by: body.changed_by,
      base_wage_idr: body.base_wage_idr,
      allowance_idr: body.allowance_idr,
      hours_per_day: body.hours_per_day,
      days_per_week: body.days_per_week,
      employee_id: body.employee_id,
    }

    // The snapshot helper writes to *_versions with `translation_status` and
    // `resolved_markdown_*`. RLS on those tables only checks the parent doc
    // belongs to the caller's org — service role isn't required.
    const result = await writeSnapshot(supabase, input)
    return jsonResponse(result)
  } catch (err) {
    console.error('snapshot-sop error:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
  }
})
