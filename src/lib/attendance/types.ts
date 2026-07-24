// Hand-written types for the attendance feature. The attendance_* tables are
// not in the generated Supabase types (they're accessed via the RPC-shim in
// ./api.ts), so these describe the JSON shapes returned by the portal and
// dashboard RPCs.

export type AttendanceEventType = 'clock_in' | 'clock_out'
export type AttendanceStatus = 'recorded' | 'flagged' | 'excused'
export type AttendanceConfidence = 'on_site' | 'off_site' | 'inconclusive' | 'none'

export interface AttendanceLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_active: boolean
  office_cidrs: string[]
  is_primary: boolean
}

export interface PortalAttendanceItem {
  id: string
  event_type: AttendanceEventType
  server_timestamp: string
  within_geofence: boolean | null
  status: AttendanceStatus
  /** Reference shift hours as HH:MM, or null when none is configured. Shown
   *  next to the actual times; never used to compute lateness (migration 215). */
  expected_start: string | null
  expected_end: string | null
}

export interface DashboardAttendanceRow {
  id: string
  employee_id: string
  employee_name: string | null
  event_type: AttendanceEventType
  server_timestamp: string
  client_timestamp: string | null
  latitude: number | null
  longitude: number | null
  accuracy_meters: number | null
  within_geofence: boolean | null
  distance_meters: number | null
  location_name: string | null
  on_office_network: boolean | null
  geofence_radius_meters: number | null
  status: AttendanceStatus
  selfie_path: string | null
  is_auto: boolean
  /** Effective reference shift hours as HH:MM — the employee's own override,
   *  else the org default, else null. Informational only (migration 215). */
  expected_start: string | null
  expected_end: string | null
  identity: Record<string, unknown>
}
