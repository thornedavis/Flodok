// Attendance log — read-only V1. Every clock-in / clock-out event the viewer
// can see (RLS-scoped, owner/admin/hr), with location, time, geofence status
// and a live-captured selfie. Employee search + status/geofence filter panel,
// mirroring the Forms list page.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { FilterSearchInput, FilterPanel, type FilterPanelSection } from '../../components/FilterControls'
import { Skeleton } from '../../components/Skeleton'
import { Modal } from '../../components/Modal'
import { StatCard } from '../../components/Metrics'
import { ConfidenceLegend } from '../../components/attendance/ConfidenceLegend'
import { listDashboardAttendance, signAttendancePhoto } from '../../lib/attendance/api'
import { attendanceConfidence } from '../../lib/attendance/confidence'
import type { DashboardAttendanceRow, AttendanceStatus, AttendanceConfidence } from '../../lib/attendance/types'
import type { Translations } from '../../lib/translations'
import type { User } from '../../types/aliases'

const STATUSES: AttendanceStatus[] = ['recorded', 'flagged', 'excused']

export function Attendance({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const navigate = useNavigate()

  const [rows, setRows] = useState<DashboardAttendanceRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [confidenceFilter, setConfidenceFilter] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [photoRow, setPhotoRow] = useState<DashboardAttendanceRow | null>(null)

  useEffect(() => { load() }, [user.id, user.org_id])

  async function load() {
    setLoading(true)
    try {
      const data = await listDashboardAttendance()
      setRows(data)
    } catch {
      setRows([])
    }
    setLoading(false)
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter.length > 0 && !statusFilter.includes(r.status)) return false
      if (confidenceFilter.length > 0 && !confidenceFilter.includes(confidenceBucket(r))) return false
      if (dateFrom || dateTo) {
        const d = (r.server_timestamp ?? '').slice(0, 10)
        if (dateFrom && d < dateFrom) return false
        if (dateTo && d > dateTo) return false
      }
      if (!q) return true
      return r.employee_name?.toLowerCase().includes(q) ?? false
    })
  }, [rows, search, statusFilter, confidenceFilter, dateFrom, dateTo])

  // At-a-glance summary for TODAY (local day), computed from the loaded window.
  const todayStats = useMemo(() => {
    const today = new Date().toDateString()
    const todays = rows.filter(r => new Date(r.server_timestamp).toDateString() === today)
    const clockedIn = new Set(todays.filter(r => r.event_type === 'clock_in').map(r => r.employee_id)).size
    // "present now" = employees whose most recent event today is a clock_in.
    const latest = new Map<string, DashboardAttendanceRow>()
    for (const r of todays) {
      const prev = latest.get(r.employee_id)
      if (!prev || r.server_timestamp > prev.server_timestamp) latest.set(r.employee_id, r)
    }
    let presentNow = 0
    for (const r of latest.values()) if (r.event_type === 'clock_in') presentNow++
    const flaggedToday = todays.filter(r => r.status === 'flagged').length
    const evaluated = todays.filter(r => r.within_geofence !== null)
    const inside = evaluated.filter(r => r.within_geofence === true).length
    const onsiteRate = evaluated.length > 0 ? Math.round((inside / evaluated.length) * 100) : null
    return { clockedIn, presentNow, flaggedToday, onsiteRate }
  }, [rows])

  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect', key: 'status', label: t.attendanceFilterStatus, value: statusFilter, onChange: setStatusFilter,
      options: STATUSES.map(s => ({ id: s, label: attendanceStatusLabel(s, t), count: rows.filter(r => r.status === s).length })),
    },
    {
      type: 'multiselect', key: 'confidence', label: t.attendanceFilterGeofence, value: confidenceFilter, onChange: setConfidenceFilter,
      options: [
        { id: 'on_site', label: t.attendanceConfidenceOnSite, count: rows.filter(r => confidenceBucket(r) === 'on_site').length },
        { id: 'unclear', label: t.attendanceConfidenceUnclear, count: rows.filter(r => confidenceBucket(r) === 'unclear').length },
        { id: 'off_site', label: t.attendanceConfidenceOffSite, count: rows.filter(r => confidenceBucket(r) === 'off_site').length },
      ],
    },
    {
      type: 'daterange', key: 'date', label: t.documentsFilterDate,
      from: dateFrom, to: dateTo,
      onFromChange: setDateFrom, onToChange: setDateTo,
      fromLabel: t.documentsFilterDateFrom, toLabel: t.documentsFilterDateTo,
    },
  ]

  const anyFilterActive = search.trim().length > 0 || statusFilter.length > 0 || confidenceFilter.length > 0 || !!dateFrom || !!dateTo

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.attendanceTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.attendanceSubtitle}</p>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard/attendance/locations')}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
              title={t.attendanceManageLocations}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{t.attendanceManageLocations}</span>
            </button>
          </div>
        )}
      </div>

      {!loading && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t.attendanceCardClockedInToday} value={String(todayStats.clockedIn)} emphasis />
          <StatCard label={t.attendanceCardPresentNow} value={String(todayStats.presentNow)} />
          <StatCard label={t.attendanceCardFlaggedToday} value={String(todayStats.flaggedToday)} tone={todayStats.flaggedToday > 0 ? 'danger' : undefined} />
          <StatCard label={t.attendanceCardOnsiteRate} value={todayStats.onsiteRate == null ? '—' : `${todayStats.onsiteRate}%`} />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterPanel
          triggerLabel={t.filterButtonLabel}
          sections={filterSections}
          onReset={() => { setStatusFilter([]); setConfidenceFilter([]); setDateFrom(''); setDateTo('') }}
        />
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput value={search} onChange={setSearch} placeholder={t.attendanceSearchPlaceholder} />
          </div>
        </div>
      </div>

      <details className="group mb-5 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
        <summary
          className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform group-open:rotate-90" aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {t.attendanceConfidenceHelp}
        </summary>
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--color-border)' }}>
          <ConfidenceLegend t={t} />
        </div>
      </details>

      {loading ? (
        <TableSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState message={anyFilterActive ? t.attendanceNoMatches : t.attendanceEmptyAll} />
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <tr>
                <Th>{t.attendanceColEmployee}</Th>
                <Th>{t.attendanceColTime}</Th>
                <Th>{t.attendanceColType}</Th>
                <Th>{t.attendanceColLocation}</Th>
                <Th>{t.attendanceColGeofence}</Th>
                <Th>{t.attendanceColStatus}</Th>
                <Th>{t.attendanceColPhoto}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{r.employee_name ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatTimestamp(r.server_timestamp, lang)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {r.event_type === 'clock_in' ? t.attendanceEventClockIn : t.attendanceEventClockOut}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    <div className="flex flex-col">
                      <span>{r.location_name ?? '—'}</span>
                      <a
                        href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {t.attendanceViewOnMap}
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3"><ConfidenceBadge row={r} t={t} /></td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} t={t} /></td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setPhotoRow(r)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                    >
                      {t.attendanceViewPhoto}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {photoRow && (
        <PhotoModal
          row={photoRow}
          t={t}
          lang={lang}
          onClose={() => setPhotoRow(null)}
        />
      )}
    </div>
  )
}

// ─── Cells / badges ─────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
      {children}
    </th>
  )
}

