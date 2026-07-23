// Self-playing guided demos for the Help Center "Employee Portal" section.
// Each component is a single-screen, cursor-driven walkthrough built on the
// shared GuidedDemo kit. State booleans flip element text/style in place so
// every [data-demo-id] target is present in the DOM at all times.

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DesktopStage,
  PhoneStage,
  useGuidedTour,
  ringStyle,
  Btn,
  Field,
  ScreenTitle,
  type TourStep,
} from '../GuidedDemo'

// ─── Shared tiny helpers ───────────────────────────────────

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span className="font-medium" style={{ color: accent ? 'var(--color-success)' : 'var(--color-text)' }}>{value}</span>
    </div>
  )
}

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

function TabPill({ label, badge, demoId, active, current }: { label: string; badge?: string; demoId?: string; active?: boolean; current?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="relative flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-[9px] font-medium"
      style={{ color: current ? 'var(--color-primary)' : 'var(--color-text-tertiary)', ...ringStyle(!!active) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: current ? 'var(--color-primary)' : 'var(--color-border-strong)' }} />
      <span>{label}</span>
      {badge && (
        <span className="absolute -top-0.5 right-2 rounded-full px-1 text-[8px] font-semibold text-white" style={{ backgroundColor: 'var(--color-danger)' }}>{badge}</span>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// portal-about — the employee portal home tab
// ═══════════════════════════════════════════════════════

const ABOUT_STEPS: TourStep[] = [
  { target: 'p-home-tab', caption: 'The home tab opens to a pay-and-progress overview' },
  { target: 'p-month-strip', caption: 'Scrub the month strip to see past months — May is current' },
  { target: 'p-compensation-ring', caption: 'The ring breaks pay into base, allowance and credits' },
  { target: 'p-activity-feed', caption: 'Recent activity logs signings, badges and bonuses' },
  { target: 'p-notifications', caption: 'The bell collects to-dos and recent rewards' },
  { target: 'p-nav-tabs', caption: 'Five tabs: home, docs, requests, badges and leaderboard' },
]

const MONTHS = ['Feb', 'Mar', 'Apr', 'May']

export function PortalAboutDemo() {
  const [month, setMonth] = useState('May')
  const [ringFocus, setRingFocus] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [tabView, setTabView] = useState<'home' | 'docs' | 'requests'>('home')

  const apply = useCallback((i: number) => {
    if (i === 1) setMonth('Apr')
    else if (i === 2) { setMonth('May'); setRingFocus(true) }
    else if (i === 4) setBellOpen(true)
    else if (i === 5) setTabView('docs')
  }, [])
  const reset = useCallback(() => { setMonth('May'); setRingFocus(false); setBellOpen(false); setTabView('home') }, [])
  const tour = useGuidedTour(ABOUT_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <PhoneStage tour={tour} label="The portal home tab — an employee’s pay-and-progress overview." steps={ABOUT_STEPS}>
      <div className="space-y-3">
        <div data-demo-id="p-home-tab" className="flex items-center justify-between" style={ringStyle(at === 'p-home-tab')}>
          <ScreenTitle>Overview</ScreenTitle>
          <span
            data-demo-id="p-notifications"
            className="relative flex h-7 w-7 items-center justify-center rounded-full border"
            style={{ borderColor: bellOpen ? 'var(--color-primary)' : 'var(--color-border)', ...ringStyle(at === 'p-notifications') }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--color-danger)' }} />
          </span>
        </div>

        {bellOpen ? (
          <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'p-notifications') }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>To do</div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-danger)' }} />
              Sign your updated contract
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Recent</div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
              Bonus awarded · +Rp 250,000
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
              Achievement unlocked · Top Closer
            </div>
          </div>
        ) : tabView === 'home' ? (
          <>
            <div data-demo-id="p-month-strip" className="flex gap-1.5" style={ringStyle(at === 'p-month-strip')}>
              {MONTHS.map((m) => (
                <span
                  key={m}
                  className="flex-1 rounded-md py-1 text-center text-[10px] font-medium"
                  style={{
                    backgroundColor: m === month ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                    color: m === month ? '#fff' : 'var(--color-text-tertiary)',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>

            <div
              data-demo-id="p-compensation-ring"
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{ borderColor: ringFocus ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'p-compensation-ring') }}
            >
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: 'conic-gradient(var(--color-primary) 0 62%, var(--color-warning) 62% 84%, var(--color-success) 84% 100%)' }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, var(--color-primary), #7c3aed)' }}>BS</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Total this month</div>
                <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Rp 6,250,000</div>
                <div className="mt-1 space-y-0">
                  <StatRow label="Base wage" value="Rp 5,000,000" />
                  <StatRow label="Allowance" value="Rp 1,000,000" />
                  <StatRow label="Credits" value="+Rp 250,000" accent />
                </div>
              </div>
            </div>

            <div data-demo-id="p-activity-feed" className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'p-activity-feed') }}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Recent activity</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
                  Achievement unlocked · Top Closer
                </div>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                  Signed Safety Procedures SOP
                </div>
              </div>
            </div>
          </>
        ) : tabView === 'docs' ? (
          <div className="space-y-3">
            <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Documents</div>
            <div className="space-y-2">
              <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--color-warning)', backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>Action needed</div>
                <div className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>Cash handling — daily close</div>
                <div className="text-[9px]" style={{ color: 'var(--color-warning)' }}>Tap to sign</div>
              </div>
              <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <div className="text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>Employment agreement</div>
                <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>v1.0 · Signed 18 Jan</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>My requests</div>
              <span className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>New</span>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Annual leave balance</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold" style={{ color: 'var(--color-primary)' }}>12</span>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>/ 14 days</span>
              </div>
            </div>
            <div className="rounded-lg border py-6 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
              You haven’t submitted any requests yet.
            </div>
          </div>
        )}

        <div data-demo-id="p-nav-tabs" className="flex gap-1 border-t pt-2" style={{ borderColor: 'var(--color-border)', ...ringStyle(at === 'p-nav-tabs') }}>
          <TabPill label="Home" current={tabView === 'home'} />
          <TabPill label="Docs" current={tabView === 'docs'} />
          <TabPill label="Requests" />
          <TabPill label="Badges" />
          <TabPill label="Leaderboard" />
        </div>
      </div>
    </PhoneStage>
  )
}

