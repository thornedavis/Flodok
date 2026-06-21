// Self-playing guided demos for the Help Center’s Recruitment section.
// Each is a single-screen, state-driven mock: a fake cursor visits targets and
// "clicks", flipping a boolean to show the change. Every [data-demo-id] stays
// mounted at all times — we flip text/style, never add/remove a target.

import { useCallback, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { DesktopStage, useGuidedTour, ringStyle, Btn, FakePill, Field, KV, type TourStep } from '../GuidedDemo'

// ─── Shared stage badge (color-coded recruitment stages) ───

type Stage = 'Prospective' | 'Shortlisted' | 'Offered' | 'Signed'

function stageColor(stage: Stage): string {
  if (stage === 'Signed') return 'var(--color-success)'
  if (stage === 'Offered') return 'var(--color-primary)'
  if (stage === 'Shortlisted') return 'var(--color-warning)'
  return 'var(--color-text-tertiary)'
}

function StageBadge({ stage, demoId, active }: { stage: Stage; demoId?: string; active?: boolean }) {
  const color = stageColor(stage)
  const muted = stage === 'Prospective'
  return (
    <span
      data-demo-id={demoId}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: muted ? 'var(--color-bg-tertiary)' : `color-mix(in srgb, ${color} 14%, transparent)`,
        color: muted ? 'var(--color-text-tertiary)' : color,
        ...ringStyle(!!active),
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {stage}
    </span>
  )
}

function CandRow({ name, position, stage, badgeId, active, dimmed }: { name: string; position: string; stage: Stage; badgeId?: string; active?: boolean; dimmed?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 border-t px-3 py-2.5 text-xs first:border-t-0"
      style={{ borderColor: 'var(--color-border)', opacity: dimmed ? 0.35 : 1, transition: 'opacity 200ms' }}
    >
      <span className="flex-1 truncate font-medium" style={{ color: 'var(--color-text)' }}>{name}</span>
      <span className="hidden flex-1 truncate sm:block" style={{ color: 'var(--color-text-secondary)' }}>{position}</span>
      <StageBadge stage={stage} demoId={badgeId} active={active} />
    </div>
  )
}

// ─── A lightweight modal overlay used by funnel + offers demos ───

function ModalCard({ children, active, demoId }: { children: ReactNode; active?: boolean; demoId?: string }) {
  const wrap: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'color-mix(in srgb, var(--color-text) 22%, transparent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 20,
  }
  return (
    <div style={wrap}>
      <div
        data-demo-id={demoId}
        className="w-full max-w-[320px] rounded-xl border p-4"
        style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg)', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)', ...ringStyle(!!active) }}
      >
        {children}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// 1. Hiring funnel — move candidates between stages
// ───────────────────────────────────────────────────────────────

const FUNNEL_STEPS: TourStep[] = [
  { target: 'r-table', caption: 'The recruitment table lists every candidate and their stage' },
  { target: 'r-stage-prospective', caption: 'Click Budi’s Prospective badge to move him to Shortlisted' },
  { target: 'r-stage-shortlisted', caption: 'Advance Chandra from Shortlisted to Offered' },
  { target: 'r-modal-confirm', caption: 'Confirm to spin up his offer as a draft contract' },
  { target: 'r-stage-offered', caption: 'Move Diana from Offered to Signed once she accepts' },
  { target: 'r-filter', caption: 'Filter by stage to focus on just one part of the funnel' },
]

