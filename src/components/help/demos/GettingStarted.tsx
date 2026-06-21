// Self-playing guided demos for the Help Center "Getting started" section.
// Each is a single, state-driven screen: a fake cursor visits [data-demo-id]
// targets and "clicks", flipping booleans to show change in place. Every
// target stays mounted at all times so the tour never points at a missing node.

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DesktopStage,
  useGuidedTour,
  ringStyle,
  Btn,
  FakePill,
  DCard,
  Field,
  KV,
  type TourStep,
} from '../GuidedDemo'

// ─── Quickstart: create your first SOP from the dashboard ──────────────

const QS_STEPS: TourStep[] = [
  { target: 'qs-sop-card', caption: 'Start from the "Create your first SOP" card' },
  { target: 'qs-sop-title', caption: 'Give it a title — "Safety Procedures"' },
  { target: 'qs-sop-create-btn', caption: 'Click Create to open the bilingual editor' },
  { target: 'qs-editor-main', caption: 'Write once in English, Indonesian sits side by side' },
  { target: 'qs-save-draft', caption: 'Save your draft — you can publish later' },
  { target: 'qs-settings-nav', caption: 'Next stop: invite your team from Settings' },
]

function QSCard({ title, sub, demoId, active, accent }: { title: string; sub: string; demoId?: string; active?: boolean; accent?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="rounded-lg border p-3"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: accent ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary))' : 'var(--color-bg-secondary)',
        ...ringStyle(!!active),
      }}
    >
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{title}</div>
      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>
    </div>
  )
}

