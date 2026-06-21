// Guided demos for the Help Center "Performance" section. Each is a single,
// state-driven desktop surface: a fake cursor visits the highlighted targets
// and flips local state to show change in place (no screen swaps).

import { useCallback, useState } from 'react'
import {
  DesktopStage,
  useGuidedTour,
  ringStyle,
  Btn,
  DCard,
  KV,
  TimelineStep,
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

// ─── 1. Performance reviews ────────────────────────────

const REVIEW_STEPS: TourStep[] = [
  { target: 'r-month-strip', caption: 'Pick the month — each card sums that month’s activity' },
  { target: 'r-employee-card', caption: 'Open an employee card to see their detailed performance' },
  { target: 'r-compensation-ring', caption: 'Review their compensation adjustments and badges' },
  { target: 'r-activity-log', caption: 'Scroll the activity log of every adjustment and award' },
  { target: 'r-award-button', caption: 'Award an achievement from the Badges section' },
]

function MonthStrip({ active }: { active: boolean }) {
  const months = ['Mar', 'Apr', 'May', 'Jun']
  return (
    <div
      data-demo-id="r-month-strip"
      className="mb-3 inline-flex items-center gap-1 rounded-lg border p-1"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(active) }}
    >
      {months.map((m) => {
        const sel = m === 'Jun'
        return (
          <span
            key={m}
            className="rounded-md px-2.5 py-1 text-[11px] font-medium"
            style={{
              backgroundColor: sel ? 'var(--color-primary)' : 'transparent',
              color: sel ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {m}
          </span>
        )
      })}
    </div>
  )
}

export function PerformanceReviewsDemo() {
  const [open, setOpen] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 1) setOpen(true)
  }, [])
  const reset = useCallback(() => setOpen(false), [])
  const tour = useGuidedTour(REVIEW_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Performance reviews — one month, one card, one full picture."
      steps={REVIEW_STEPS}
      activeNav="Performance"
      url="app.flodok.com/dashboard/performance"
    >
      <div className="p-4">
        <div className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Performance</div>
        <MonthStrip active={at === 'r-month-strip'} />

        {/* Roster card that expands in place into a detail view */}
        <div
          data-demo-id="r-employee-card"
          className="rounded-xl border p-3"
          style={{
            borderColor: at === 'r-employee-card' ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            ...ringStyle(at === 'r-employee-card'),
          }}
        >
          <div className="flex items-center gap-3">
            <Avatar initials="BS" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Budi Santoso</div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Operations · Sales Lead</div>
            </div>
            <Adjustment positive>+Rp 500K</Adjustment>
            <div className="flex items-center gap-1">
              <Badge glyph="🏆" />
              <Badge glyph="⭐" />
              <Badge glyph="🚀" />
            </div>
          </div>
        </div>

        {open && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <DCard title="Compensation" demoId="r-compensation-ring" active={at === 'r-compensation-ring'}>
              <KV k="Base wage" v="Rp 8,000,000" />
              <KV k="Net adjustments" v="+Rp 500,000" />
              <KV k="Badges" v="3 badges" />
            </DCard>
            <DCard title="Activity log" demoId="r-activity-log" active={at === 'r-activity-log'}>
              <TimelineStep label="Reward · +Rp 500K" detail="Closed Q2 target · 18 Jun" state="done" />
              <TimelineStep label="Badge · Top Performer" detail="Awarded · 12 Jun" state="done" />
              <TimelineStep label="Badge · Team Player" detail="Awarded · 4 Jun" state="done" />
            </DCard>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Badges</span>
          <div style={{ width: 180 }}>
            <Btn demoId="r-award-button" active={at === 'r-award-button'}>+ Award badge</Btn>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── 2. One-on-ones ────────────────────────────────────

const ONE_ON_ONE_STEPS: TourStep[] = [
  { target: 'd-1on1-table', caption: 'Every manager–direct 1:1 pair, with the next session date' },
  { target: 'd-1on1-row', caption: 'Open a 1:1 to reveal the shared session document' },
  { target: 'p-1on1-doc', caption: 'Both sides see and edit the same agenda' },
  { target: 'd-agenda-add', caption: 'The manager adds an agenda item before the meeting' },
  { target: 'd-agenda-status', caption: 'Afterwards, mark items done or roll them forward' },
  { target: 'p-feedback-log', caption: 'Recognition moments collect here for review prep' },
]

function PairRow({ name, next, last, demoId, active }: { name: string; next: string; last: string; demoId?: string; active?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center gap-3 border-t px-3 py-2.5 text-xs first:border-t-0"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none',
      }}
    >
      <span className="flex-1 truncate font-medium" style={{ color: 'var(--color-text)' }}>{name}</span>
      <span className="hidden w-24 sm:block" style={{ color: 'var(--color-primary)' }}>{next}</span>
      <span className="hidden w-24 sm:block" style={{ color: 'var(--color-text-tertiary)' }}>{last}</span>
    </div>
  )
}

