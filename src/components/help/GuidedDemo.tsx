// Self-playing, cursor-driven product walkthroughs for the Help Center — crisp,
// theme-aware, loopable replacements for screen-recording GIFs.
//
// The mocks below are real, state-driven React, not images. A fake cursor
// glides to elements carrying a `data-demo-id`, "clicks" (advancing the mock's
// state), and the script loops. It respects prefers-reduced-motion, can be
// paused/replayed, and the mock stays clickable so a reader can take over.
//
// `useGuidedTour` is generic and resolves targets within a single stage, so a
// tour can span multiple surfaces at once: LeaveJourneyDemo composes a desktop
// dashboard mock with an overlaid phone and drives one cursor across both —
// employee submits on the phone, HR approves on the desktop. LeaveRequestDemo
// is the lighter mobile-only version used on the "Submitting a request" page.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Wordmark } from '../Brand'

// ─── Timing (ms) ───────────────────────────────────────
const MOVE_MS = 720
const CLICK_MS = 320
const STEP_GAP = 720
const LOOP_PAUSE = 1900

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

export interface TourStep {
  target: string
  caption: string
}

export interface GuidedTour {
  stageRef: React.RefObject<HTMLDivElement | null>
  cursor: { x: number; y: number }
  moved: boolean
  clicking: boolean
  activeTarget: string | null
  stepIdx: number
  playing: boolean
  reduced: boolean
  toggle: () => void
  restart: () => void
  /** Pause autoplay because the reader interacted with the mock directly. */
  takeOver: (nextStep: number) => void
}

/**
 * Drives a fake cursor through `steps`, calling `apply(i)` as each step's
 * "click" lands (that's what advances the mock's state). Targets are resolved
 * by `[data-demo-id]` inside the stage at the moment each step runs, so the
 * element only needs to exist on the screen that step points at.
 */
export function useGuidedTour(steps: TourStep[], apply: (i: number) => void, reset: () => void): GuidedTour {
  const reduced = usePrefersReducedMotion()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const timers = useRef<number[]>([])
  const idxRef = useRef(0)

  const [cursor, setCursor] = useState({ x: 40, y: 40 })
  const [moved, setMoved] = useState(false)
  const [clicking, setClicking] = useState(false)
  const [activeTarget, setActiveTarget] = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  // Bumped by restart() so the driver effect always re-runs (cancelling any
  // in-flight chain) even when `playing` is already true.
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    setPlaying(!reduced)
  }, [reduced])

  const moveTo = useCallback((target: string) => {
    setActiveTarget(target)
    const stage = stageRef.current
    if (!stage) return
    const el = stage.querySelector<HTMLElement>(`[data-demo-id="${target}"]`)
    if (!el) return
    const sr = stage.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setCursor({ x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 })
    setMoved(true)
  }, [])

  useEffect(() => {
    if (!playing) return
    let cancelled = false
    const push = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn()
      }, ms)
      timers.current.push(id)
    }

    const run = (i: number) => {
      if (cancelled) return
      idxRef.current = i
      setStepIdx(i)
      moveTo(steps[i].target)
      push(() => {
        setClicking(true)
        push(() => setClicking(false), CLICK_MS)
        apply(i)
        const next = (i + 1) % steps.length
        if (next === 0) {
          push(() => {
            reset()
            push(() => run(0), 460)
          }, LOOP_PAUSE)
        } else {
          push(() => run(next), STEP_GAP)
        }
      }, reduced ? 120 : MOVE_MS)
    }

    push(() => run(idxRef.current), 520)

    return () => {
      cancelled = true
      timers.current.forEach((id) => clearTimeout(id))
      timers.current = []
    }
  }, [playing, reduced, steps, apply, reset, moveTo, nonce])

  const toggle = useCallback(() => setPlaying((p) => !p), [])
  const restart = useCallback(() => {
    idxRef.current = 0
    setStepIdx(0)
    reset()
    setNonce((n) => n + 1)
    setPlaying(true)
  }, [reset])
  const takeOver = useCallback((nextStep: number) => {
    setPlaying(false)
    idxRef.current = nextStep
    setStepIdx(nextStep)
  }, [])

  return { stageRef, cursor, moved, clicking, activeTarget, stepIdx, playing, reduced, toggle, restart, takeOver }
}

// ─── Cursor + controls ─────────────────────────────────