export function HiringFunnelDemo() {
  const [budi, setBudi] = useState<Stage>('Prospective')
  const [chandra, setChandra] = useState<Stage>('Shortlisted')
  const [diana, setDiana] = useState<Stage>('Offered')
  const [offerModal, setOfferModal] = useState(false)
  const [filtered, setFiltered] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setBudi('Shortlisted')
    else if (i === 2) { setChandra('Offered'); setOfferModal(true) }
    else if (i === 3) setOfferModal(false)
    else if (i === 4) setDiana('Signed')
    else if (i === 5) setFiltered(true)
  }, [])
  const reset = useCallback(() => {
    setBudi('Prospective')
    setChandra('Shortlisted')
    setDiana('Offered')
    setOfferModal(false)
    setFiltered(false)
  }, [])

  const tour = useGuidedTour(FUNNEL_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="The hiring funnel — move candidates between stages." steps={FUNNEL_STEPS} activeNav="Recruitment" url="app.flodok.com/dashboard/recruitment">
      <div className="relative p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Recruitment</div>
          <div className="w-32"><Btn>+ Add Candidate</Btn></div>
        </div>
        <div className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Track candidates from first meeting through signed contract.</div>

        <div className="mb-3 flex items-center gap-2">
          <FakePill demoId="r-filter" active={at === 'r-filter'}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            {filtered ? 'Stage: Signed' : 'Filter'}
          </FakePill>
          <div className="ml-auto h-7 w-32 rounded-md border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }} />
        </div>

        <div data-demo-id="r-table" className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)', ...ringStyle(at === 'r-table') }}>
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
            <span className="flex-1">Name</span>
            <span className="hidden flex-1 sm:block">Position</span>
            <span className="w-[88px]">Stage</span>
          </div>
          <CandRow name="Adi Nugroho" position="Operations" stage="Prospective" dimmed={filtered} />
          <CandRow name="Budi Santoso" position="Software Engineer" stage={budi} badgeId="r-stage-prospective" active={at === 'r-stage-prospective'} dimmed={filtered} />
          <CandRow name="Chandra Wijaya" position="Product Designer" stage={chandra} badgeId="r-stage-shortlisted" active={at === 'r-stage-shortlisted'} dimmed={filtered} />
          <CandRow name="Diana Putri" position="Sales Lead" stage={diana} badgeId="r-stage-offered" active={at === 'r-stage-offered'} dimmed={filtered && diana !== 'Signed'} />
          <CandRow name="Elena Sari" position="Marketing" stage="Signed" dimmed={false} />
        </div>

        {offerModal && (
          <ModalCard demoId="r-modal-confirm" active={at === 'r-modal-confirm'}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Make Offer</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Moving Chandra to Offered creates a draft contract from the matching template.
            </div>
            <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
              <KV k="Position" v="Product Designer" />
              <KV k="Template" v="Designer offer" />
            </div>
            <div className="mt-3"><Btn>Confirm & create draft</Btn></div>
          </ModalCard>
        )}
      </div>
    </DesktopStage>
  )
}

// ───────────────────────────────────────────────────────────────
// 2. Adding a candidate — the new-prospect form
// ───────────────────────────────────────────────────────────────

const CAND_STEPS: TourStep[] = [
  { target: 'r-add-btn', caption: 'Click Add Candidate to open a fresh prospect form' },
  { target: 'r-name-field', caption: 'Enter the candidate’s full name' },
  { target: 'r-contact-fields', caption: 'Add their email and phone number' },
  { target: 'r-position-dropdown', caption: 'Pick the job position they’re applying for' },
  { target: 'r-department-dropdown', caption: 'Assign the department from your reference data' },
  { target: 'r-save-btn', caption: 'Save — the candidate joins the recruitment list' },
]

export function HiringCandidatesDemo() {
  const [name, setName] = useState(false)
  const [contact, setContact] = useState(false)
  const [position, setPosition] = useState(false)
  const [department, setDepartment] = useState(false)
  const [saved, setSaved] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setName(true)
    else if (i === 2) setContact(true)
    else if (i === 3) setPosition(true)
    else if (i === 4) setDepartment(true)
    else if (i === 5) setSaved(true)
  }, [])
  const reset = useCallback(() => {
    setName(false)
    setContact(false)
    setPosition(false)
    setDepartment(false)
    setSaved(false)
  }, [])

  const tour = useGuidedTour(CAND_STEPS, apply, reset)
  const at = tour.activeTarget
  const caret = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>

  return (
    <DesktopStage tour={tour} label="Adding a candidate — capture a new prospect." steps={CAND_STEPS} activeNav="Recruitment" url="app.flodok.com/dashboard/recruitment/new?new=1">
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>New candidate · Personal</div>
            <div className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{name ? 'Putri Maharani' : 'New Candidate'}</div>
          </div>
          <div className="w-24"><Btn demoId="r-add-btn" active={at === 'r-add-btn'}>+ Add</Btn></div>
        </div>

        <div className="space-y-3">
          <Field label="Full name" value={name ? 'Putri Maharani' : ''} placeholder="e.g. Putri Maharani" demoId="r-name-field" active={at === 'r-name-field'} caret={name ? undefined : <span className="h-4 w-px" style={{ backgroundColor: 'var(--color-primary)' }} />} />
          <div data-demo-id="r-contact-fields" className="grid grid-cols-2 gap-3 rounded-lg p-1" style={ringStyle(at === 'r-contact-fields')}>
            <Field label="Email" value={contact ? 'putri@example.com' : ''} placeholder="name@email.com" />
            <Field label="Phone" value={contact ? '+62 812 3456' : ''} placeholder="+62…" />
          </div>
          <Field label="Job position" value={position ? 'Software Engineer' : ''} placeholder="Select position…" demoId="r-position-dropdown" active={at === 'r-position-dropdown'} caret={caret} />
          <Field label="Department" value={department ? 'Engineering' : ''} placeholder="Select department…" demoId="r-department-dropdown" active={at === 'r-department-dropdown'} caret={caret} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="w-28"><Btn demoId="r-save-btn" active={at === 'r-save-btn'}>Save</Btn></div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-success)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Saved to recruitment list
            </span>
          )}
        </div>
      </div>
    </DesktopStage>
  )
}