export function QuickstartDemo() {
  const [phase, setPhase] = useState<'cards' | 'create' | 'editor' | 'saved'>('cards')
  const [titled, setTitled] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 0) setPhase('create')
    else if (i === 1) setTitled(true)
    else if (i === 2) setPhase('editor')
    else if (i === 4) setPhase('saved')
  }, [])
  const reset = useCallback(() => {
    setPhase('cards')
    setTitled(false)
  }, [])

  const tour = useGuidedTour(QS_STEPS, apply, reset)
  const at = tour.activeTarget
  const inEditor = phase === 'editor' || phase === 'saved'

  return (
    <DesktopStage
      tour={tour}
      label="From an empty dashboard to your first saved SOP in five clicks."
      steps={QS_STEPS}
      activeNav="Overview"
      url="app.flodok.com/dashboard"
    >
      <div className="p-4">
        <div className="mb-3">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Welcome to Flodok</div>
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>A few quick steps to set up your workspace.</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <QSCard demoId="qs-sop-card" active={at === 'qs-sop-card'} accent title="Create your first SOP" sub="Write a procedure" />
          <QSCard title="Publish a contract" sub="Send & sign" />
          <QSCard title="Invite your team" sub="Add teammates" />
          <QSCard title="Set up your portal" sub="Share the link" />
          <QSCard title="Browse the docs" sub="Help Center" />
          <QSCard title="Acme Indonesia" sub="Organization" />
        </div>

        {/* Create panel + editor share one block; we flip its contents in place. */}
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          {!inEditor ? (
            <div className="space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>New SOP</div>
              <Field
                label="SOP title"
                value={titled ? 'Safety Procedures' : ''}
                placeholder="e.g. Safety Procedures"
                demoId="qs-sop-title"
                active={at === 'qs-sop-title'}
                caret={titled ? <span className="ml-1 inline-block h-3.5 w-px" style={{ backgroundColor: 'var(--color-primary)' }} /> : undefined}
              />
              <div style={{ opacity: titled ? 1 : 0.55 }}>
                <Btn demoId="qs-sop-create-btn" active={at === 'qs-sop-create-btn'}>Create SOP</Btn>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Safety Procedures</div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                  {phase === 'saved' ? 'Draft saved' : 'Draft'}
                </span>
              </div>
              <div data-demo-id="qs-editor-main" className="grid grid-cols-2 gap-2 rounded-md p-1" style={ringStyle(at === 'qs-editor-main')}>
                <div className="rounded-md border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>English</div>
                  <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Always wear protective equipment in the warehouse.</div>
                </div>
                <div className="rounded-md border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Indonesian</div>
                  <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Selalu kenakan alat pelindung di gudang.</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div style={{ width: 160 }}>
                  <Btn demoId="qs-save-draft" active={at === 'qs-save-draft'} variant="ghost">Save draft</Btn>
                </div>
                {phase === 'saved' && (
                  <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-success)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    Draft saved
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2" data-demo-id="qs-settings-nav" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'qs-settings-nav') }}>
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Settings → Team Members</span>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── Plans: pricing page + graduated seat calculator ──────────────────

const PLANS_STEPS: TourStep[] = [
  { target: 'plans-free-card', caption: 'The Free plan covers small teams — Rp 0 forever' },
  { target: 'plans-pro-card', caption: 'Pro unlocks growth features, billed per seat' },
  { target: 'plans-slider', caption: 'Drag the calculator to your headcount' },
  { target: 'plans-brackets', caption: 'Seats are priced in graduated brackets' },
  { target: 'plans-calc-result', caption: 'The monthly total updates as you scale' },
  { target: 'plans-comparison-table', caption: 'Compare Free vs Pro feature by feature' },
]

function FeatureLine({ label, free, pro }: { label: string; free: boolean | string; pro: boolean | string }) {
  const cell = (v: boolean | string) =>
    typeof v === 'string' ? (
      <span style={{ color: 'var(--color-text)' }}>{v}</span>
    ) : v ? (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    ) : (
      <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
    )
  return (
    <div className="grid grid-cols-3 items-center gap-2 border-t px-2 py-1.5 text-[11px] first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="text-center">{cell(free)}</span>
      <span className="text-center">{cell(pro)}</span>
    </div>
  )
}

export function PlansDemo() {
  // false = 10 employees (Rp 1,000,000), true = 25 employees (Rp 2,700,000).
  const [big, setBig] = useState(false)
  const seats = big ? 25 : 10
  const total = big ? 'Rp 2.700.000' : 'Rp 1.000.000'

  const apply = useCallback((i: number) => {
    if (i === 2) setBig(true)
  }, [])
  const reset = useCallback(() => setBig(false), [])

  const tour = useGuidedTour(PLANS_STEPS, apply, reset)
  const at = tour.activeTarget
  // Slider fill: 10 emp ≈ 22%, 25 emp ≈ 56% along a 1–45 track.
  const fill = big ? 56 : 22

  return (
    <DesktopStage
      tour={tour}
      label="Free forever for small teams, Pro priced in graduated seat brackets."
      steps={PLANS_STEPS}
      activeNav=""
      url="app.flodok.com/pricing"
    >
      <div className="p-4">
        <div className="mb-3 text-center">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Pricing built for Indonesian teams</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DCard title="Free · forever" demoId="plans-free-card" active={at === 'plans-free-card'}>
            <div className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>Rp 0</div>
            <div className="mt-1 space-y-0.5">
              <KV k="Team size" v="Up to 5" />
              <KV k="SOPs & contracts" v="Unlimited" />
              <KV k="Employee portal" v="Included" />
            </div>
          </DCard>
          <div data-demo-id="plans-pro-card" className="rounded-lg border p-3" style={{ borderColor: at === 'plans-pro-card' ? 'var(--color-primary)' : 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary))', ...ringStyle(at === 'plans-pro-card') }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>Pro</span>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>For growing teams</span>
            </div>
            <div className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>From Rp 100.000<span className="text-xs font-normal" style={{ color: 'var(--color-text-tertiary)' }}>/mo</span></div>
            <div className="mt-1 space-y-0.5">
              <KV k="Team size" v="Unlimited" />
              <KV k="AI & integrations" v="Included" />
              <KV k="Approvals & SSO" v="Included" />
            </div>
          </div>
        </div>

        {/* Calculator */}
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Estimate your monthly cost</span>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--color-primary)' }}>{seats} employees</span>
          </div>
          <div data-demo-id="plans-slider" className="relative mt-2 h-5 rounded-md px-1" style={ringStyle(at === 'plans-slider')}>
            <div className="absolute left-1 right-1 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: 'var(--color-border-strong)' }} />
            <div className="absolute left-1 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ width: `calc(${fill}% - 4px)`, backgroundColor: 'var(--color-primary)', transition: 'width 360ms ease' }} />
            <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 shadow" style={{ left: `calc(${fill}% - 8px)`, borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg)', transition: 'left 360ms ease' }} />
          </div>

          <div data-demo-id="plans-brackets" className="mt-3 grid grid-cols-3 gap-2" style={ringStyle(at === 'plans-brackets')}>
            <div className="rounded-md border p-2 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Seats 1–15</div>
              <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Rp 100k</div>
            </div>
            <div className="rounded-md border p-2 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Seats 16–40</div>
              <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Rp 70k</div>
            </div>
            <div className="rounded-md border p-2 text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Seats 41+</div>
              <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Rp 50k</div>
            </div>
          </div>

          <div data-demo-id="plans-calc-result" className="mt-3 flex items-center justify-between rounded-md px-3 py-2" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', ...ringStyle(at === 'plans-calc-result') }}>
            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{big ? '15 × 100k + 10 × 70k' : '10 × 100k'}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>{total}<span className="text-[11px] font-normal" style={{ color: 'var(--color-text-tertiary)' }}> / month</span></span>
          </div>
        </div>

        {/* Comparison table */}
        <div data-demo-id="plans-comparison-table" className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)', ...ringStyle(at === 'plans-comparison-table') }}>
          <div className="grid grid-cols-3 gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            <span>Feature</span>
            <span className="text-center">Free</span>
            <span className="text-center">Pro</span>
          </div>
          <FeatureLine label="SOPs & contracts" free pro />
          <FeatureLine label="AI drafting" free={false} pro />
          <FeatureLine label="Integrations" free={false} pro />
          <FeatureLine label="Team size" free="5" pro="∞" />
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── Roles: who sees what across the four access levels ───────────────

const ROLES_STEPS: TourStep[] = [
  { target: 'role-admin-badge', caption: 'Admin: full access to every section, including Payroll' },
  { target: 'role-manager-badge', caption: 'Manager: their department’s people and performance' },
  { target: 'role-employee-badge', caption: 'Employee: read access to assigned SOPs and contracts' },
  { target: 'role-portal-badge', caption: 'Portal-only: a public link, no account needed' },
  { target: 'role-legend', caption: 'The legend summarises what each role can do' },
]

type RoleKey = 'admin' | 'manager' | 'employee' | 'portal'

const ROLE_NAV: Record<RoleKey, Set<string>> = {
  admin: new Set(['Overview', 'Inbox', 'Hiring', 'Forms', 'Recruitment', 'Documents', 'Employees', 'Performance', 'Payroll', 'Spotlight', 'Pending', 'Company', 'Settings']),
  manager: new Set(['Overview', 'Inbox', 'Hiring', 'Recruitment', 'Employees', 'Performance']),
  employee: new Set(['Overview', 'Inbox', 'Documents', 'Performance']),
  portal: new Set([]),
}

const ROLE_NOTE: Record<RoleKey, string> = {
  admin: 'Full access to everything',
  manager: 'Department data only',
  employee: 'Read access to assigned SOPs and contracts',
  portal: 'No account — public link access only',
}

const ROLE_NAV_PREVIEW = ['Overview', 'Inbox', 'Recruitment', 'Documents', 'Employees', 'Performance', 'Payroll', 'Settings']

function RoleBadge({ label, note, demoId, active, selected }: { label: string; note: string; demoId: string; active: boolean; selected: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary))' : 'var(--color-bg-secondary)',
        ...ringStyle(active),
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: selected ? 'var(--color-primary)' : 'var(--color-text)' }}>{label}</span>
        {selected && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />}
      </div>
      <div className="mt-0.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{note}</div>
    </div>
  )
}