export function Cursor({ x, y, clicking, reduced, visible }: { x: number; y: number; clicking: boolean; reduced: boolean; visible: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-30"
      style={{
        transform: `translate(${x}px, ${y}px)`,
        opacity: visible ? 1 : 0,
        transition: reduced
          ? 'opacity 200ms ease'
          : 'transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease',
      }}
    >
      <span
        className="absolute rounded-full"
        style={{
          left: -3,
          top: -3,
          width: 26,
          height: 26,
          border: '2px solid var(--color-primary)',
          transform: clicking ? 'scale(1.9)' : 'scale(0.3)',
          opacity: clicking ? 0.85 : 0,
          transition: reduced ? 'none' : 'transform 320ms ease-out, opacity 320ms ease-out',
        }}
      />
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}>
        <path d="M5 3l14 8.5-6.2 1.2 3.3 6.4-2.8 1.4-3.3-6.4L5 19V3z" fill="#ffffff" stroke="#111827" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function DemoChrome({
  label,
  tour,
  steps,
  children,
}: {
  label: string
  tour: GuidedTour
  steps: TourStep[]
  children: ReactNode
}) {
  return (
    <div className="not-prose my-8 border-y py-6" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
          Interactive demo
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      </div>

      <div>
        {children}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={tour.toggle}
            aria-label={tour.playing ? 'Pause' : 'Play'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            {tour.playing ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={tour.restart}
            aria-label="Replay"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
          <div className="min-w-0 flex-1 text-sm" aria-live="polite" style={{ color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-text-tertiary)' }}>{tour.stepIdx + 1}/{steps.length} · </span>
            {steps[tour.stepIdx].caption}
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: i === tour.stepIdx ? 'var(--color-primary)' : 'var(--color-border)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shared primitives ─────────────────────────────────

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>{children}</div>
}

export function Field({ label, value, placeholder, demoId, active, caret }: { label: string; value?: string; placeholder: string; demoId?: string; active?: boolean; caret?: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div
        data-demo-id={demoId}
        className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
        style={{
          borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent)' : 'none',
          transition: 'border-color 160ms, box-shadow 160ms',
        }}
      >
        <span>{value || placeholder}</span>
        {caret}
      </div>
    </div>
  )
}

export function Btn({ children, demoId, active, variant = 'primary', block, onClick }: { children: ReactNode; demoId?: string; active?: boolean; variant?: 'primary' | 'ghost'; block?: boolean; onClick?: () => void }) {
  const primary = variant === 'primary'
  return (
    <button
      type="button"
      data-demo-id={demoId}
      onClick={onClick}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-shadow"
      style={{
        width: block ? '100%' : undefined,
        backgroundColor: primary ? 'var(--color-primary)' : 'transparent',
        color: primary ? '#ffffff' : 'var(--color-text)',
        border: primary ? 'none' : '1px solid var(--color-border)',
        boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--color-primary) 28%, transparent)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

export function StatusPill({ status }: { status: 'submitted' | 'approved' }) {
  const approved = status === 'approved'
  const color = approved ? 'var(--color-success)' : 'var(--color-primary)'
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {approved ? 'Approved' : 'Submitted'}
    </span>
  )
}

// ─── Phone (employee portal) ───────────────────────────

export function PortalHeader() {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)' }}>BS</div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Budi Santoso</div>
        <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Employee Portal</div>
      </div>
    </div>
  )
}

export function PhoneShell({ children, innerRef }: { children: ReactNode; innerRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div className="rounded-[30px] border p-2" style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg-tertiary)', boxShadow: '0 18px 40px -18px rgba(0,0,0,0.55)' }}>
      <div ref={innerRef} className="relative overflow-hidden rounded-[22px]" style={{ backgroundColor: 'var(--color-bg)', height: 470, width: 300 }}>
        <PortalHeader />
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function MList({ onNew, active }: { onNew?: () => void; active: string | null }) {
  return (
    <div className="space-y-3">
      <ScreenTitle>Requests</ScreenTitle>
      <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Annual leave balance</div>
        <div className="mt-0.5">
          <span className="text-xl font-semibold" style={{ color: 'var(--color-primary)' }}>12</span>
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}> / 12 days remaining</span>
        </div>
      </div>
      <Btn demoId="new-request" active={active === 'new-request'} onClick={onNew} block>+ New request</Btn>
      <div className="pt-1 text-center text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>No requests yet</div>
    </div>
  )
}

function MPick({ onLeave, active }: { onLeave?: () => void; active: string | null }) {
  return (
    <div className="space-y-3">
      <ScreenTitle>New request</ScreenTitle>
      <button
        type="button"
        data-demo-id="pick-leave"
        onClick={onLeave}
        className="w-full rounded-xl border p-3 text-left transition-shadow"
        style={{
          borderColor: active === 'pick-leave' ? 'var(--color-primary)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          boxShadow: active === 'pick-leave' ? '0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent)' : 'none',
        }}
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Leave Request</div>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Cuti — time off work</div>
      </button>
      <div className="w-full rounded-xl border p-3 text-left" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', opacity: 0.6 }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Overtime Request</div>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Lembur — extra hours worked</div>
      </div>
    </div>
  )
}

function MForm({ leaveType, dates, active, onSubmit }: { leaveType: string; dates: string; active: string | null; onSubmit?: () => void }) {
  return (
    <div className="space-y-3">
      <ScreenTitle>Leave Request</ScreenTitle>
      <Field
        label="Leave type"
        value={leaveType}
        placeholder="Select…"
        demoId="leave-type"
        active={active === 'leave-type'}
        caret={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>}
      />
      <div data-demo-id="date-range" className="grid grid-cols-2 gap-2">
        <Field label="From" value={dates ? '12 Jun 2026' : ''} placeholder="Pick a date" active={active === 'date-range'} />
        <Field label="To" value={dates ? '14 Jun 2026' : ''} placeholder="Pick a date" active={active === 'date-range'} />
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Reason</div>
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-tertiary)', minHeight: 44 }}>Family event</div>
      </div>
      <Btn demoId="submit" active={active === 'submit'} onClick={onSubmit} block>Submit request</Btn>
    </div>
  )
}

function MStatus({ approved }: { approved: boolean }) {
  return (
    <div className="space-y-3">
      <ScreenTitle>Requests</ScreenTitle>
      <div data-demo-id="status-row" className="flex items-center justify-between rounded-xl border px-3 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>Leave Request</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Annual leave · 12 – 14 Jun 2026</div>
        </div>
        <StatusPill status={approved ? 'approved' : 'submitted'} />
      </div>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: approved ? 'var(--color-diff-add)' : 'var(--color-bg-tertiary)', color: approved ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        {approved ? 'Your manager approved this' : 'Sent to your approver'}
      </div>
    </div>
  )
}

// ─── Desktop (HR dashboard) ────────────────────────────

// Sidebar mirrors the real app's nav (src/components/Layout.tsx) so the mock
// reads as Flodok, not a generic dashboard. Icons are 14px versions of the
// real ones; Forms is the active item.
export function ni(children: ReactNode) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}

