import { corsHeaders, jsonResponse, getSupabaseAdmin, validateApiKey } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabase = getSupabaseAdmin()
    const apiKeyRecord = await validateApiKey(req, supabase)

    if (!apiKeyRecord) {
      return jsonResponse({ error: 'Invalid API key' }, 401)
    }

    const url = new URL(req.url)
    const includeSop = url.searchParams.get('include_sop') !== 'false' // default true

    // Get employees
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, phone, email')
      .eq('org_id', apiKeyRecord.org_id)
      .order('name')

    if (!includeSop) {
      return jsonResponse({ employees: employees || [] })
    }

    // Fetch SOPs for all employees in the org
    const { data: sops } = await supabase
      .from('sops')
      .select('id, employee_id, title, content_markdown, current_version, updated_at')
      .eq('org_id', apiKeyRecord.org_id)

    const sopByEmployee = new Map(
      (sops || []).map(s => [s.employee_id, {
        id: s.id,
        title: s.title,
        content_markdown: s.content_markdown,
        current_version: s.current_version,
        updated_at: s.updated_at,
      }])
    )

    const employeesWithSops = (employees || []).map(emp => ({
      ...emp,
      sop: sopByEmployee.get(emp.id) || null,
    }))

    return jsonResponse({ employees: employeesWithSops })
  } catch {
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
