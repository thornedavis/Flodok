// Guided demos for the Help Center "Performance" section. Each is a single,
// state-driven desktop surface: a fake cursor visits the highlighted targets
// and flips local state to show change in place (no screen swaps).

import { useCallback, useState } from 'react'
import {
  DesktopStage,
  useGuidedTour,
  ringStyle,
  Btn,
  type TourStep,
} from '../GuidedDemo'

// ─── Small shared pieces ───────────────────────────────

function Avatar({ initials }: { initials: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
      style={{ background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)' }}
    >
      {initials}
    </div>
  )
}

function Badge({ glyph }: { glyph: string }) {
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)' }}
    >
      {glyph}
    </span>
  )
}

function Adjustment({ positive, children }: { positive: boolean; children: string }) {
  const color = positive ? 'var(--color-success)' : 'var(--color-danger)'
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {children}
    </span>
  )
}

// ─── 3. Recognition ────────────────────────────────────

const RECOGNITION_STEPS: TourStep[] = [
  { target: 'r-employee-row', caption: 'Find the employee in the roster you want to recognise' },
  { target: 'r-actions-menu', caption: 'Open their actions menu — Reward, Penalise, Award badge' },
  { target: 'r-award-achievement', caption: 'Click Award badge to give a badge' },
  { target: 'm-achievement-select', caption: 'Pick the badge to award' },
  { target: 'm-reason-textarea', caption: 'Add a reason — and optionally backdate it' },
  { target: 'm-submit-award', caption: 'Submit — the badge lands on their card' },
]

function MenuItem({ label, color, demoId, active }: { label: string; color: string; demoId?: string; active?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium"
      style={{ color, ...ringStyle(!!active) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  )
}

export function RecognitionDemo() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [awarded, setAwarded] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 1) setMenuOpen(true)
    else if (i === 2) { setMenuOpen(false); setModalOpen(true) }
    else if (i === 5) { setModalOpen(false); setAwarded(true) }
  }, [])
  const reset = useCallback(() => {
    setMenuOpen(false)
    setModalOpen(false)
    setAwarded(false)
  }, [])
  const tour = useGuidedTour(RECOGNITION_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Recognition — award a badge in a couple of clicks."
      steps={RECOGNITION_STEPS}
      activeNav="Performance"
      url="app.flodok.com/dashboard/performance"
    >
      <div className="p-4">
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Performance</div>

        <div
          data-demo-id="r-employee-row"
          className="rounded-xl border p-3"
          style={{
            borderColor: at === 'r-employee-row' ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            ...ringStyle(at === 'r-employee-row'),
          }}
        >
          <div className="flex items-center gap-3">
            <Avatar initials="MP" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Maya Putri</div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Design · Product Designer</div>
            </div>
            <Adjustment positive>+Rp 250K</Adjustment>
            <div className="flex items-center gap-1">
              <Badge glyph="🎨" />
              <Badge glyph="⭐" />
              <Badge glyph="🤝" />
              {awarded && <Badge glyph="🏅" />}
            </div>
            {/* three-dot actions trigger */}
            <span
              data-demo-id="r-actions-menu"
              className="flex h-7 w-7 items-center justify-center rounded-md border"
              style={{ borderColor: at === 'r-actions-menu' ? 'var(--color-primary)' : 'var(--color-border)', color: 'var(--color-text-secondary)', ...ringStyle(at === 'r-actions-menu') }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
            </span>
          </div>

          {menuOpen && (
            <div className="mt-2 w-48 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              <MenuItem label="Reward" color="var(--color-success)" />
              <MenuItem label="Penalise" color="var(--color-danger)" />
              <MenuItem label="Award badge" color="var(--color-primary)" demoId="r-award-achievement" active={at === 'r-award-achievement'} />
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg)' }}>
            <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Award badge</div>

            <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Pick a badge</div>
            <div
              data-demo-id="m-achievement-select"
              className="mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: at === 'm-achievement-select' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', ...ringStyle(at === 'm-achievement-select') }}
            >
              <span>🏅 Design Excellence</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>

            <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Reason · optional backdate (max 90 days)</div>
            <div
              data-demo-id="m-reason-textarea"
              className="mb-3 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: at === 'm-reason-textarea' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)', minHeight: 48, ...ringStyle(at === 'm-reason-textarea') }}
            >
              Redesigned the onboarding flow · 12 Jun 2026
            </div>

            <div style={{ width: 160 }}>
              <Btn demoId="m-submit-award" active={at === 'm-submit-award'}>Award</Btn>
            </div>
          </div>
        )}
      </div>
    </DesktopStage>
  )
}