const PRIMARY_NAV: { label: string; icon: ReactNode }[] = [
  { label: 'Overview', icon: ni(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  { label: 'Inbox', icon: ni(<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>) },
  { label: 'Hiring', icon: ni(<><path d="M9 2a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2H9z" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>) },
  { label: 'Forms', icon: ni(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>) },
  { label: 'Recruitment', icon: ni(<><circle cx="9" cy="8" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></>) },
  { label: 'Documents', icon: ni(<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />) },
  { label: 'Employees', icon: ni(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { label: 'Performance', icon: ni(<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>) },
  { label: 'Payroll', icon: ni(<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>) },
  { label: 'Spotlight', icon: ni(<><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>) },
  { label: 'Pending', icon: ni(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>) },
  { label: 'Company', icon: ni(<><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9h1" /><path d="M9 13h1" /><path d="M9 17h1" /><path d="M15 13h1" /><path d="M15 17h1" /></>) },
]

const FOOTER_NAV: { label: string; icon: ReactNode }[] = [
  { label: 'Settings', icon: ni(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>) },
  { label: 'Trash', icon: ni(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>) },
  { label: 'Help Center', icon: ni(<><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></>) },
]

function NavRow({ label, icon, active }: { label: string; icon: ReactNode; active?: boolean }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium"
      style={{ backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent', color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
    >
      <span className="shrink-0" style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  )
}

export function DesktopFrame({ children, activeNav = 'Forms', url = 'app.flodok.com/dashboard/forms' }: { children: ReactNode; activeNav?: string; url?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg)', boxShadow: '0 22px 60px -24px rgba(0,0,0,0.5)' }}>
      <div className="flex items-center gap-2 border-b px-3" style={{ height: 34, borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
        <div className="ml-2 flex-1">
          <div className="mx-auto max-w-[280px] truncate rounded-md px-2 py-0.5 text-center text-[10px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
            {url}
          </div>
        </div>
      </div>
      <div className="flex" style={{ height: 432 }}>
        <div className="hidden w-[150px] shrink-0 flex-col border-r p-2 sm:flex" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="mb-2 flex items-center px-1 py-1">
            <Wordmark height={15} />
          </div>
          <div className="flex flex-col gap-0.5">
            {PRIMARY_NAV.map((it) => <NavRow key={it.label} label={it.label} icon={it.icon} active={it.label === activeNav} />)}
          </div>
          <div className="mt-auto flex flex-col gap-0.5 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
            {FOOTER_NAV.map((it) => <NavRow key={it.label} label={it.label} icon={it.icon} active={it.label === activeNav} />)}
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

export function ringStyle(on: boolean): CSSProperties {
  return on ? { boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary) 26%, transparent)' } : {}
}

export function FakePill({ children, demoId, active }: { children: ReactNode; demoId?: string; active?: boolean }) {
  return (
    <span data-demo-id={demoId} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: active ? 'var(--color-primary)' : 'var(--color-border)', color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)', ...ringStyle(!!active) }}>
      {children}
    </span>
  )
}

export function DRow({ name, type, date, status, demoId, neu, active }: { name: string; type: string; date: string; status: 'submitted' | 'approved'; demoId?: string; neu?: boolean; active?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center gap-3 border-t px-3 py-2.5 text-xs first:border-t-0"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : neu ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none',
      }}
    >
      <span className="flex-1 truncate font-medium" style={{ color: 'var(--color-text)' }}>{name}</span>
      <span className="hidden flex-1 truncate sm:block" style={{ color: 'var(--color-text-secondary)' }}>{type}</span>
      <span className="hidden w-20 sm:block" style={{ color: 'var(--color-text-tertiary)' }}>{date}</span>
      <StatusPill status={status} />
    </div>
  )
}

function DesktopList({ hasPending, active }: { hasPending: boolean; active: string | null }) {
  return (
    <div className="p-4">
      <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Forms</div>
      <div className="mb-3 flex items-center gap-2">
        <FakePill>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
          Filter
        </FakePill>
        <FakePill>All employees</FakePill>
        <div className="ml-auto h-7 w-36 rounded-md border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }} />
      </div>
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
          <span className="flex-1">Employee</span>
          <span className="hidden flex-1 sm:block">Type</span>
          <span className="hidden w-20 sm:block">Submitted</span>
          <span className="w-[64px]">Status</span>
        </div>
        {hasPending && <DRow name="Budi Santoso" type="Leave Request" date="Today" status="submitted" demoId="d-row" neu active={active === 'd-row'} />}
        <DRow name="Siti Rahma" type="Overtime Request" date="10 Jun 2026" status="approved" />
        <DRow name="Andi Wijaya" type="Leave Request" date="2 Jun 2026" status="approved" />
      </div>
      {!hasPending && (
        <div className="mt-3 text-center text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Waiting for new requests…</div>
      )}
    </div>
  )
}

export function DCard({ title, children, demoId, active }: { title: string; children: ReactNode; demoId?: string; active?: boolean }) {
  return (
    <div data-demo-id={demoId} className="rounded-lg border p-3" style={{ borderColor: active ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(!!active) }}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{title}</div>
      {children}
    </div>
  )
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span style={{ color: 'var(--color-text-tertiary)' }}>{k}</span>
      <span className="truncate text-right" style={{ color: 'var(--color-text)' }}>{v}</span>
    </div>
  )
}

export function TimelineStep({ label, detail, state }: { label: string; detail: string; state: 'done' | 'active' | 'todo' }) {
  const color = state === 'done' ? 'var(--color-success)' : state === 'active' ? 'var(--color-primary)' : 'var(--color-text-tertiary)'
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ backgroundColor: state === 'todo' ? 'transparent' : color, border: state === 'todo' ? '1.5px solid var(--color-border-strong)' : 'none' }}>
        {state === 'done' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        <div className="text-[11px]" style={{ color: state === 'active' ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>{detail}</div>
      </div>
    </div>
  )
}

function DesktopDetail({ approved, active }: { approved: boolean; active: string | null }) {
  return (
    <div className="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Leave Request · CUTI/2026/014</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Budi Santoso</div>
        <StatusPill status={approved ? 'approved' : 'submitted'} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <DCard title="Employee">
          <KV k="Code" v="EMP-014" />
          <KV k="Dept" v="Operations" />
          <KV k="Position" v="Staff" />
        </DCard>
        <DCard title="Request">
          <KV k="Type" v="Annual leave" />
          <KV k="Dates" v="12 – 14 Jun" />
          <KV k="Days" v="3" />
        </DCard>
      </div>

      <div className="mt-3">
        <DCard title="Workflow">
          <TimelineStep label="Employee submitted" detail="Today, 09:12" state="done" />
          <TimelineStep label="Manager approval" detail={approved ? 'Approved · just now' : 'Awaiting your approval'} state={approved ? 'done' : 'active'} />
        </DCard>
      </div>

      {approved ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-diff-add)', color: 'var(--color-success)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Approved — recorded to payroll &amp; leave
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Btn demoId="d-approve" active={active === 'd-approve'}>Approve</Btn>
          <Btn variant="ghost">Reject</Btn>
        </div>
      )}
    </div>
  )
}

// ─── Mobile-only demo: submitting a leave request ──────

const SUBMIT_STEPS: TourStep[] = [
  { target: 'new-request', caption: 'Open the Requests tab and tap New request' },
  { target: 'pick-leave', caption: 'Choose Leave Request (Cuti)' },
  { target: 'leave-type', caption: 'Pick a leave type — Annual' },
  { target: 'date-range', caption: 'Set your dates' },
  { target: 'submit', caption: 'Submit the request' },
  { target: 'status-row', caption: 'Done — it’s now awaiting approval' },
]

export function LeaveRequestDemo() {
  const [screen, setScreen] = useState<'list' | 'pick' | 'form' | 'submitted'>('list')
  const [leaveType, setLeaveType] = useState('')
  const [dates, setDates] = useState('')

  const apply = useCallback((i: number) => {
    if (i === 0) setScreen('pick')
    else if (i === 1) setScreen('form')
    else if (i === 2) setLeaveType('Annual leave')
    else if (i === 3) setDates('set')
    else if (i === 4) setScreen('submitted')
  }, [])
  const reset = useCallback(() => {
    setScreen('list')
    setLeaveType('')
    setDates('')
  }, [])

  const tour = useGuidedTour(SUBMIT_STEPS, apply, reset)
  const { takeOver } = tour

  const manual = useMemo(
    () => ({
      newRequest: () => { setScreen('pick'); takeOver(1) },
      pickLeave: () => { setScreen('form'); takeOver(2) },
      submit: () => { setLeaveType('Annual leave'); setDates('set'); setScreen('submitted'); takeOver(5) },
    }),
    [takeOver]
  )

  return (
    <DemoChrome label="Submitting a leave request — it plays itself, or click through it yourself." tour={tour} steps={SUBMIT_STEPS}>
      <div className="mx-auto" style={{ maxWidth: 320 }}>
        <PhoneShell innerRef={tour.stageRef}>
          {screen === 'list' && <MList onNew={manual.newRequest} active={tour.activeTarget} />}
          {screen === 'pick' && <MPick onLeave={manual.pickLeave} active={tour.activeTarget} />}
          {screen === 'form' && <MForm leaveType={leaveType} dates={dates} active={tour.activeTarget} onSubmit={manual.submit} />}
          {screen === 'submitted' && <MStatus approved={false} />}
          <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
        </PhoneShell>
      </div>
    </DemoChrome>
  )
}

// ─── Coordinated demo: phone submit → desktop approval ─

const JOURNEY_STEPS: TourStep[] = [
  { target: 'new-request', caption: 'On her phone, the employee taps New request' },
  { target: 'pick-leave', caption: 'She chooses Leave Request (Cuti)' },
  { target: 'leave-type', caption: 'Picks a leave type — Annual' },
  { target: 'date-range', caption: 'Sets the dates' },
  { target: 'submit', caption: 'Submits — it lands in HR’s dashboard' },
  { target: 'd-row', caption: 'On the desktop, HR opens the new request' },
  { target: 'd-approve', caption: 'HR reviews the details and approves' },
  { target: 'status-row', caption: 'Approved — the employee sees it on their phone' },
]

export function LeaveJourneyDemo() {
  const [m, setM] = useState<'list' | 'pick' | 'form' | 'submitted' | 'approved'>('list')
  const [d, setD] = useState<'list' | 'detail' | 'approved'>('list')
  const [leaveType, setLeaveType] = useState('')
  const [dates, setDates] = useState('')
  const [hasPending, setHasPending] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 0) setM('pick')
    else if (i === 1) setM('form')
    else if (i === 2) setLeaveType('Annual leave')
    else if (i === 3) setDates('set')
    else if (i === 4) { setM('submitted'); setHasPending(true) }
    else if (i === 5) setD('detail')
    else if (i === 6) { setD('approved'); setM('approved') }
  }, [])
  const reset = useCallback(() => {
    setM('list')
    setD('list')
    setLeaveType('')
    setDates('')
    setHasPending(false)
  }, [])

  const tour = useGuidedTour(JOURNEY_STEPS, apply, reset)
  const at = tour.activeTarget

  const phoneStyle: CSSProperties = { position: 'absolute', right: 6, bottom: 6, transform: 'scale(0.58)', transformOrigin: 'bottom right' }

  return (
    <DemoChrome label="One request, both screens: the employee submits on mobile, HR approves on desktop." tour={tour} steps={JOURNEY_STEPS}>
      <div ref={tour.stageRef} className="relative mx-auto" style={{ maxWidth: 880 }}>
        <DesktopFrame>
          {d === 'list' && <DesktopList hasPending={hasPending} active={at} />}
          {d === 'detail' && <DesktopDetail approved={false} active={at} />}
          {d === 'approved' && <DesktopDetail approved={true} active={at} />}
        </DesktopFrame>

        <div style={phoneStyle}>
          <PhoneShell>
            {m === 'list' && <MList active={at} />}
            {m === 'pick' && <MPick active={at} />}
            {m === 'form' && <MForm leaveType={leaveType} dates={dates} active={at} />}
            {m === 'submitted' && <MStatus approved={false} />}
            {m === 'approved' && <MStatus approved={true} />}
          </PhoneShell>
        </div>

        <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
      </div>
    </DemoChrome>
  )
}

