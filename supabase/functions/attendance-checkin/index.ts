import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'

const BUCKET = 'attendance_photos'
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX = 5 * 1024 * 1024

type Admin = ReturnType<typeof getSupabaseAdmin>

async function resolveEmployee(admin: Admin, slug: string, token: string): Promise<{ id: string; org_id: string } | null> {
  if (!slug || !token) return null
  const { data } = await admin.from('employees')
    .select('id, org_id, deleted_at').eq('slug', slug).eq('access_token', token).single()
  if (!data || data.deleted_at) return null
  return { id: data.id, org_id: data.org_id }
}

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (cf || xff || req.headers.get('x-real-ip') || '').trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const admin = getSupabaseAdmin()
  let form: FormData
  try { form = await req.formData() } catch { return jsonResponse({ error: 'Invalid form data' }, 400) }

  const slug = String(form.get('slug') ?? '')
  const token = String(form.get('access_token') ?? '')
  const eventType = String(form.get('event_type') ?? '')
  const accuracyRaw = String(form.get('accuracy_meters') ?? '')
  const clientTimestamp = String(form.get('client_timestamp') ?? '')
  const file = form.get('selfie')

  const lat = Number(form.get('latitude') ?? '')
  const lon = Number(form.get('longitude') ?? '')
  const accuracy = accuracyRaw !== '' && Number.isFinite(Number(accuracyRaw)) ? Number(accuracyRaw) : null

  const emp = await resolveEmployee(admin, slug, token)
  if (!emp) return jsonResponse({ error: 'Invalid portal credentials' }, 401)
  if (!(file instanceof File)) return jsonResponse({ error: 'Missing selfie' }, 400)
  if (!ALLOWED.includes(file.type)) return jsonResponse({ error: 'Invalid file type' }, 400)
  if (file.size > MAX) return jsonResponse({ error: 'File too large' }, 400)
  if (eventType !== 'clock_in' && eventType !== 'clock_out') return jsonResponse({ error: 'Invalid event_type' }, 400)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonResponse({ error: 'Valid coordinates required' }, 400)

  const ext = EXT[file.type] ?? 'jpg'
  const path = `${emp.org_id}/${emp.id}/${crypto.randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (upErr) return jsonResponse({ error: upErr.message }, 500)

  // Any failure after the upload must clean up the orphaned selfie.
  try {
    const { data, error: rpcErr } = await admin.rpc('portal_record_attendance', {
      emp_slug: slug,
      emp_token: token,
      p_event_type: eventType,
      p_latitude: lat,
      p_longitude: lon,
      p_accuracy_meters: accuracy,
      p_selfie_path: path,
      p_client_timestamp: clientTimestamp || null,
      p_ip_address: clientIp(req),
      p_user_agent: req.headers.get('user-agent') ?? '',
    })
    if (rpcErr) {
      await admin.storage.from(BUCKET).remove([path]).catch(() => {})
      return jsonResponse({ error: rpcErr.message }, 400)
    }
    return jsonResponse({ ok: true, event: data })
  } catch (err) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
    return jsonResponse({ error: (err as Error)?.message ?? 'Attendance failed' }, 500)
  }
})
