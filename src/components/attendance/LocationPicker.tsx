// Leaflet + OpenStreetMap map for the attendance-locations editor. Draggable
// pin + geofence circle; the parent owns lat/lng/radius state and receives
// changes via onMove.
//
// Leaflet-in-React/Vite notes (do not "simplify" these away):
//  - the CSS is imported statically so Vite bundles it;
//  - the library itself is loaded lazily (`await import('leaflet')`) to keep it
//    out of the main bundle;
//  - the map is created exactly once and guarded with a ref, because React 18
//    StrictMode double-invokes effects in dev — a second init on the same
//    container throws "already initialized";
//  - the marker uses a divIcon, not Leaflet's default icon, whose PNG assets
//    resolve to broken URLs under a bundler.

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker, Circle } from 'leaflet'

const JAKARTA: [number, number] = [-6.2, 106.8]
const ACCENT = '#2563eb'

const PIN_HTML =
  '<div style="width:24px;height:24px;transform:translateY(-2px);' +
  'color:' + ACCENT + ';filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">' +
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" ' +
  'stroke="#fff" stroke-width="1.5" stroke-linejoin="round">' +
  '<path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12z"/>' +
  '<circle cx="12" cy="10" r="2.5" fill="#fff" stroke="none"/></svg></div>'

export function LocationPicker({
  latitude,
  longitude,
  radiusMeters,
  onMove,
}: {
  latitude: number
  longitude: number
  radiusMeters: number
  onMove: (lat: number, lng: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const circleRef = useRef<Circle | null>(null)
  // The last coordinates we authored ourselves (drag / click). Lets the
  // props-sync effect tell "the parent moved us programmatically" (recenter)
  // apart from "the parent is just echoing our own drag back" (leave the view).
  const selfCoords = useRef<{ lat: number; lng: number } | null>(null)
  // Keep the latest onMove without re-running the mount effect (which would
  // re-init the map). Handlers read through this ref.
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  // ── Init once ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    let cancelled = false
    const el = containerRef.current

    ;(async () => {
      const L = (await import('leaflet')).default
      // StrictMode: a second effect run may have created the map already, or
      // the effect may have been cleaned up before the dynamic import resolved.
      if (cancelled || mapRef.current) return

      const start: [number, number] =
        latitude && longitude ? [latitude, longitude] : JAKARTA
      const map = L.map(el).setView(start, 16)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: PIN_HTML,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      })
      const marker = L.marker(start, { draggable: true, icon }).addTo(map)
      markerRef.current = marker

      const circle = L.circle(start, {
        radius: radiusMeters || 150,
        color: ACCENT,
        weight: 1.5,
        fillColor: ACCENT,
        fillOpacity: 0.12,
      }).addTo(map)
      circleRef.current = circle

      function emit(lat: number, lng: number) {
        selfCoords.current = { lat, lng }
        marker.setLatLng([lat, lng])
        circle.setLatLng([lat, lng])
        onMoveRef.current(lat, lng)
      }

      marker.on('dragend', () => {
        const p = marker.getLatLng()
        emit(p.lat, p.lng)
      })
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        emit(e.latlng.lat, e.latlng.lng)
      })

      // Leaflet mis-measures a container that mounted at 0px (e.g. inside a
      // modal that animated in). Nudge it once the map is live.
      setTimeout(() => { if (!cancelled) map.invalidateSize() }, 0)
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerRef.current = null
      circleRef.current = null
    }
    // Intentionally mount-only: init reads the initial props, and the sync
    // effect below keeps marker/circle/view in step afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync marker + circle + view when props change ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    const circle = circleRef.current
    if (!map || !marker || !circle || !latitude || !longitude) return

    marker.setLatLng([latitude, longitude])
    circle.setLatLng([latitude, longitude])
    circle.setRadius(radiusMeters || 150)

    // Only recenter when the change came from OUTSIDE (search / use-my-location),
    // not when the parent is echoing back a drag/click we just made.
    const self = selfCoords.current
    const isEcho =
      self != null &&
      Math.abs(self.lat - latitude) < 1e-9 &&
      Math.abs(self.lng - longitude) < 1e-9
    if (!isEcho) map.setView([latitude, longitude], map.getZoom())
    selfCoords.current = null
  }, [latitude, longitude, radiusMeters])

  return (
    <div
      ref={containerRef}
      style={{ height: 280, width: '100%', borderRadius: 12, zIndex: 0 }}
      aria-label="map"
    />
  )
}