// ─── Approving demo: the two-tier Manager → Owner chain ─

function ApprovalDetail({ stage, active }: { stage: 'manager' | 'owner' | 'approved'; active: string | null }) {
  const pill =
    stage === 'approved'
      ? { label: 'Approved', color: 'var(--color-success)' }
      : stage === 'owner'
        ? { label: 'Awaiting owner', color: 'var(--color-warning)' }
        : { label: 'Submitted', color: 'var(--color-primary)' }
  return (
    <div className="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Leave Request · CUTI/2026/014</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Budi Santoso</div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `color-mix(in srgb, ${pill.color} 14%, transparent)`, color: pill.color }}>{pill.label}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <DCard title="Employee">
          <KV k="Code" v="EMP-014" />
          <KV k="Dept" v="Operations" />
          <KV k="Position" v="Staff" />
        </DCard>
        <DCard title="Request">
          <KV k="Type" v="Annual leave" />
          <KV k="Dates" v="12 – 14 Jun" />
          <KV k="Days" v="3" />
        </DCard>
      </div>
      <div className="mt-3">
        <DCard title="Workflow">
          <TimelineStep label="Employee submitted" detail="Today, 09:12" state="done" />
          <TimelineStep label="Manager approval" detail={stage === 'manager' ? 'Awaiting approval' : 'Approved · just now'} state={stage === 'manager' ? 'active' : 'done'} />
          <TimelineStep label="Owner approval (final)" detail={stage === 'manager' ? 'Not yet reached' : stage === 'owner' ? 'Awaiting sign-off' : 'Approved · just now'} state={stage === 'manager' ? 'todo' : stage === 'owner' ? 'active' : 'done'} />
        </DCard>
      </div>
      {stage === 'approved' ? (
        <div data-demo-id="a-banner" className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-diff-add)', color: 'var(--color-success)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Approved — recorded to payroll &amp; leave
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Btn demoId="a-approve" active={active === 'a-approve'}>{stage === 'owner' ? 'Approve (owner)' : 'Approve'}</Btn>
          <Btn variant="ghost">Reject</Btn>
        </div>
      )}
    </div>
  )
}

