// Leave Request (Formulir Permintaan Cuti) — the curated field superset +
// client-side validation. The server (portal_submit_leave_request, migration
// 151) re-validates and recomputes total_days authoritatively; this mirror is
// for instant UX only.

import type { FormIdentity } from './registry'

export const LEAVE_TYPES = [
  'annual',          // Cuti Tahunan
  'unpaid',          // Cuti Tidak Dibayar / Izin
  'national_holiday',// Libur Nasional / Penggantian
  'sick_no_note',    // Cuti Sakit tanpa Surat Dokter
  'sick_with_note',  // Cuti Sakit dengan Surat Dokter
  'short_time',      // Datang Terlambat / Pulang Cepat
  'special',         // Cuti Khusus
] as const
export type LeaveType = typeof LEAVE_TYPES[number]

export interface LeaveFieldData {
  leave_type: LeaveType
  date_start: string            // YYYY-MM-DD
  date_end?: string             // YYYY-MM-DD (defaults to date_start server-side)
  total_days?: number           // server-computed
  short_time_from?: string      // HH:MM (short_time only)
  short_time_to?: string        // HH:MM
  reason?: string
  replacement_employee_ids?: string[]  // ≤ 2, same-org employees
  identity?: FormIdentity
}

/** Inclusive day span; mirrors the server's (date_end - date_start) + 1. */
export function computeTotalDays(start: string, end?: string): number {
  if (!start) return 0
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end || start}T00:00:00`)
  const ms = e.getTime() - s.getTime()
  if (Number.isNaN(ms) || ms < 0) return 0
  return Math.floor(ms / 86_400_000) + 1
}

/** Returns a list of field keys that fail validation (empty = valid). */
export function validateLeave(d: Partial<LeaveFieldData>): string[] {
  const errs: string[] = []
  if (!d.leave_type || !LEAVE_TYPES.includes(d.leave_type)) errs.push('leave_type')
  if (d.leave_type === 'short_time') {
    if (!d.date_start) errs.push('date_start')
    if (!d.short_time_from || !d.short_time_to) errs.push('short_time')
  } else {
    if (!d.date_start) errs.push('date_start')
    if (d.date_start && d.date_end && d.date_end < d.date_start) errs.push('date_range')
  }
  if ((d.replacement_employee_ids?.length ?? 0) > 2) errs.push('replacements')
  return errs
}
