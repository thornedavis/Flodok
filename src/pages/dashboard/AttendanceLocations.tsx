// Attendance locations setup — owner/admin only. Each location is a place a
// clock-in can be judged against: a geofenced point (Leaflet map + draggable
// pin + radius) plus optional office IP ranges (a GPS-independent presence
// signal). CRUD flows through the SECURITY DEFINER RPCs in
// ../../lib/attendance/api (RLS/RPC re-check role too).

import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { useRole } from '../../hooks/useRole'
import { Skeleton } from '../../components/Skeleton'
import { Modal } from '../../components/Modal'
import { LocationPicker } from '../../components/attendance/LocationPicker'
import {
  listAttendanceLocations,
  upsertAttendanceLocation,
  deleteAttendanceLocation,
  fetchClientIp,
} from '../../lib/attendance/api'
import type { AttendanceLocation } from '../../lib/attendance/types'
import type { Translations } from '../../lib/translations'
import type { User } from '../../types/aliases'

const JAKARTA = { lat: -6.2, lng: 106.8 }

// Draft shape for the editor. `id: null` = a new location.
type Draft = {
  id: string | null
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_active: boolean
  office_cidrs: string[]
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: '',
    latitude: JAKARTA.lat,
    longitude: JAKARTA.lng,
    radius_meters: 150,
    is_active: true,
    office_cidrs: [],
  }
}

function draftFrom(loc: AttendanceLocation): Draft {
  return {
    id: loc.id,
    name: loc.name,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius_meters: loc.radius_meters,
    is_active: loc.is_active,
    office_cidrs: [...loc.office_cidrs],
  }
}

// Lightweight IPv4 / IPv4-CIDR validation for the "add range" input and the
// captured-IP path (the RPC re-validates server-side, this just guards the UI).
function isValidCidr(raw: string): boolean {
  const v = raw.trim()
  if (!v) return false
  const [addr, mask] = v.split('/')
  const octets = addr.split('.')
  if (octets.length !== 4) return false
  for (const o of octets) {
    if (!/^\d{1,3}$/.test(o)) return false
    const n = Number(o)
    if (n < 0 || n > 255) return false
  }
  if (mask !== undefined) {
    if (!/^\d{1,2}$/.test(mask)) return false
    const m = Number(mask)
    if (m < 0 || m > 32) return false
  }
  return true
}