const APPROVE_STEPS: TourStep[] = [
  { target: 'd-row', caption: 'A leave request is waiting — HR opens it' },
  { target: 'a-approve', caption: 'The manager reviews and approves' },
  { target: 'a-approve', caption: 'With owner approval on, the owner gives the final sign-off' },
  { target: 'a-banner', caption: 'Approved — recorded to payroll and leave' },
]

export function ApprovingDemo() {
  const [screen, setScreen] = useState<'list' | 'detail'>('list')
  const [stage, setStage] = useState<'manager' | 'owner' | 'approved'>('manager')
  const apply = useCallback((i: number) => {
    if (i === 0) setScreen('detail')
    else if (i === 1) setStage('owner')
    else if (i === 2) setStage('approved')
  }, [])
  const reset = useCallback(() => {
    setScreen('list')
    setStage('manager')
  }, [])
  const tour = useGuidedTour(APPROVE_STEPS, apply, reset)
  return (
    <DemoChrome label="Approving a request — the two-tier Manager → Owner chain." tour={tour} steps={APPROVE_STEPS}>
      <div ref={tour.stageRef} className="relative mx-auto" style={{ maxWidth: 820 }}>
        <DesktopFrame activeNav="Forms">
          {screen === 'list' && <DesktopList hasPending active={tour.activeTarget} />}
          {screen === 'detail' && <ApprovalDetail stage={stage} active={tour.activeTarget} />}
        </DesktopFrame>
        <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
      </div>
    </DemoChrome>
  )
}

