import { describe, it, expect } from 'vitest'
import { orgDayKey, orgTime, buildAttendanceDays, hhmm } from './time'
import type { DashboardAttendanceRow } from './types'

const JKT = 'Asia/Jakarta'   // UTC+7
const MKS = 'Asia/Makassar'  // UTC+8

function ev(over: Partial<DashboardAttendanceRow> & { id: string; server_timestamp: string }): DashboardAttendanceRow {
  return {
    employee_id: 'e1',
    employee_name: 'Budi',
    event_type: 'clock_in',
    client_timestamp: null,
    latitude: null,
    longitude: null,
    accuracy_meters: null,
    within_geofence: null,
    distance_meters: null,
    location_name: null,
    on_office_network: null,
    geofence_radius_meters: null,
    status: 'recorded',
    selfie_path: null,
    is_auto: false,
    expected_start: '09:00',
    expected_end: '17:00',
    identity: {},
    ...over,
  } as DashboardAttendanceRow
}

describe('org-timezone rendering', () => {
  it('renders the wall clock the employee saw, not the viewer’s zone', () => {
    // 02:01 UTC is 09:01 in Jakarta — the whole point of the expected-hours read.
    expect(orgTime('2026-07-21T02:01:00Z', JKT)).toBe('09:01')
    expect(orgTime('2026-07-21T02:01:00Z', MKS)).toBe('10:01')
  })

  it('buckets an evening event onto the correct local day', () => {
    // 22:30 Jakarta on the 21st is still 15:30 UTC on the 21st...
    expect(orgDayKey('2026-07-21T15:30:00Z', JKT)).toBe('2026-07-21')
    // ...but 00:30 Jakarta on the 22nd is 17:30 UTC on the 21st. Slicing the
    // raw ISO would file this under the 21st and lose it from a date filter.
    expect(orgDayKey('2026-07-21T17:30:00Z', JKT)).toBe('2026-07-22')
  })

  it('falls back to a readable value on a bad zone rather than blanking', () => {
    expect(orgTime('2026-07-21T02:01:00Z', 'Not/AZone')).toMatch(/^\d{2}:\d{2}$/)
    expect(orgDayKey('2026-07-21T02:01:00Z', null)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('hhmm', () => {
  it('trims a postgres time to what <input type="time"> wants', () => {
    expect(hhmm('09:00:00')).toBe('09:00')
    expect(hhmm(null)).toBe('')
  })
})

describe('buildAttendanceDays', () => {
  it('pairs a normal in/out into one row carrying the expected hours', () => {
    const days = buildAttendanceDays([
      ev({ id: '1', server_timestamp: '2026-07-21T02:01:00Z', event_type: 'clock_in' }),
      ev({ id: '2', server_timestamp: '2026-07-21T10:34:00Z', event_type: 'clock_out' }),
    ], JKT)

    expect(days).toHaveLength(1)
    expect(days[0].day).toBe('2026-07-21')
    expect(orgTime(days[0].firstIn!.server_timestamp, JKT)).toBe('09:01')
    expect(orgTime(days[0].lastOut!.server_timestamp, JKT)).toBe('17:34')
    expect(days[0].expected_start).toBe('09:00')
    expect(days[0].sessions).toBe(1)
  })

  it('keeps an overnight shift as ONE row filed under the clock-in day', () => {
    // In 22:00 Mon, out 06:00 Tue (Jakarta). Naive day-bucketing would split
    // this into a Monday with no exit and a Tuesday with no entry.
    const days = buildAttendanceDays([
      ev({ id: '1', server_timestamp: '2026-07-20T15:00:00Z', event_type: 'clock_in' }),
      ev({ id: '2', server_timestamp: '2026-07-20T23:00:00Z', event_type: 'clock_out' }),
    ], JKT)

    expect(days).toHaveLength(1)
    expect(days[0].day).toBe('2026-07-20')
    expect(orgTime(days[0].firstIn!.server_timestamp, JKT)).toBe('22:00')
    expect(orgTime(days[0].lastOut!.server_timestamp, JKT)).toBe('06:00')
  })

  it('shows first-in and last-out across a lunch break, and counts sessions', () => {
    const days = buildAttendanceDays([
      ev({ id: '1', server_timestamp: '2026-07-21T02:00:00Z', event_type: 'clock_in' }),
      ev({ id: '2', server_timestamp: '2026-07-21T05:00:00Z', event_type: 'clock_out' }),
      ev({ id: '3', server_timestamp: '2026-07-21T06:00:00Z', event_type: 'clock_in' }),
      ev({ id: '4', server_timestamp: '2026-07-21T10:00:00Z', event_type: 'clock_out' }),
    ], JKT)

    expect(days).toHaveLength(1)
    expect(days[0].sessions).toBe(2)
    expect(orgTime(days[0].firstIn!.server_timestamp, JKT)).toBe('09:00')
    expect(orgTime(days[0].lastOut!.server_timestamp, JKT)).toBe('17:00')
  })

  it('surfaces a missing clock-out instead of dropping the day', () => {
    const days = buildAttendanceDays([
      ev({ id: '1', server_timestamp: '2026-07-21T02:01:00Z', event_type: 'clock_in' }),
    ], JKT)

    expect(days).toHaveLength(1)
    expect(days[0].firstIn).not.toBeNull()
    expect(days[0].lastOut).toBeNull()
  })

  it('keeps an orphan clock-out visible on its own day', () => {
    const days = buildAttendanceDays([
      ev({ id: '1', server_timestamp: '2026-07-21T10:00:00Z', event_type: 'clock_out' }),
    ], JKT)

    expect(days).toHaveLength(1)
    expect(days[0].firstIn).toBeNull()
    expect(days[0].lastOut).not.toBeNull()
  })

  it('separates employees and sorts newest day first', () => {
    const days = buildAttendanceDays([
      ev({ id: '1', server_timestamp: '2026-07-20T02:00:00Z', employee_id: 'e1', employee_name: 'Budi' }),
      ev({ id: '2', server_timestamp: '2026-07-21T02:00:00Z', employee_id: 'e2', employee_name: 'Sari' }),
    ], JKT)

    expect(days).toHaveLength(2)
    expect(days[0].day).toBe('2026-07-21')
    expect(days[0].employee_name).toBe('Sari')
    expect(days[1].employee_name).toBe('Budi')
  })
})
