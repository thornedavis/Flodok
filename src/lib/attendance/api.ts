// Thin wrappers for the attendance workflow. The attendance RPCs (migration
// 196) aren't in the generated Supabase types yet, so we call them through a
// typed shim — the same cast pattern src/lib/forms/api.ts uses. The portal
// clock-in write goes through the attendance-checkin edge function (multipart
// selfie upload); reads/list go through SECURITY DEFINER RPCs.

import { supabase } from '../supabase'
import type {
  AttendanceEventType,
  PortalAttendanceItem,
  DashboardAttendanceRow,
  AttendanceLocation,
} from './types'

const ATT_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendance-checkin`
const CLIENT_IP_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-ip`
const ATT_FN_AUTH = { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }

type RpcResult = { data: unknown; error: { message: string } | null }
type RpcFn = (name: string, params?: Record<string, unknown>) => PromiseLike<RpcResult>
// NB: bind to the client — a bare `supabase.rpc` reference loses its `this`,
// and supabase-js's rpc() reaches for `this.rest` (→ "reading 'rest'" crash).
const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn

export async function recordAttendance(opts: {
  slug: string; token: string; eventType: AttendanceEventType
  latitude: number; longitude: number; accuracyMeters: number | null
  selfie: Blob; clientTimestamp: string
}): Promise<void> {
  const form = new FormData()
  form.append('slug', opts.slug)
  form.append('access_token', opts.token)
  form.append('event_type', opts.eventType)
  form.append('latitude', String(opts.latitude))
  form.append('longitude', String(opts.longitude))
  form.append('accuracy_meters', opts.accuracyMeters == null ? '' : String(opts.accuracyMeters))
  form.append('client_timestamp', opts.clientTimestamp)
  form.append('selfie', opts.selfie, 'selfie.jpg')
  const res = await fetch(ATT_FN_URL, { method: 'POST', headers: ATT_FN_AUTH, body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`)
}

export async function listPortalAttendance(slug: string, token: string): Promise<PortalAttendanceItem[]> {
  const { data, error } = await rpc('portal_list_attendance', { emp_slug: slug, emp_token: token })
  if (error) throw new Error(error.message)
  return (data as PortalAttendanceItem[]) ?? []
}

export async function listDashboardAttendance(): Promise<DashboardAttendanceRow[]> {
  const { data, error } = await rpc('attendance_dashboard_list')
  if (error) throw new Error(error.message)
  return (data as DashboardAttendanceRow[]) ?? []
}

export async function signAttendancePhoto(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('attendance_photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export async function listAttendanceLocations(): Promise<AttendanceLocation[]> {
  const { data, error } = await rpc('attendance_locations_list')
  if (error) throw new Error(error.message)
  return (data as AttendanceLocation[]) ?? []
}

export async function upsertAttendanceLocation(loc: {
  id?: string | null
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_active: boolean
  office_cidrs: string[]
}): Promise<AttendanceLocation> {
  const { data, error } = await rpc('attendance_location_upsert', {
    p_id: loc.id ?? null,
    p_name: loc.name,
    p_latitude: loc.latitude,
    p_longitude: loc.longitude,
    p_radius_meters: loc.radius_meters,
    p_is_active: loc.is_active,
    p_office_cidrs: loc.office_cidrs,
  })
  if (error) throw new Error(error.message)
  return data as AttendanceLocation
}

export async function deleteAttendanceLocation(id: string): Promise<void> {
  const { error } = await rpc('attendance_location_delete', { p_id: id })
  if (error) throw new Error(error.message)
}

export async function setPrimaryAttendanceLocation(id: string): Promise<void> {
  const { error } = await rpc('attendance_location_set_primary', { p_id: id })
  if (error) throw new Error(error.message)
}

// Best-effort public IP of the current connection, via the client-ip edge fn.
// Returns '' on any failure so callers can degrade gracefully.
export async function fetchClientIp(): Promise<string> {
  try {
    const res = await fetch(CLIENT_IP_FN_URL, { headers: ATT_FN_AUTH })
    if (!res.ok) return ''
    const json = (await res.json().catch(() => ({}))) as { ip?: string }
    return json.ip ?? ''
  } catch {
    return ''
  }
}