// ─── Payroll & leave demo: what posts after approval ───

function PayrollScreen({ showAdj, showLeave, active }: { showAdj: boolean; showLeave: boolean; active: string | null }) {
  return (
    <div className="p-4">
      <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Payroll</div>
      <div className="mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>May 2026 · run pending</div>
      <div data-demo-id="p-row" className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(active === 'p-row') }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Budi Santoso</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Staff</span>
        </div>
        <div className="mt-2 space-y-1">
          <KV k="Base wage" v="Rp 5,000,000" />
          <KV k="Allowance" v="Rp 1,000,000" />
          {showAdj && (
            <div data-demo-id="p-adj" className="flex items-center justify-between rounded-md px-2 py-1 text-xs" style={{ backgroundColor: 'var(--color-diff-add)', ...ringStyle(active === 'p-adj') }}>
              <span style={{ color: 'var(--color-success)' }}>Overtime · LEMBUR/2026/042</span>
              <span className="font-semibold" style={{ color: 'var(--color-success)' }}>+Rp 184,500</span>
            </div>
          )}
          <div data-demo-id="p-total" className="flex items-center justify-between rounded-md border-t pt-1.5 text-sm font-semibold" style={{ borderColor: 'var(--color-border)', ...ringStyle(active === 'p-total') }}>
            <span style={{ color: 'var(--color-text)' }}>Total</span>
            <span style={{ color: showAdj ? 'var(--color-success)' : 'var(--color-text)' }}>{showAdj ? 'Rp 6,184,500' : 'Rp 6,000,000'}</span>
          </div>
        </div>
      </div>
      {showLeave && (
        <div data-demo-id="p-leave" className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(active === 'p-leave') }}>
          <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Annual leave · Andi Wijaya · CUTI/2026/015</div>
          <div className="mt-0.5 text-sm">
            <span className="line-through" style={{ color: 'var(--color-text-tertiary)' }}>12 days</span>{' '}
            <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>→ 9 days remaining</span>
          </div>
        </div>
      )}
    </div>
  )
}

