// Confidence judgement for a single attendance event. GPS is noisy, so we
// weigh reported distance against its ±accuracy and the geofence radius; the
// office network is a GPS-independent confirmer that short-circuits to on-site.

import type { AttendanceConfidence } from './types'

export function attendanceConfidence(r: {
  within_geofence: boolean | null
  distance_meters: number | null
  accuracy_meters: number | null
  geofence_radius_meters: number | null
  on_office_network: boolean | null
}): AttendanceConfidence {
  if (r.on_office_network === true) return 'on_site' // network confirms, GPS-independent
  const { distance_meters: d, accuracy_meters: a, geofence_radius_meters: rad } = r
  if (r.within_geofence == null || d == null || rad == null) return 'none' // no geofence to judge
  const acc = a ?? 0
  if (d + acc <= rad) return 'on_site' // even worst-case GPS is inside
  if (d - acc > rad) return 'off_site' // even best-case GPS is outside
  return 'inconclusive' // straddles / weak GPS
}
