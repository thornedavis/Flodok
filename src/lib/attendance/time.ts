// Timezone-correct rendering + day pairing for the attendance log.
//
// Two problems this solves:
//
//   1. Timestamps were rendered with a bare toLocaleString(), i.e. in the
//      VIEWER's browser timezone. A WITA clock-in read by a Jakarta accountant
//      (or anyone on a travelling laptop) displayed shifted by whole hours —
//      which matters a lot now that the reading is "09:01 against an expected
//      09:00". Everything here formats in the ORG's IANA timezone
//      (organizations.timezone, default 'Asia/Jakarta') so every reader sees
//      the same wall clock the employee did.
//
//   2. The log is a flat event stream. To judge a day you had to find two rows
//      and pair them by eye. buildAttendanceDays() does that pairing.
//
// Note on what is deliberately absent: nothing here computes lateness. We put
// the expected hours next to the actual ones and stop. The reader decides.

import type { DashboardAttendanceRow } from './types'

// ─── Timezone-aware formatting ──────────────────────────────────────────────

// Intl throws on an unknown IANA zone; the column is NOT NULL with a sane
// default, but a bad value must never blank the whole log.
function safeZone(timeZone: string | null | undefined): string | undefined {
  if (!timeZone) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return undefined
  }
}

function parts(iso: string, timeZone: string | undefined, opts: Intl.DateTimeFormatOptions) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).formatToParts(d)
}

function pick(p: Intl.DateTimeFormatPart[] | null, type: Intl.DateTimeFormatPartTypes): string {
  return p?.find(x => x.type === type)?.value ?? ''
}

/** Calendar day (YYYY-MM-DD) that an instant falls on in the org's timezone. */
export function orgDayKey(iso: string, timeZone: string | null): string {
  const p = parts(iso, safeZone(timeZone), { year: 'numeric', month: '2-digit', day: '2-digit' })
  if (!p) return ''
  return `${pick(p, 'year')}-${pick(p, 'month')}-${pick(p, 'day')}`
}

/** Wall-clock time (HH:MM, 24h) in the org's timezone — matches how the
 *  expected hours are stored, so the two read as a like-for-like pair. */
export function orgTime(iso: string | null, timeZone: string | null): string {
  if (!iso) return '—'
  const p = parts(iso, safeZone(timeZone), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  if (!p) return '—'
  return `${pick(p, 'hour')}:${pick(p, 'minute')}`
}

/** Full date + time in the org's timezone, for the event log and photo modal. */
export function orgDateTime(iso: string | null, timeZone: string | null, lang: 'en' | 'id'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
    timeZone: safeZone(timeZone),
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
}

/** Readable day heading for a YYYY-MM-DD key, e.g. "Tue 21 Jul 2026". */
export function formatDayKey(dayKey: string, lang: 'en' | 'id'): string {
  const d = new Date(`${dayKey}T12:00:00Z`) // midday avoids any date rollover
  if (Number.isNaN(d.getTime())) return dayKey
  return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

/** Short zone label for the column header — "WIB" in id, "GMT+7" in en. */
export function zoneLabel(timeZone: string | null, lang: 'en' | 'id'): string {
  const zone = safeZone(timeZone)
  if (!zone) return ''
  try {
    const p = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      timeZone: zone, timeZoneName: 'short',
    }).formatToParts(new Date())
    return p.find(x => x.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** Postgres `time` reads back as "09:00:00"; <input type="time"> wants "09:00".
 *  Empty string for null so it round-trips through a controlled input. */
export function hhmm(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : ''
}

// ─── Day pairing ────────────────────────────────────────────────────────────

export interface AttendanceDay {
  key: string
  employee_id: string
  employee_name: string | null
  /** YYYY-MM-DD in the org timezone, taken from the day the session STARTED. */
  day: string
  expected_start: string | null
  expected_end: string | null
  firstIn: DashboardAttendanceRow | null
  lastOut: DashboardAttendanceRow | null
  /** Completed or open in/out pairs on this day — >1 means they clocked out
   *  and back in (a lunch break, a site visit). */
  sessions: number
  /** Every event that rolled up into this row, for the expanded detail. */
  events: DashboardAttendanceRow[]
}

interface Session {
  clockIn: DashboardAttendanceRow | null
  clockOut: DashboardAttendanceRow | null
}

/**
 * Roll the flat event stream up into one row per employee per day.
 *
 * Events are paired chronologically (each clock-in with the clock-out that
 * follows it) and the pair is filed under the day the clock-IN happened. That
 * matters for an overnight shift — clock in 22:00 Mon, out 06:00 Tue reads as
 * one Monday row, not a Monday with no exit plus a Tuesday with no entry.
 * Unmatched events survive as a half-filled row rather than being dropped: a
 * missing clock-out is exactly the kind of thing the reader needs to see.
 */
export function buildAttendanceDays(
  rows: DashboardAttendanceRow[],
  timeZone: string | null,
): AttendanceDay[] {
  const byEmployee = new Map<string, DashboardAttendanceRow[]>()
  for (const r of rows) {
    const list = byEmployee.get(r.employee_id)
    if (list) list.push(r)
    else byEmployee.set(r.employee_id, [r])
  }

  const days = new Map<string, AttendanceDay>()

  for (const [employeeId, events] of byEmployee) {
    const ordered = [...events].sort((a, b) => a.server_timestamp.localeCompare(b.server_timestamp))

    // Walk forward, opening a session on each clock-in and closing it on the
    // next clock-out. A clock-out with nothing open is its own orphan session.
    const sessions: Session[] = []
    let open: Session | null = null
    for (const ev of ordered) {
      if (ev.event_type === 'clock_in') {
        if (open) sessions.push(open) // two ins in a row — the first never closed
        open = { clockIn: ev, clockOut: null }
      } else {
        if (open) {
          open.clockOut = ev
          sessions.push(open)
          open = null
        } else {
          sessions.push({ clockIn: null, clockOut: ev })
        }
      }
    }
    if (open) sessions.push(open)

    for (const s of sessions) {
      const anchor = s.clockIn ?? s.clockOut
      if (!anchor) continue
      const day = orgDayKey(anchor.server_timestamp, timeZone)
      const key = `${employeeId}|${day}`

      let row = days.get(key)
      if (!row) {
        row = {
          key,
          employee_id: employeeId,
          employee_name: anchor.employee_name,
          day,
          expected_start: anchor.expected_start,
          expected_end: anchor.expected_end,
          firstIn: null,
          lastOut: null,
          sessions: 0,
          events: [],
        }
        days.set(key, row)
      }

      if (s.clockIn && (!row.firstIn || s.clockIn.server_timestamp < row.firstIn.server_timestamp)) {
        row.firstIn = s.clockIn
      }
      if (s.clockOut && (!row.lastOut || s.clockOut.server_timestamp > row.lastOut.server_timestamp)) {
        row.lastOut = s.clockOut
      }
      row.sessions += 1
      if (s.clockIn) row.events.push(s.clockIn)
      if (s.clockOut) row.events.push(s.clockOut)
    }
  }

  return [...days.values()].sort((a, b) =>
    b.day.localeCompare(a.day) || (a.employee_name ?? '').localeCompare(b.employee_name ?? ''),
  )
}