const PAYROLL_STEPS: TourStep[] = [
  { target: 'p-row', caption: 'When an overtime request is approved, Flodok records it for you' },
  { target: 'p-adj', caption: 'It posts as a pay adjustment under PP35/2021 — base ÷ 173' },
  { target: 'p-total', caption: 'The total updates automatically — no re-keying' },
  { target: 'p-leave', caption: 'Leave requests decrement the balance the same way' },
]

export function PayrollDemo() {
  const [showAdj, setShowAdj] = useState(false)
  const [showLeave, setShowLeave] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 0) setShowAdj(true)
    else if (i === 2) setShowLeave(true)
  }, [])
  const reset = useCallback(() => {
    setShowAdj(false)
    setShowLeave(false)
  }, [])
  const tour = useGuidedTour(PAYROLL_STEPS, apply, reset)
  return (
    <DemoChrome label="After approval — overtime posts to payroll, leave to balances." tour={tour} steps={PAYROLL_STEPS}>
      <div ref={tour.stageRef} className="relative mx-auto" style={{ maxWidth: 820 }}>
        <DesktopFrame activeNav="Payroll" url="app.flodok.com/dashboard/payroll">
          <PayrollScreen showAdj={showAdj} showLeave={showLeave} active={tour.activeTarget} />
        </DesktopFrame>
        <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
      </div>
    </DemoChrome>
  )
}

// ─── Configuring demo: form-config toggles ─────────────

function Toggle({ on, demoId, active }: { on: boolean; demoId?: string; active?: boolean }) {
  return (
    <span
      data-demo-id={demoId}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
      style={{ backgroundColor: on ? 'var(--color-primary)' : 'var(--color-border-strong)', ...ringStyle(!!active) }}
    >
      <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }} />
    </span>
  )
}