function attendanceStatusLabel(s: AttendanceStatus, t: Translations): string {
  switch (s) {
    case 'recorded': return t.attendanceStatusRecorded
    case 'flagged':  return t.attendanceStatusFlagged
    case 'excused':  return t.attendanceStatusExcused
  }
}

function StatusBadge({ status, t }: { status: AttendanceStatus; t: Translations }) {
  const palette: Record<AttendanceStatus, { bg: string; fg: string }> = {
    recorded: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    flagged:  { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',  fg: 'var(--color-danger)' },
    excused:  { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
  }
  const { bg, fg } = palette[status]
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {attendanceStatusLabel(status, t)}
    </span>
  )
}

// Bucket a row into one of three filterable confidence states. `none` (no
// geofence to judge) is folded into `unclear` for counting/filtering.
function confidenceBucket(r: DashboardAttendanceRow): 'on_site' | 'off_site' | 'unclear' {
  const c = attendanceConfidence(r)
  return c === 'on_site' ? 'on_site' : c === 'off_site' ? 'off_site' : 'unclear'
}

const CONFIDENCE_PALETTE: Record<AttendanceConfidence, { bg: string; fg: string } | null> = {
  on_site:      { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
  off_site:     { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',  fg: 'var(--color-danger)' },
  inconclusive: { bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)', fg: 'var(--color-warning)' },
  none:         null,
}

function confidenceLabel(c: AttendanceConfidence, t: Translations): string {
  switch (c) {
    case 'on_site':  return t.attendanceConfidenceOnSite
    case 'off_site': return t.attendanceConfidenceOffSite
    default:         return t.attendanceConfidenceUnclear
  }
}

function ConfidenceBadge({ row, t }: { row: DashboardAttendanceRow; t: Translations }) {
  const confidence = attendanceConfidence(row)
  const palette = CONFIDENCE_PALETTE[confidence]
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {palette == null ? (
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        ) : (
          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: palette.bg, color: palette.fg }}>
            {confidenceLabel(confidence, t)}
          </span>
        )}
        {row.on_office_network === true && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}
            title={t.attendanceOnOfficeNetwork}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            {t.attendanceOnOfficeNetwork}
          </span>
        )}
      </span>
      {row.distance_meters != null && row.on_office_network !== true && (
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{Math.round(row.distance_meters)} m</span>
      )}
    </div>
  )
}

function formatTimestamp(iso: string | null, lang: 'en' | 'id'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')
}

// ─── Photo modal — lazily signs the private-bucket path on open ─────────────

function PhotoModal({ row, t, lang, onClose }: { row: DashboardAttendanceRow; t: Translations; lang: 'en' | 'id'; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    signAttendancePhoto(row.selfie_path)
      .then(signed => { if (alive) setUrl(signed) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [row.selfie_path])

  return (
    <Modal open onClose={onClose} title={`${row.employee_name ?? '—'} · ${formatTimestamp(row.server_timestamp, lang)}`}>
      <div className="flex min-h-[16rem] items-center justify-center">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : url ? (
          <img src={url} alt={t.attendanceColPhoto} className="max-h-[70vh] w-full rounded-lg object-contain" />
        ) : (
          <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        )}
      </div>
    </Modal>
  )
}

// ─── List states ────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border py-12 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
      {message}
    </div>
  )
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }} role="status" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t px-4 py-3.5 first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="ml-auto h-6 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}
