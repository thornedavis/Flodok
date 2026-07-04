// Read-only Leaflet map previewing an org's configured attendance geofences
// (pins + radius circles) — used in the Settings → Attendance tab. Editing
// happens on the dedicated locations page (LocationPicker). Same Leaflet-in-
// React/Vite discipline as LocationPicker: static CSS import, lazy library
// load (kept out of the main bundle), StrictMode-safe single init, a divIcon
// marker (default icon assets break under bundlers), and map.remove() cleanup.
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap } from 'leaflet'
import type { AttendanceLocation } from '../../lib/attendance/types'

const ACCENT = '#2563eb'
const PIN_HTML =
  '<div style="width:24px;height:24px;transform:translateY(-2px);' +
  'color:' + ACCENT + ';filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">' +
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" ' +
  'stroke="#fff" stroke-width="1.5" stroke-linejoin="round">' +
  '<path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12z"/>' +
  '<circle cx="12" cy="10" r="2.5" fill="#fff" stroke="none"/></svg></div>'

export function AttendanceLocationsMap({ locations, height = 200 }: {
  locations: AttendanceLocation[]
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    let cancelled = false
    const el = containerRef.current

    ;(async () => {
      const L = (await import('leaflet')).default
      // StrictMode double-invokes the mount effect; the async import means a
      // second run (or the cleanup) may land before this resolves.
      if (cancelled || mapRef.current) return

      const map = L.map(el, { scrollWheelZoom: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({ className: '', html: PIN_HTML, iconSize: [24, 24], iconAnchor: [12, 24] })
      const group = L.featureGroup()
      for (const loc of locations) {
        const pt: [number, number] = [loc.latitude, loc.longitude]
        L.marker(pt, { icon }).addTo(group)
        L.circle(pt, { radius: loc.radius_meters, color: ACCENT, weight: 1.5, fillColor: ACCENT, fillOpacity: 0.12 }).addTo(group)
      }
      group.addTo(map)

      if (locations.length > 0) {
        map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 16 })
      } else {
        map.setView([-6.2, 106.8], 11) // Jakarta fallback
      }

      // The container often mounts at 0px inside a settings panel; nudge once.
      setTimeout(() => { if (!cancelled) map.invalidateSize() }, 0)
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // Mount-only: the parent remounts this (via a key on the location set) when
    // the locations change, so there's no in-place refresh path to maintain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: 12, zIndex: 0 }}
      aria-label="attendance locations map"
    />
  )
}
