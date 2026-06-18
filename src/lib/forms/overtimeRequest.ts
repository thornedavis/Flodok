// Overtime Request (Formulir Pengajuan Lembur) — repeatable line-items with
// server-computed totals. The server (portal_submit_overtime_request, migration
// 151) recomputes per-line hours and the totals; this mirror is for UX.

import type { FormIdentity } from './registry'

export const WORK_STATUSES = ['permanent', 'contract', 'daily', 'piecework'] as const
export type WorkStatus = typeof WORK_STATUSES[number]  // Permanen / Kontrak / Harian / Borongan

export interface OvertimeLineItem {
  work_date: string        // YYYY-MM-DD
  is_ot_day: boolean       // rest-day / holiday overtime
  start_time: string       // HH:MM
  end_time: string         // HH:MM
  total_hours?: number     // server-computed
  reason?: string
}

export interface OvertimeFieldData {
  work_status: WorkStatus
  total_ot_hours?: number  // server-computed sum
  total_ot_days?: number   // server-computed
  identity?: FormIdentity
}

/** Hours between two HH:MM times on the same day (0 if invalid / non-positive). */
export function computeHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if ([sh, sm, eh, em].some(Number.isNaN)) return 0
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) return 0
  return Math.round((mins / 60) * 100) / 100
}

export function sumHours(lines: OvertimeLineItem[]): number {
  return Math.round(lines.reduce((acc, l) => acc + computeHours(l.start_time, l.end_time), 0) * 100) / 100
}

/** Returns a list of error keys (empty = valid). */
export function validateOvertime(d: Partial<OvertimeFieldData>, lines: OvertimeLineItem[]): string[] {
  const errs: string[] = []
  if (!d.work_status || !WORK_STATUSES.includes(d.work_status)) errs.push('work_status')
  if (!lines || lines.length === 0) {
    errs.push('lines')
    return errs
  }
  lines.forEach((l, i) => {
    if (!l.work_date) errs.push(`line_${i}_date`)
    if (!l.start_time || !l.end_time || computeHours(l.start_time, l.end_time) <= 0) errs.push(`line_${i}_time`)
  })
  return errs
}
