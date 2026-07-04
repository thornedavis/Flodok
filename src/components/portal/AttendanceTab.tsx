// Employee-portal "Attendance" tab: live selfie + GPS clock-in/out. The write
// goes through the attendance-checkin edge function (slug + token authed), which
// uploads the selfie and calls portal_record_attendance server-side — identity
// and geofence are resolved server-side, nothing here is trusted. We RECORD-AND-
// FLAG: being outside the office fence is fine; having no location blocks.
//
// Camera capture uses <video> + <canvas> (NOT ImageCapture, which iOS Safari
// does not support): getUserMedia → play a live <video>, then draw a frame to a
// <canvas> and toBlob() a JPEG.

import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { recordAttendance, listPortalAttendance } from '../../lib/attendance/api'
import type { AttendanceEventType, PortalAttendanceItem } from '../../lib/attendance/types'

type Phase = 'idle' | 'camera' | 'submitting'

function isSameCalendarDay(iso: string, now: Date): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

// Next action: if the latest event is a clock_in from today, the next is a
// clock_out; otherwise clock_in.
function inferNextType(records: PortalAttendanceItem[]): AttendanceEventType {
  const latest = records[0]
  if (latest && latest.event_type === 'clock_in' && isSameCalendarDay(latest.server_timestamp, new Date())) {
    return 'clock_out'
  }
  return 'clock_in'
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    })
  })
}

export function AttendanceTab({ slug, token }: {
  slug: string | null
  token: string | null
}) {
  const { t, lang } = useLang()
  const [records, setRecords] = useState<PortalAttendanceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const nextType = inferNextType(records)

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function reload() {
    if (!slug || !token) return
    setLoading(true)
    try {
      setRecords(await listPortalAttendance(slug, token))
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    return () => stopCamera()
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [slug, token])

  // Assign the camera stream once the <video> is committed for the 'camera'
  // phase. An effect is more reliable than a one-shot rAF, especially on iOS
  // Safari where the element may not exist on the first frame after setState.
  useEffect(() => {
    if (phase !== 'camera') return
    const video = videoRef.current
    if (video && streamRef.current) {
      video.srcObject = streamRef.current
      video.play().catch(() => {})
    }
  }, [phase])

  async function startCamera() {
    setError('')
    setSuccess(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      setPhase('camera')
    } catch {
      stopCamera()
      setPhase('idle')
      setError(t.attendanceCameraDenied)
    }
  }

  function captureBlob(): Promise<Blob | null> {
    return new Promise(resolve => {
      const video = videoRef.current
      if (!video || !video.videoWidth || !video.videoHeight) {
        resolve(null)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
    })
  }

  async function captureAndSubmit() {
    if (!slug || !token) return
    setError('')
    const blob = await captureBlob()
    if (!blob) {
      setError(t.attendanceCameraDenied)
      return
    }
    setPhase('submitting')
    // Geolocation is required (being outside the fence is fine; NO location blocks).
    let position: GeolocationPosition
    try {
      position = await getPosition()
    } catch {
      setPhase('camera')
      setError(t.attendanceLocationDenied)
      return
    }
    try {
      await recordAttendance({
        slug,
        token,
        eventType: nextType,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? null,
        selfie: blob,
        clientTimestamp: new Date().toISOString(),
      })
      stopCamera()
      setPhase('idle')
      setSuccess(true)
      await reload()
    } catch (ex) {
      setPhase('camera')
      setError((ex as Error).message)
    }
  }

  function cancelCamera() {
    stopCamera()
    setPhase('idle')
    setError('')
  }

  if (!slug || !token) return null

  const submitting = phase === 'submitting'

  return (
    <div className="space-y-4 px-1 py-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.portalAttendanceTab}</h2>
      </div>

      {error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 14%, transparent)', color: 'var(--color-success)' }}>
          {t.attendanceSuccess}
        </div>
      )}

      {phase === 'idle' ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.attendanceCaptureHint}</p>
          <button
            onClick={startCamera}
            className="w-full rounded-lg px-3 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {nextType === 'clock_in' ? t.attendanceClockIn : t.attendanceClockOut}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full"
              style={{ aspectRatio: '3 / 4', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelCamera}
              disabled={submitting}
              className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.cancel}
            </button>
            <button
              onClick={captureAndSubmit}
              disabled={submitting}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {submitting ? t.attendanceSubmitting : t.attendanceCapture}
            </button>
          </div>
        </div>
      )}

      {/* ─── Recent ─── */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.attendanceRecentTitle}</h3>
        {loading ? (
          <div className="rounded-lg border py-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>…</div>
        ) : records.length === 0 ? (
          <div className="rounded-lg border py-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
            {t.attendanceNoRecords}
          </div>
        ) : (
          <div className="space-y-2">
            {records.map(rec => <RecentRow key={rec.id} rec={rec} lang={lang} clockInLabel={t.attendanceClockIn} clockOutLabel={t.attendanceClockOut} offsiteNotice={t.attendanceOffsiteNotice} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function RecentRow({ rec, lang, clockInLabel, clockOutLabel, offsiteNotice }: {
  rec: PortalAttendanceItem
  lang: 'en' | 'id'
  clockInLabel: string
  clockOutLabel: string
  offsiteNotice: string
}) {
  const label = rec.event_type === 'clock_in' ? clockInLabel : clockOutLabel
  const when = new Date(rec.server_timestamp).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{when}</span>
      </div>
      {rec.within_geofence === false && (
        <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{offsiteNotice}</div>
      )}
    </div>
  )
}