// ═══════════════════════════════════════════════════════
// portal-candidate-onboarding — welcome → sign contract
// ═══════════════════════════════════════════════════════

const ONBOARD_STEPS: TourStep[] = [
  { target: 'o-welcome-step', caption: 'Before an offer, a candidate gets a short screening profile — nothing sensitive' },
  { target: 'o-screening-fields', caption: 'Just the essentials you screen on: ID, date of birth, and a few details' },
  { target: 'o-submit-btn', caption: 'Submitting moves them to Shortlisted automatically — no bank details, no signing yet' },
  { target: 'o-setup-card', caption: 'After you make an offer, they come back to sign and finish setup' },
  { target: 'o-sign-btn', caption: 'They e-sign the contract, then add bank details & documents — asked only now they’re hired' },
]

const SCREEN_FIELDS: [string, string][] = [
  ['National ID (KTP/NIK)', '3175 •••• •••• 1234'],
  ['Date of birth', '14 Aug 1996'],
  ['Gender', 'Female'],
  ['Religion', 'Islam'],
  ['Marital status', 'Single'],
]

export function PortalOnboardingDemo() {
  const [phase, setPhase] = useState<'screening' | 'setup'>('screening')
  const [filled, setFilled] = useState(false)
  const [signed, setSigned] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setFilled(true)
    else if (i === 3) setPhase('setup')
    else if (i === 4) setSigned(true)
  }, [])
  const reset = useCallback(() => { setPhase('screening'); setFilled(false); setSigned(false) }, [])
  const tour = useGuidedTour(ONBOARD_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <PhoneStage tour={tour} label="Candidate onboarding — a light screening profile first, sign & setup after the offer." steps={ONBOARD_STEPS}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
            {phase === 'screening' ? 'Screening · pre-offer' : 'Employment setup · after signing'}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Acme Indonesia</span>
        </div>

        {phase === 'screening' ? (
          <>
            <div data-demo-id="o-welcome-step" className="space-y-1 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'o-welcome-step') }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Welcome to Acme Indonesia</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>A few details so we can review your application.</div>
            </div>
            <div data-demo-id="o-screening-fields" className="space-y-1.5 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'o-screening-fields') }}>
              {SCREEN_FIELDS.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[11px]">
                  <span style={{ color: 'var(--color-text-tertiary)' }}>{k}</span>
                  <span style={{ color: filled ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>{filled ? v : '—'}</span>
                </div>
              ))}
            </div>
            <Btn demoId="o-submit-btn" active={at === 'o-submit-btn'}>Submit profile</Btn>
          </>
        ) : (
          <>
            <div data-demo-id="o-setup-card" className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'o-setup-card') }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>🎉 You’re hired — sign &amp; set up</div>
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
                <div className="h-1.5 w-4/5 rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
              </div>
              <div className="mt-1 rounded-md border border-dashed px-2 py-1.5 text-center text-base" style={{ borderColor: signed ? 'var(--color-success)' : 'var(--color-border-strong)', fontFamily: 'cursive', color: 'var(--color-text)' }}>
                Budi Santoso
              </div>
              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                <span>Then: bank details &amp; documents</span>
                <span>after signing</span>
              </div>
            </div>
            <Btn demoId="o-sign-btn" active={at === 'o-sign-btn'}>{signed ? 'Signed ✓ — add bank & docs' : 'Confirm signature'}</Btn>
          </>
        )}
      </div>
    </PhoneStage>
  )
}