// ───────────────────────────────────────────────────────────────
// 3. Making an offer — row actions → offer modal → draft contract
// ───────────────────────────────────────────────────────────────

const OFFER_STEPS: TourStep[] = [
  { target: 'r-actions-menu', caption: 'Open the action menu on Fatima’s row' },
  { target: 'r-action-offer', caption: 'Choose Make offer from the menu' },
  { target: 'r-modal-template', caption: 'Flodok auto-matches a template to her position' },
  { target: 'r-modal-confirm', caption: 'Confirm to create the draft contract' },
  { target: 'r-modal-edit-contract', caption: 'Open Edit Contract to fine-tune the offer' },
  { target: 'r-fatima-badge', caption: 'Back on the table, Fatima now shows Offered' },
]

export function HiringOffersDemo() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<'closed' | 'form' | 'success'>('closed')
  const [stage, setStage] = useState<Stage>('Shortlisted')

  const apply = useCallback((i: number) => {
    if (i === 0) setMenuOpen(true)
    else if (i === 1) { setMenuOpen(false); setModal('form') }
    else if (i === 3) setModal('success')
    else if (i === 4) { setModal('closed'); setStage('Offered') }
  }, [])
  const reset = useCallback(() => {
    setMenuOpen(false)
    setModal('closed')
    setStage('Shortlisted')
  }, [])

  const tour = useGuidedTour(OFFER_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Making an offer — turn a shortlisted candidate into a draft contract." steps={OFFER_STEPS} activeNav="Recruitment" url="app.flodok.com/dashboard/recruitment">
      <div className="relative p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Recruitment</div>
          <div className="w-32"><Btn>+ Add Candidate</Btn></div>
        </div>

        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
            <span className="flex-1">Name</span>
            <span className="hidden flex-1 sm:block">Position</span>
            <span className="w-[88px]">Stage</span>
            <span className="w-5" />
          </div>
          <div className="relative flex items-center gap-3 border-t px-3 py-2.5 text-xs first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
            <span className="flex-1 truncate font-medium" style={{ color: 'var(--color-text)' }}>Fatima Aziz</span>
            <span className="hidden flex-1 truncate sm:block" style={{ color: 'var(--color-text-secondary)' }}>Product Manager</span>
            <StageBadge stage={stage} demoId="r-fatima-badge" active={at === 'r-fatima-badge'} />
            <button
              type="button"
              data-demo-id="r-actions-menu"
              className="flex h-6 w-5 items-center justify-center rounded"
              style={{ color: 'var(--color-text-tertiary)', ...ringStyle(at === 'r-actions-menu') }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
            </button>
            {menuOpen && (
              <div className="absolute right-2 top-8 z-10 w-36 overflow-hidden rounded-lg border py-1 text-xs" style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg)', boxShadow: '0 12px 30px -10px rgba(0,0,0,0.5)' }}>
                <span className="block px-3 py-1.5" style={{ color: 'var(--color-text-secondary)' }}>View profile</span>
                <span data-demo-id="r-action-offer" className="block px-3 py-1.5 font-medium" style={{ color: 'var(--color-primary)', ...ringStyle(at === 'r-action-offer') }}>Make offer</span>
                <span className="block px-3 py-1.5" style={{ color: 'var(--color-danger)' }}>Reject</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 border-t px-3 py-2.5 text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <span className="flex-1 truncate font-medium" style={{ color: 'var(--color-text)' }}>Gita Hartono</span>
            <span className="hidden flex-1 truncate sm:block" style={{ color: 'var(--color-text-secondary)' }}>Analyst</span>
            <StageBadge stage="Prospective" />
            <span className="w-5" />
          </div>
        </div>

        {modal !== 'closed' && (
          <ModalCard>
            {modal === 'form' ? (
              <>
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Make Offer</div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Position</div>
                    <div className="mt-0.5 text-sm font-medium" style={{ color: 'var(--color-text)' }}>Product Manager</div>
                  </div>
                  <div data-demo-id="r-modal-template" className="rounded-lg border p-2.5" style={{ borderColor: at === 'r-modal-template' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'r-modal-template') }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Contract template</div>
                    <div className="mt-0.5 text-sm" style={{ color: 'var(--color-text)' }}>Will use "Product Manager offer"</div>
                  </div>
                </div>
                <div data-demo-id="r-modal-confirm" className="mt-3 rounded-lg" style={ringStyle(at === 'r-modal-confirm')}>
                  <Btn>Confirm & create draft</Btn>
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-success)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  Offer extended
                </div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  A draft contract for Fatima is ready to customise.
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="w-20"><Btn variant="ghost">Done</Btn></div>
                  <div data-demo-id="r-modal-edit-contract" className="flex-1 rounded-lg" style={ringStyle(at === 'r-modal-edit-contract')}>
                    <Btn>Edit Contract</Btn>
                  </div>
                </div>
              </>
            )}
          </ModalCard>
        )}
      </div>
    </DesktopStage>
  )
}

