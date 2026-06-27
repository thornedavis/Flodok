// Token-validated KTP/KK upload for the unauthenticated employee portal.
//
// After migration 142 privatized the employee_docs bucket, its only write/read
// policies are "to authenticated" + org-scoped — so an anon portal caller can
// neither upload nor sign-for-render and hits a raw RLS error. This function
// performs those operations as the service role AFTER validating the portal
// credential (slug + access_token), mirroring sign-contract-ip's portal auth.
//
// The storage path is constructed SERVER-SIDE from the validated employee id
// (`<employee_id>/<kind>.<ext>`); the client filename is never trusted, so a
// caller cannot write to another employee's prefix or traverse paths.
//
// Three actions:
//   - multipart POST (file + slug + access_token + kind)  -> upload, return { path, signedUrl }
//   - JSON { action: 'sign',   slug, access_token, path } -> return { signedUrl }
//   - JSON { action: 'remove', slug, access_token, path } -> delete, return { ok: true }

import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'

const BUCKET = 'employee_docs'
const ALLOWED_KINDS = ['ktp', 'kk']
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const SIGNED_URL_TTL = 3600

type Admin = ReturnType<typeof getSupabaseAdmin>

// Resolve + authorize the portal caller. Returns the employee id, or null.
// A trashed employee is rejected (its token is also rotated on trash).
async function resolveEmployee(admin: Admin, slug: string, token: string): Promise<string | null> {
  if (!slug || !token) return null
  const { data } = await admin
    .from('employees')
    .select('id, deleted_at')
    .eq('slug', slug)
    .eq('access_token', token)
    .single()
  if (!data || data.deleted_at) return null
  return data.id
}

// Every storage path must live under the validated employee's own prefix.
function ownsPath(employeeId: string, path: string): boolean {
  return typeof path === 'string' && path.startsWith(`${employeeId}/`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const admin = getSupabaseAdmin()
  const contentType = req.headers.get('content-type') ?? ''

  // ── JSON actions: sign / remove an existing object ──────────────────────────
  if (contentType.includes('application/json')) {
    let body: { action?: string; slug?: string; access_token?: string; path?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }
    const empId = await resolveEmployee(admin, body.slug ?? '', body.access_token ?? '')
    if (!empId) return jsonResponse({ error: 'Invalid portal credentials' }, 401)

    const path = body.path ?? ''
    if (!ownsPath(empId, path)) return jsonResponse({ error: 'Forbidden path' }, 403)

    if (body.action === 'remove') {
      const { error } = await admin.storage.from(BUCKET).remove([path])
      if (error) return jsonResponse({ error: error.message }, 500)
      return jsonResponse({ ok: true })
    }

    // Default JSON action: sign for render.
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
    if (error) return jsonResponse({ error: error.message }, 500)
    return jsonResponse({ signedUrl: data?.signedUrl ?? null })
  }

  // ── Multipart: upload a KTP/KK image ───────────────────────────────────────
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse({ error: 'Unsupported content type' }, 400)
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonResponse({ error: 'Invalid form data' }, 400)
  }

  const slug = String(form.get('slug') ?? '')
  const token = String(form.get('access_token') ?? '')
  const kind = String(form.get('kind') ?? '')
  const file = form.get('file')

  const empId = await resolveEmployee(admin, slug, token)
  if (!empId) return jsonResponse({ error: 'Invalid portal credentials' }, 401)
  if (!ALLOWED_KINDS.includes(kind)) return jsonResponse({ error: 'Invalid document kind' }, 400)
  if (!(file instanceof File)) return jsonResponse({ error: 'Missing file' }, 400)
  if (!ALLOWED_TYPES.includes(file.type)) return jsonResponse({ error: 'Invalid file type' }, 400)
  if (file.size > MAX_SIZE) return jsonResponse({ error: 'File too large' }, 400)

  // Server-constructed path — client filename is never used.
  const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
  const path = `${empId}/${kind}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (upErr) return jsonResponse({ error: upErr.message }, 500)

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return jsonResponse({ path, signedUrl: signed?.signedUrl ?? null })
})