function CheckItem({ label, on, demoId, active }: { label: string; on: boolean; demoId?: string; active?: boolean }) {
  return (
    <div data-demo-id={demoId} className="flex items-center gap-2 rounded-md px-1 py-0.5" style={ringStyle(!!active)}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded" style={{ backgroundColor: on ? 'var(--color-primary)' : 'transparent', border: on ? 'none' : '1.5px solid var(--color-border-strong)' }}>
        {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
      </span>
      <span className="truncate text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
    </div>
  )
}

function ConfigScreen({ unpaidOff, requireReason, gateOff, active }: { unpaidOff: boolean; requireReason: boolean; gateOff: boolean; active: string | null }) {
  return (
    <div className="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Form type</div>
      <div className="mb-3 mt-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Leave Request</div>

      {/* Controls show the positive sense; the *Off flags invert (on={!unpaidOff} / on={!gateOff}) — intentional, don't "fix". */}
      <DCard title="Leave types">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <CheckItem label="Annual" on />
          <CheckItem label="Unpaid" on={!unpaidOff} demoId="c-unpaid" active={active === 'c-unpaid'} />
          <CheckItem label="Sick (with note)" on />
          <CheckItem label="National holiday" on />
          <CheckItem label="Short time" on />
          <CheckItem label="Special" on />
        </div>
      </DCard>

      <div className="mt-3">
        <DCard title="Form fields">
          <div className="flex items-center justify-between py-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Require a reason</span>
            <Toggle on={requireReason} demoId="c-reason" active={active === 'c-reason'} />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>12-month service gate</span>
            <Toggle on={!gateOff} demoId="c-gate" active={active === 'c-gate'} />
          </div>
        </DCard>
      </div>

      <div data-demo-id="c-saved" className="mt-3 inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-[11px]" style={{ color: 'var(--color-success)', ...ringStyle(active === 'c-saved') }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        Changes are saved automatically
      </div>
    </div>
  )
}

const CONFIG_STEPS: TourStep[] = [
  { target: 'c-unpaid', caption: 'Turn individual leave types on or off' },
  { target: 'c-reason', caption: 'Make a reason required if you want one' },
  { target: 'c-gate', caption: 'Control the 12-month annual-leave service gate' },
  { target: 'c-saved', caption: 'Changes apply right away — no save button' },
]

export function ConfigDemo() {
  const [unpaidOff, setUnpaidOff] = useState(false)
  const [requireReason, setRequireReason] = useState(false)
  const [gateOff, setGateOff] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 0) setUnpaidOff(true)
    else if (i === 1) setRequireReason(true)
    else if (i === 2) setGateOff(true)
  }, [])
  const reset = useCallback(() => {
    setUnpaidOff(false)
    setRequireReason(false)
    setGateOff(false)
  }, [])
  const tour = useGuidedTour(CONFIG_STEPS, apply, reset)
  return (
    <DemoChrome label="Configuring a form — choose what it offers." tour={tour} steps={CONFIG_STEPS}>
      <div ref={tour.stageRef} className="relative mx-auto" style={{ maxWidth: 820 }}>
        <DesktopFrame activeNav="Forms" url="app.flodok.com/dashboard/forms/config/leave_request">
          <ConfigScreen unpaidOff={unpaidOff} requireReason={requireReason} gateOff={gateOff} active={tour.activeTarget} />
        </DesktopFrame>
        <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
      </div>
    </DemoChrome>
  )
}

// ─── Reusable stage wrappers (for the per-section demos) ─

export function DesktopStage({ tour, label, steps, activeNav = 'Forms', url = 'app.flodok.com/dashboard', maxWidth = 820, children }: { tour: GuidedTour; label: string; steps: TourStep[]; activeNav?: string; url?: string; maxWidth?: number; children: ReactNode }) {
  return (
    <DemoChrome label={label} tour={tour} steps={steps}>
      <div ref={tour.stageRef} className="relative mx-auto" style={{ maxWidth }}>
        <DesktopFrame activeNav={activeNav} url={url}>{children}</DesktopFrame>
        <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
      </div>
    </DemoChrome>
  )
}

export function PhoneStage({ tour, label, steps, children }: { tour: GuidedTour; label: string; steps: TourStep[]; children: ReactNode }) {
  return (
    <DemoChrome label={label} tour={tour} steps={steps}>
      <div className="mx-auto" style={{ maxWidth: 320 }}>
        <PhoneShell innerRef={tour.stageRef}>
          {children}
          <Cursor x={tour.cursor.x} y={tour.cursor.y} clicking={tour.clicking} reduced={tour.reduced} visible={tour.moved} />
        </PhoneShell>
      </div>
    </DemoChrome>
  )
}