export function AttendanceLocations({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { isAdmin } = useRole(user)
  useBreadcrumbTrailing(t.attendanceLocationsCrumb)

  const [locations, setLocations] = useState<AttendanceLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [user.id, user.org_id, isAdmin])

  async function load() {
    setLoading(true)
    try {
      setLocations(await listAttendanceLocations())
    } catch {
      setLocations([])
    }
    setLoading(false)
  }

  function flashSaved() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3000)
  }

  async function handleSaved() {
    await load()
    setDraft(null)
    flashSaved()
  }

  // Owner/admin only — the RPCs re-check role too, but keep non-privileged
  // roles off the page entirely rather than showing an empty, erroring shell.
  if (!isAdmin) return <Navigate to="/dashboard/attendance" replace />

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.attendanceLocationsTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.attendanceLocationsSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/attendance')}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {t.attendanceLocationBack}
        </button>
      </div>

      {saved && (
        <div
          className="mb-4 rounded-md px-3 py-2 text-sm"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 14%, transparent)', color: 'var(--color-success)' }}
          role="status"
        >
          {t.attendanceLocationSaved}
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.attendanceLocationAdd}
        </button>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : locations.length === 0 ? (
        <div className="rounded-lg border py-12 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.attendanceLocationsEmpty}
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => (
            <LocationCard key={loc.id} loc={loc} t={t} onEdit={() => setDraft(draftFrom(loc))} />
          ))}
        </div>
      )}

      {draft && (
        <LocationEditor
          draft={draft}
          t={t}
          onClose={() => setDraft(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ─── List card ──────────────────────────────────────────────────────────────

function LocationCard({ loc, t, onEdit }: { loc: AttendanceLocation; t: Translations; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="min-w-0">
        <div className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{loc.name}</div>
        <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.attendanceLocationRadius}: {loc.radius_meters} m
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {loc.office_cidrs.length > 0 && (
          <Pill tone="neutral">{t.attendanceOnOfficeNetwork}</Pill>
        )}
        {loc.is_active
          ? <Pill tone="success">{t.attendanceLocationActiveLabel}</Pill>
          : <Pill tone="muted">{t.attendanceLocationActiveLabel}</Pill>}
      </div>
    </button>
  )
}

type PillTone = 'success' | 'neutral' | 'muted'
function Pill({ children, tone }: { children: React.ReactNode; tone: PillTone }) {
  const palette: Record<PillTone, { bg: string; fg: string }> = {
    success: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    neutral: { bg: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', fg: 'var(--color-primary)' },
    muted: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-tertiary)' },
  }
  const { bg, fg } = palette[tone]
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {children}
    </span>
  )
}

// ─── Editor (modal) ───────────────────────────────────────────────────────────

type Geo = { display_name: string; lat: string; lon: string }

function LocationEditor({ draft, t, onClose, onSaved }: {
  draft: Draft
  t: Translations
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(draft.name)
  const [lat, setLat] = useState(draft.latitude)
  const [lng, setLng] = useState(draft.longitude)
  const [radius, setRadius] = useState(draft.radius_meters)
  const [active, setActive] = useState(draft.is_active)
  const [cidrs, setCidrs] = useState<string[]>(draft.office_cidrs)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Geo[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')

  const [cidrInput, setCidrInput] = useState('')
  const [cidrError, setCidrError] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isEdit = draft.id != null
  const canSave = name.trim().length > 0 && !saving

  async function runSearch() {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setGeoMsg('')
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=0&q=' +
        encodeURIComponent(q)
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      const json = (await res.json()) as Geo[]
      setResults(Array.isArray(json) ? json : [])
      if (!Array.isArray(json) || json.length === 0) setGeoMsg(t.attendanceLocationGeocodeNone)
    } catch {
      setResults([])
      setGeoMsg(t.attendanceLocationGeocodeNone)
    }
    setSearching(false)
  }

  function pickResult(r: Geo) {
    const nlat = Number(r.lat)
    const nlng = Number(r.lon)
    if (Number.isFinite(nlat) && Number.isFinite(nlng)) {
      setLat(nlat)
      setLng(nlng)
    }
    setResults([])
    setQuery('')
  }

  function useMyLocation() {
    setGeoMsg('')
    if (!navigator.geolocation) {
      setGeoMsg(t.attendanceLocationLocateError)
      return
    }
    setLocating(true)
    const ok = (pos: GeolocationPosition) => {
      setLat(pos.coords.latitude)
      setLng(pos.coords.longitude)
      setGeoMsg('')
      setLocating(false)
    }
    const fail = (err: GeolocationPositionError) => {
      setGeoMsg(err.code === err.PERMISSION_DENIED
        ? t.attendanceLocationPermissionDenied
        : t.attendanceLocationLocateError)
      setLocating(false)
    }
    // Coarse + generous: high accuracy is flaky on desktops without GPS, and a
    // long timeout lets a permission prompt persist until the user responds.
    navigator.geolocation.getCurrentPosition(ok, fail, {
      enableHighAccuracy: false,
      timeout: 30000,
      maximumAge: 0,
    })
  }

  function addCidr(raw: string) {
    const v = raw.trim()
    if (!v) return
    if (!isValidCidr(v)) {
      setCidrError(t.attendanceLocationInvalidRange)
      return
    }
    setCidrError('')
    if (!cidrs.includes(v)) setCidrs([...cidrs, v])
    setCidrInput('')
  }

  function removeCidr(v: string) {
    setCidrs(cidrs.filter(c => c !== v))
  }

  async function captureIp() {
    setCidrError('')
    const ip = await fetchClientIp()
    if (!ip) {
      setCidrError(t.attendanceLocationLocateError)
      return
    }
    // IPv4 → /32 single-host range. (IPv6 would need /128; keep V1 simple and
    // let the operator add those by hand if ever needed.)
    const range = ip.includes(':') ? ip : `${ip}/32`
    if (!isValidCidr(range)) {
      setCidrError(t.attendanceLocationInvalidRange)
      return
    }
    if (!cidrs.includes(range)) setCidrs([...cidrs, range])
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await upsertAttendanceLocation({
        id: draft.id,
        name: name.trim(),
        latitude: lat,
        longitude: lng,
        radius_meters: radius,
        is_active: active,
        office_cidrs: cidrs,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft.id) return
    setSaving(true)
    setError('')
    try {
      await deleteAttendanceLocation(draft.id)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? name || t.attendanceLocationName : t.attendanceLocationAdd} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Name */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.attendanceLocationName}</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </label>

        {/* Find the spot */}
        <div>
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.attendanceLocationFindSpot}</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
              placeholder={t.attendanceLocationSearchPlaceholder}
              className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {searching && <Spinner />}
              {t.attendanceLocationSearch}
            </button>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {locating && <Spinner />}
              {locating ? t.attendanceLocationLocating : t.attendanceLocationUseMyLocation}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-md border" style={{ borderColor: 'var(--color-border)' }}>
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pickResult(r)}
                    className="block w-full truncate px-3 py-2 text-left text-sm hover:opacity-80"
                    style={{ color: 'var(--color-text-secondary)', borderTop: i === 0 ? 'none' : '1px solid var(--color-border)' }}
                  >
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {geoMsg && (
            <p
              className="mt-1.5 rounded-md px-2.5 py-1.5 text-xs"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', color: 'var(--color-warning)' }}
              role="status"
            >{geoMsg}</p>
          )}
        </div>

        {/* Map */}
        <LocationPicker
          latitude={lat}
          longitude={lng}
          radiusMeters={radius}
          onMove={(nlat, nlng) => { setLat(nlat); setLng(nlng) }}
        />

        {/* Radius */}
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{t.attendanceLocationRadius}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>{radius} m</span>
          </span>
          <input
            type="range"
            min={50}
            max={500}
            step={10}
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: 'var(--color-primary)' }}
          />
        </label>

        {/* Active */}
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="h-4 w-4"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          {t.attendanceLocationActiveLabel}
        </label>

        {/* Office network */}
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.attendanceLocationOfficeNetwork}</div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.attendanceLocationOfficeNetworkHint}</p>

          {cidrs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cidrs.map(c => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                >
                  <span className="font-mono">{c}</span>
                  <button
                    type="button"
                    onClick={() => removeCidr(c)}
                    aria-label={t.attendanceLocationDelete}
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              value={cidrInput}
              onChange={e => { setCidrInput(e.target.value); setCidrError('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCidr(cidrInput) } }}
              placeholder="203.0.113.0/24"
              className="min-w-0 flex-1 rounded-md border px-3 py-1.5 font-mono text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
            <button
              type="button"
              onClick={() => addCidr(cidrInput)}
              disabled={!cidrInput.trim()}
              className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.attendanceLocationAddRange}
            </button>
            <button
              type="button"
              onClick={captureIp}
              className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.attendanceLocationCaptureIp}
            </button>
          </div>
          {cidrError && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--color-danger)' }}>{cidrError}</p>
          )}
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {isEdit ? (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ color: 'var(--color-danger)' }}
            >
              {t.attendanceLocationDelete}
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.attendanceLocationSave}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  )
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="w-1/2 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