// ───────────────────────────────────────────────────────────────
// 4. Separation — record a resignation from the employee detail
// ───────────────────────────────────────────────────────────────

const SEP_STEPS: TourStep[] = [
  { target: 'e-detail-header', caption: 'Open an active employee’s detail page' },
  { target: 'e-resigned-btn', caption: 'Click Mark Resigned in the sidebar' },
  { target: 'e-last-day-picker', caption: 'Set the last day of work' },
  { target: 'e-reason-field', caption: 'Optionally note the reason for leaving' },
  { target: 'e-modal-confirm', caption: 'Confirm to record the separation' },
  { target: 'e-status-badge', caption: 'The status flips to Separated with the date recorded' },
]

function StatusBadge({ separated, demoId, active }: { separated: boolean; demoId?: string; active?: boolean }) {
  const color = separated ? 'var(--color-text-tertiary)' : 'var(--color-success)'
  return (
    <span
      data-demo-id={demoId}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color, ...ringStyle(!!active) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {separated ? 'Separated' : 'Active'}
    </span>
  )
}

export function HiringSeparationDemo() {
  const [modal, setModal] = useState(false)
  const [lastDay, setLastDay] = useState(false)
  const [reason, setReason] = useState(false)
  const [separated, setSeparated] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setModal(true)
    else if (i === 2) setLastDay(true)
    else if (i === 3) setReason(true)
    else if (i === 4) { setModal(false); setSeparated(true) }
  }, [])
  const reset = useCallback(() => {
    setModal(false)
    setLastDay(false)
    setReason(false)
    setSeparated(false)
  }, [])

  const tour = useGuidedTour(SEP_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Recording a separation — when an employee resigns or is terminated." steps={SEP_STEPS} activeNav="Employees" url="app.flodok.com/dashboard/employees/gita">
      <div className="relative flex gap-4 p-4">
        {/* Sidebar with section nav + action buttons */}
        <div className="hidden w-36 shrink-0 sm:block">
          <div className="space-y-0.5 text-[11px]">
            <div className="rounded-md px-2 py-1 font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}>Personal</div>
            <div className="px-2 py-1" style={{ color: 'var(--color-text-secondary)' }}>Employment</div>
            <div className="px-2 py-1" style={{ color: 'var(--color-text-secondary)' }}>Education</div>
          </div>
          <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="rounded-md border px-2 py-1.5 text-center text-[11px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Copy Portal Link</div>
            <button
              type="button"
              data-demo-id="e-resigned-btn"
              className="w-full rounded-md px-2 py-1.5 text-center text-[11px] font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff', ...ringStyle(at === 'e-resigned-btn') }}
            >
              Mark Resigned
            </button>
            <div className="rounded-md border px-2 py-1.5 text-center text-[11px]" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>Mark Terminated</div>
          </div>
        </div>

        {/* Main detail panel */}
        <div className="min-w-0 flex-1">
          <div data-demo-id="e-detail-header" className="flex items-center justify-between rounded-lg p-1" style={ringStyle(at === 'e-detail-header')}>
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Gita Hartono</div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Operations · Staff · EMP-021</div>
            </div>
            <StatusBadge separated={separated} demoId="e-status-badge" active={at === 'e-status-badge'} />
          </div>

          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Personal</div>
            <KV k="Email" v="gita@example.com" />
            <KV k="Phone" v="+62 813 5567" />
            <KV k="Joined" v="3 Mar 2024" />
            {separated && <KV k="Resigned" v="30 Jun 2026" />}
          </div>

          {separated && (
            <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Resignation recorded · last day 30 Jun 2026
            </div>
          )}
        </div>

        {modal && (
          <ModalCard>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Record Resignation</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Set the last working day for Gita Hartono.</div>
            <div className="mt-3 space-y-3">
              <Field label="Last day" value={lastDay ? '30 Jun 2026' : ''} placeholder="Pick a date" demoId="e-last-day-picker" active={at === 'e-last-day-picker'} />
              <div>
                <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Reason (optional)</div>
                <div
                  data-demo-id="e-reason-field"
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: at === 'e-reason-field' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: reason ? 'var(--color-text)' : 'var(--color-text-tertiary)', minHeight: 40, ...ringStyle(at === 'e-reason-field') }}
                >
                  {reason ? 'Relocating to another city' : 'Add a reason…'}
                </div>
              </div>
            </div>
            <div data-demo-id="e-modal-confirm" className="mt-3 rounded-lg" style={ringStyle(at === 'e-modal-confirm')}>
              <Btn>Confirm Resignation</Btn>
            </div>
          </ModalCard>
        )}
      </div>
    </DesktopStage>
  )
}