export function RolesDemo() {
  const [role, setRole] = useState<RoleKey>('admin')

  const apply = useCallback((i: number) => {
    if (i === 0) setRole('admin')
    else if (i === 1) setRole('manager')
    else if (i === 2) setRole('employee')
    else if (i === 3) setRole('portal')
  }, [])
  const reset = useCallback(() => setRole('admin'), [])

  const tour = useGuidedTour(ROLES_STEPS, apply, reset)
  const at = tour.activeTarget
  const visible = ROLE_NAV[role]

  return (
    <DesktopStage
      tour={tour}
      label="Four roles, four levels of access — the sidebar adapts to each one."
      steps={ROLES_STEPS}
      activeNav="Overview"
      url="app.flodok.com/dashboard"
    >
      <div className="p-4">
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Roles & access</div>

        <div className="grid grid-cols-2 gap-3">
          {/* What this role sees in the nav */}
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Visible to this role</div>
            <div className="space-y-1">
              {ROLE_NAV_PREVIEW.map((item) => {
                const on = visible.has(item)
                return (
                  <div key={item} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium" style={{ backgroundColor: on ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent', color: on ? 'var(--color-primary)' : 'var(--color-text-tertiary)', opacity: on ? 1 : 0.5, transition: 'opacity 200ms, background-color 200ms' }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? 'var(--color-primary)' : 'var(--color-border-strong)' }} />
                    <span className="truncate">{item}</span>
                    {!on && <span className="ml-auto text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>hidden</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* The role legend */}
          <div data-demo-id="role-legend" className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'role-legend') }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Role legend</div>
            <div className="space-y-2">
              <RoleBadge demoId="role-admin-badge" label="Admin" note={ROLE_NOTE.admin} active={at === 'role-admin-badge'} selected={role === 'admin'} />
              <RoleBadge demoId="role-manager-badge" label="Manager" note={ROLE_NOTE.manager} active={at === 'role-manager-badge'} selected={role === 'manager'} />
              <RoleBadge demoId="role-employee-badge" label="Employee" note={ROLE_NOTE.employee} active={at === 'role-employee-badge'} selected={role === 'employee'} />
              <RoleBadge demoId="role-portal-badge" label="Portal-only" note={ROLE_NOTE.portal} active={at === 'role-portal-badge'} selected={role === 'portal'} />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[11px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          Portal-only users never log in — they reach their page through a private link.
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── Invite team: open the form, set a role, send, see the pending row ─

const INVITE_STEPS: TourStep[] = [
  { target: 'invite-btn', caption: 'Open the invite form from Team Members' },
  { target: 'invite-email', caption: 'Enter your teammate’s email address' },
  { target: 'invite-role', caption: 'Pick the role they should have' },
  { target: 'invite-role-hr', caption: 'Choose HR — can manage team and approvals' },
  { target: 'invite-send', caption: 'Send the invite — a link is generated' },
  { target: 'pending-invite-row', caption: 'It appears as a pending invite you can copy or revoke' },
]

function RoleOption({ label, sub, demoId, active, selected }: { label: string; sub: string; demoId?: string; active?: boolean; selected?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center justify-between rounded-md border px-2.5 py-1.5"
      style={{
        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
        ...ringStyle(!!active),
      }}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>
      </div>
      {selected && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      )}
    </div>
  )
}

function MemberRow({ name, email, role, badge }: { name: string; email: string; role: string; badge: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t px-3 py-2 text-xs first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{name}</div>
        <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{email}</div>
      </div>
      <span className="hidden w-24 truncate sm:block" style={{ color: 'var(--color-text-secondary)' }}>{role}</span>
      {badge}
    </div>
  )
}

function RolePill({ label, tone }: { label: string; tone: 'primary' | 'muted' | 'warning' }) {
  const color = tone === 'primary' ? 'var(--color-primary)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-tertiary)'
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{label}</span>
  )
}

export function InviteTeamDemo() {
  const [open, setOpen] = useState(false)
  const [emailed, setEmailed] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [picked, setPicked] = useState<'member' | 'hr' | null>(null)
  const [sent, setSent] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 0) setOpen(true)
    else if (i === 1) setEmailed(true)
    else if (i === 2) setRoleOpen(true)
    else if (i === 3) setPicked('hr')
    else if (i === 4) setSent(true)
  }, [])
  const reset = useCallback(() => {
    setOpen(false)
    setEmailed(false)
    setRoleOpen(false)
    setPicked(null)
    setSent(false)
  }, [])

  const tour = useGuidedTour(INVITE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Invite a teammate, give them a role, and track the pending invite."
      steps={INVITE_STEPS}
      activeNav="Settings"
      url="app.flodok.com/dashboard/settings?tab=team"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Team Members</div>
          <div className="flex items-center gap-2">
            <div style={{ width: 140 }}>
              <Btn variant="ghost">Transfer ownership</Btn>
            </div>
            <div style={{ width: 130 }}>
              <Btn demoId="invite-btn" active={at === 'invite-btn'}>Invite people</Btn>
            </div>
          </div>
        </div>

        {/* Current members */}
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            <span className="flex-1">Member</span>
            <span className="hidden w-24 sm:block">Linked</span>
            <span className="w-14">Role</span>
          </div>
          <MemberRow name="You" email="hello@acme.id" role="Founder" badge={<RolePill label="Owner" tone="warning" />} />
          <MemberRow name="Dewi Lestari" email="dewi@acme.id" role="Dewi L." badge={<RolePill label="Admin" tone="primary" />} />
        </div>

        {/* Invite panel: flips in place between collapsed → form → success. */}
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: open ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          {!open ? (
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Use “Invite people” to add a teammate by email.</div>
          ) : !sent ? (
            <div className="space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Invite a teammate</div>
              <Field
                label="Email"
                value={emailed ? 'teammate@company.com' : ''}
                placeholder="name@company.com"
                demoId="invite-email"
                active={at === 'invite-email'}
              />
              <div>
                <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Role</div>
                <div
                  data-demo-id="invite-role"
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: at === 'invite-role' || roleOpen ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: picked ? 'var(--color-text)' : 'var(--color-text-tertiary)', ...ringStyle(at === 'invite-role') }}
                >
                  <span>{picked === 'hr' ? 'HR' : picked === 'member' ? 'Member' : 'Select a role…'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                {roleOpen && (
                  <div className="mt-1.5 space-y-1.5">
                    <RoleOption label="Member" sub="View and sign their own documents" selected={picked === 'member'} />
                    <RoleOption demoId="invite-role-hr" active={at === 'invite-role-hr'} label="HR" sub="Can manage team and approvals" selected={picked === 'hr'} />
                    <RoleOption label="Admin" sub="Full access, including billing" selected={false} />
                  </div>
                )}
              </div>
              <Btn demoId="invite-send" active={at === 'invite-send'}>Send invite</Btn>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--color-success)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Invite sent — share the link
              </div>
              <div className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>app.flodok.com/invite/h7k2-9fa1</span>
                <FakePill>Copy link</FakePill>
              </div>
            </div>
          )}
        </div>

        {/* Pending invites — the new row reveals after send. */}
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Pending invites</div>
          <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
            {sent ? (
              <div data-demo-id="pending-invite-row" className="flex items-center gap-3 px-3 py-2 text-xs" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)', ...ringStyle(at === 'pending-invite-row') }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" style={{ color: 'var(--color-text)' }}>teammate@company.com</div>
                  <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Expires in 7 days</div>
                </div>
                <RolePill label="HR" tone="primary" />
                <FakePill>Copy</FakePill>
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-danger)' }}>Revoke</span>
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>No pending invites</div>
            )}
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