// ═══════════════════════════════════════════════════════
// portal-share — Company settings link + branding (desktop,
// with an embedded phone preview that reflects the brand)
// ═══════════════════════════════════════════════════════

const SHARE_STEPS: TourStep[] = [
  { target: 'c-company-page', caption: 'Open Company settings to find your portal branding' },
  { target: 'c-share-card', caption: 'The share card holds your public portal link' },
  { target: 'c-copy-btn', caption: 'Copy the link to send it to employees' },
  { target: 'c-qr-code', caption: 'Or let them scan the QR code' },
  { target: 'p-org-identity', caption: 'The portal shows your logo and display name' },
]

function PhonePreview({ active }: { active: boolean }) {
  return (
    <div
      data-demo-id="p-org-identity"
      className="mx-auto w-[120px] rounded-[16px] border p-1"
      style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg-tertiary)', ...ringStyle(active) }}
    >
      <div className="overflow-hidden rounded-[11px]" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="flex items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: 'var(--color-border)' }}>
          <span className="flex h-4 w-4 items-center justify-center rounded text-[7px] font-bold text-white" style={{ backgroundColor: 'var(--color-primary)' }}>A</span>
          <span className="truncate text-[8px] font-semibold" style={{ color: 'var(--color-text)' }}>Acme Indonesia</span>
        </div>
        <div className="space-y-1 p-2">
          <div className="h-6 rounded-md" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }} />
          <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
          <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
        </div>
      </div>
    </div>
  )
}

export function PortalShareDemo() {
  const [copied, setCopied] = useState(false)
  const apply = useCallback((i: number) => { if (i === 2) setCopied(true) }, [])
  const reset = useCallback(() => setCopied(false), [])
  const tour = useGuidedTour(SHARE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Sharing the portal — copy the link or scan the QR; branding follows." steps={SHARE_STEPS} activeNav="Company" url="app.flodok.com/dashboard/company">
      <div data-demo-id="c-company-page" className="p-4" style={ringStyle(at === 'c-company-page')}>
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Company</div>
        <div className="grid grid-cols-[1fr_140px] gap-4">
          <div
            data-demo-id="c-share-card"
            className="rounded-lg border p-3"
            style={{ borderColor: at === 'c-share-card' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'c-share-card') }}
          >
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Share portal link</div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                flodok.com/p/acme-indonesia-a1b2c3d4
              </div>
              <button
                type="button"
                data-demo-id="c-copy-btn"
                className="shrink-0 rounded-md px-3 py-2 text-xs font-medium"
                style={{ backgroundColor: copied ? 'var(--color-success)' : 'var(--color-primary)', color: '#fff', ...ringStyle(at === 'c-copy-btn') }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div
                data-demo-id="c-qr-code"
                className="grid h-16 w-16 shrink-0 grid-cols-4 gap-0.5 rounded-md border p-1"
                style={{ borderColor: at === 'c-qr-code' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg)', ...ringStyle(at === 'c-qr-code') }}
              >
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="rounded-[1px]" style={{ backgroundColor: (i * 7) % 3 === 0 ? 'var(--color-text)' : 'transparent' }} />
                ))}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Anyone with the link reaches the portal — no Flodok account needed.</div>
            </div>
          </div>

          <PhonePreview active={at === 'p-org-identity'} />
        </div>
      </div>
    </DesktopStage>
  )
}