function AgendaItem({ label, state }: { label: string; state: 'done' | 'todo' }) {
  const done = state === 'done'
  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
        style={{ backgroundColor: done ? 'var(--color-success)' : 'transparent', border: done ? 'none' : '1.5px solid var(--color-border-strong)' }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        )}
      </span>
      <span className="truncate text-xs" style={{ color: done ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)', textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
    </div>
  )
}

export function OneOnOnesDemo() {
  const [openDoc, setOpenDoc] = useState(false)
  const [added, setAdded] = useState(false)
  const [resolved, setResolved] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 1) setOpenDoc(true)
    else if (i === 3) setAdded(true)
    else if (i === 4) setResolved(true)
  }, [])
  const reset = useCallback(() => {
    setOpenDoc(false)
    setAdded(false)
    setResolved(false)
  }, [])
  const tour = useGuidedTour(ONE_ON_ONE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="1:1s — a shared, living document for every manager–direct pair."
      steps={ONE_ON_ONE_STEPS}
      activeNav="Performance"
      url="app.flodok.com/dashboard/performance/1-on-1s"
    >
      <div className="p-4">
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>1:1s</div>

        <div data-demo-id="d-1on1-table" className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)', ...ringStyle(at === 'd-1on1-table') }}>
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            <span className="flex-1">Pair</span>
            <span className="hidden w-24 sm:block">Next session</span>
            <span className="hidden w-24 sm:block">Last session</span>
          </div>
          <PairRow name="Adi → Eka" next="Tomorrow" last="6 Jun" demoId="d-1on1-row" active={at === 'd-1on1-row'} />
          <PairRow name="Siti → Maya" next="Next Tue" last="3 Jun" />
          <PairRow name="Andi → Rian" next="12 Jun" last="29 May" />
        </div>

        {openDoc && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <DCard title="Shared agenda · Adi & Eka" demoId="p-1on1-doc" active={at === 'p-1on1-doc'}>
              <AgendaItem label="Q2 goals check-in" state={resolved ? 'done' : 'todo'} />
              <AgendaItem label="Career path for H2" state="todo" />
              {added && <AgendaItem label="Conference budget request" state="todo" />}
              <div className="mt-1" style={{ width: 150 }}>
                <Btn demoId="d-agenda-add" active={at === 'd-agenda-add'} variant="ghost">+ Add agenda item</Btn>
              </div>
              <div
                data-demo-id="d-agenda-status"
                className="mt-2 rounded-md px-2 py-1 text-[11px]"
                style={{
                  color: resolved ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  backgroundColor: resolved ? 'var(--color-diff-add)' : 'transparent',
                  ...ringStyle(at === 'd-agenda-status'),
                }}
              >
                {resolved ? '1 done · others rolled forward' : 'Mark done or roll forward after the meeting'}
              </div>
            </DCard>

            <DCard title="Feedback log" demoId="p-feedback-log" active={at === 'p-feedback-log'}>
              <TimelineStep label="Praised pipeline discipline" detail="14 Jun" state="done" />
              <TimelineStep label="Mentored a new hire" detail="7 Jun" state="done" />
              <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Surfaces automatically at review prep</div>
            </DCard>
          </div>
        )}
      </div>
    </DesktopStage>
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