// ═══════════════════════════════════════════════════════
// portal-customize — Company settings branding + features
// ═══════════════════════════════════════════════════════

const CUSTOMIZE_STEPS: TourStep[] = [
  { target: 'c-logo-upload', caption: 'Upload the logo shown on the portal header' },
  { target: 'c-display-name-field', caption: 'Set the display name employees see' },
  { target: 'c-credits-toggle', caption: 'Toggle Credits & Leaderboard — Rank tab follows' },
  { target: 'c-badges-toggle', caption: 'Toggle Badges to show or hide that tab' },
  { target: 'c-save-btn', caption: 'Save — the portal reflects every change' },
]

function PreviewTab({ label, shown }: { label: string; shown: boolean }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity"
      style={{
        backgroundColor: shown ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--color-bg-tertiary)',
        color: shown ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
        opacity: shown ? 1 : 0.4,
        textDecoration: shown ? 'none' : 'line-through',
      }}
    >
      {label}
    </span>
  )
}

function ToggleRow({ label, on, demoId, active }: { label: string; on: boolean; demoId?: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <Toggle on={on} demoId={demoId} active={active} />
    </div>
  )
}

function FieldShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

export function PortalCustomizeDemo() {
  const [logoSet, setLogoSet] = useState(false)
  const [name, setName] = useState('')
  const [credits, setCredits] = useState(true)
  const [badges, setBadges] = useState(true)
  const [saved, setSaved] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 0) setLogoSet(true)
    else if (i === 1) setName('Acme Indonesia')
    else if (i === 2) setCredits(false)
    else if (i === 3) setBadges(false)
    else if (i === 4) setSaved(true)
  }, [])
  const reset = useCallback(() => { setLogoSet(false); setName(''); setCredits(true); setBadges(true); setSaved(false) }, [])
  const tour = useGuidedTour(CUSTOMIZE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Customizing the portal — branding and feature toggles drive the tabs." steps={CUSTOMIZE_STEPS} activeNav="Company" url="app.flodok.com/dashboard/company">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Company</div>
          <Btn demoId="c-save-btn" active={at === 'c-save-btn'} variant="ghost">{saved ? 'Saved ✓' : 'Save'}</Btn>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldShell>
            <div className="flex items-center gap-3">
              <span
                data-demo-id="c-logo-upload"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-sm font-bold"
                style={{
                  borderColor: logoSet ? 'var(--color-primary)' : 'var(--color-border-strong)',
                  borderStyle: logoSet ? 'solid' : 'dashed',
                  backgroundColor: logoSet ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: logoSet ? '#fff' : 'var(--color-text-tertiary)',
                  ...ringStyle(at === 'c-logo-upload'),
                }}
              >
                {logoSet ? 'A' : '+'}
              </span>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{logoSet ? 'Logo uploaded' : 'Drag a logo or click to upload'}</div>
            </div>
            <Field label="Display Name" value={name} placeholder="Shown on the portal header" demoId="c-display-name-field" active={at === 'c-display-name-field'} caret={at === 'c-display-name-field' ? <span className="text-[var(--color-primary)]">|</span> : undefined} />
          </FieldShell>

          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Portal features</div>
            <ToggleRow label="Enable Credits & Leaderboard" on={credits} demoId="c-credits-toggle" active={at === 'c-credits-toggle'} />
            <ToggleRow label="Enable Badges" on={badges} demoId="c-badges-toggle" active={at === 'c-badges-toggle'} />
            <ToggleRow label="Enable Request Forms" on />
          </div>
        </div>

        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Portal tabs preview</div>
          <div className="flex flex-wrap gap-1.5">
            <PreviewTab label="Home" shown />
            <PreviewTab label="Docs" shown />
            <PreviewTab label="Requests" shown />
            <PreviewTab label="Badges" shown={badges} />
            <PreviewTab label="Leaderboard" shown={credits} />
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
