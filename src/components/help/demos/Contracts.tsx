// Self-playing guided demos for the Help Center → Contracts section.
// Each demo is a single state-driven screen; a fake cursor walks the steps and
// flips local state to reveal change. Built on the shared kit in ../GuidedDemo.

import { useCallback, useState } from 'react'
import {
  DesktopStage,
  useGuidedTour,
  ringStyle,
  Btn,
  FakePill,
  DCard,
  KV,
  Field,
  type TourStep,
} from '../GuidedDemo'

// ─── Creating a contract ───────────────────────────────

const CREATE_STEPS: TourStep[] = [
  { target: 'doc-create-sop', caption: 'On Documents, the “Start a new document” band offers a tile per type' },
  { target: 'doc-create-contract', caption: 'Click Contract — Flodok creates a blank PKWT draft and opens it' },
  { target: 'contract-title-input', caption: 'The editor opens with an empty title and a sidebar of contract fields' },
  { target: 'contract-employee-select', caption: 'Pick the employee this contract is for' },
  { target: 'contract-save-draft-button', caption: 'Unsaved changes enable “Save as draft” — your work is kept safe' },
]

function CreateTile({ label, sub, demoId, active, dim }: { label: string; sub: string; demoId?: string; active?: boolean; dim?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="rounded-lg border px-3 py-2.5"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        opacity: dim ? 0.55 : 1,
        ...ringStyle(!!active),
      }}
    >
      <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{label}</div>
      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>
    </div>
  )
}

export function ContractsCreateDemo() {
  const [inEditor, setInEditor] = useState(false)
  const [employee, setEmployee] = useState('')
  const [dirty, setDirty] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setInEditor(true)
    else if (i === 3) { setEmployee('Budi Santoso'); setDirty(true) }
  }, [])
  const reset = useCallback(() => {
    setInEditor(false)
    setEmployee('')
    setDirty(false)
  }, [])

  const tour = useGuidedTour(CREATE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Creating a contract — a blank PKWT draft, opened in the editor."
      steps={CREATE_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/documents"
    >
      {!inEditor ? (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Documents</div>
            <FakePill>Import existing</FakePill>
          </div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Start a new document</div>
          <div className="grid grid-cols-3 gap-2">
            <CreateTile label="SOP" sub="Procedure" demoId="doc-create-sop" active={at === 'doc-create-sop'} />
            <CreateTile label="Contract" sub="PKWT / PKWTT" demoId="doc-create-contract" active={at === 'doc-create-contract'} />
            <CreateTile label="NDA" sub="Confidentiality" dim />
            <CreateTile label="Job Description" sub="Role spec" dim />
            <CreateTile label="Letter" sub="Free-form" dim />
            <CreateTile label="Template gallery" sub="Browse all" dim />
          </div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Recent documents</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <CreateTile label="Employment — Siti" sub="Active · v2" dim />
            <CreateTile label="Employment — Andi" sub="Draft · v1" dim />
            <CreateTile label="Safety SOP" sub="Active · v3" dim />
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <FakePill>PKWT · Draft</FakePill>
            <Btn
              demoId="contract-save-draft-button"
              active={at === 'contract-save-draft-button'}
              variant="ghost"
            >
              {dirty ? 'Save as draft' : 'Saved'}
            </Btn>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <div className="space-y-3">
              <Field
                label="Contract title"
                value="Employment Agreement — John Doe"
                placeholder="Untitled contract"
                demoId="contract-title-input"
                active={at === 'contract-title-input'}
              />
              <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                <div className="mb-1 font-semibold" style={{ color: 'var(--color-text)' }}>Bilingual body</div>
                This Employment Agreement is made between the Company and the Employee…
              </div>
            </div>
            <DCard title="Contract details">
              <div className="space-y-2">
                <Field
                  label="Employee"
                  value={employee}
                  placeholder="Select employee…"
                  demoId="contract-employee-select"
                  active={at === 'contract-employee-select'}
                  caret={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>}
                />
                <KV k="Contract type" v="PKWT" />
                <KV k="Start date" v="1 Jul 2026" />
                <KV k="Base wage" v="Rp 5,000,000" />
                <KV k="Annual leave" v="12 days" />
              </div>
            </DCard>
          </div>
        </div>
      )}
    </DesktopStage>
  )
}

// ─── Contract templates ────────────────────────────────

const TEMPLATE_STEPS: TourStep[] = [
  { target: 'template-gallery-link', caption: 'From Documents, open the Template gallery' },
  { target: 'template-grid', caption: 'The gallery lists every template you can start from' },
  { target: 'template-card-contract', caption: 'Click a contract template to open its editor' },
  { target: 'template-title-field', caption: 'The editor shows the template title and bilingual body side-by-side' },
  { target: 'template-save-button', caption: 'Set “For position” and base wage, then Save back to the gallery' },
]

function TemplateCard({ title, sub, badge, demoId, active, dim }: { title: string; sub: string; badge?: string; demoId?: string; active?: boolean; dim?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="rounded-lg border px-3 py-2.5"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        opacity: dim ? 0.55 : 1,
        ...ringStyle(!!active),
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{title}</div>
        {badge && (
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}>{badge}</span>
        )}
      </div>
      <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>
    </div>
  )
}

export function ContractTemplatesDemo() {
  const [inEditor, setInEditor] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 2) setInEditor(true)
  }, [])
  const reset = useCallback(() => setInEditor(false), [])

  const tour = useGuidedTour(TEMPLATE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Contract templates — reusable, per-position starting points."
      steps={TEMPLATE_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/templates"
    >
      {!inEditor ? (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Templates</div>
            <FakePill demoId="template-gallery-link" active={at === 'template-gallery-link'}>Template gallery</FakePill>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <FakePill>All</FakePill>
            <FakePill>Contract</FakePill>
            <FakePill>NDA</FakePill>
            <div className="ml-auto h-7 w-32 rounded-md border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }} />
          </div>
          <div data-demo-id="template-grid" className="grid grid-cols-3 gap-2 rounded-lg p-1" style={ringStyle(at === 'template-grid')}>
            <TemplateCard title="Engineer PKWT" sub="for Software Engineer" badge="Contract" demoId="template-card-contract" active={at === 'template-card-contract'} />
            <TemplateCard title="Sales PKWT" sub="for Sales Executive" badge="Contract" dim />
            <TemplateCard title="Standard NDA" sub="One-way" badge="NDA" dim />
            <TemplateCard title="Manager PKWTT" sub="for Manager" badge="Contract" dim />
            <TemplateCard title="Intern Letter" sub="for Intern" badge="Letter" dim />
            <TemplateCard title="Designer PKWT" sub="for Product Designer" badge="Contract" dim />
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <FakePill>Template</FakePill>
            <Btn demoId="template-save-button" active={at === 'template-save-button'} variant="ghost">Save template</Btn>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <div className="space-y-3">
              <Field
                label="Template title"
                value="Engineer PKWT"
                placeholder="Untitled template"
                demoId="template-title-field"
                active={at === 'template-title-field'}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  <div className="mb-1 text-[9px] font-semibold uppercase" style={{ color: 'var(--color-text-tertiary)' }}>English</div>
                  The Employee is engaged in the position of {'{{position}}'}…
                </div>
                <div className="rounded-lg border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                  <div className="mb-1 text-[9px] font-semibold uppercase" style={{ color: 'var(--color-text-tertiary)' }}>Indonesia</div>
                  Karyawan dipekerjakan pada posisi {'{{position}}'}…
                </div>
              </div>
            </div>
            <DCard title="Template defaults">
              <div className="space-y-2">
                <KV k="For position" v="Software Engineer" />
                <KV k="Base wage" v="Rp 12,000,000" />
                <KV k="Allowance" v="Rp 1,500,000" />
                <KV k="Hours / week" v="40" />
                <KV k="Days / week" v="5" />
              </div>
            </DCard>
          </div>
        </div>
      )}
    </DesktopStage>
  )
}

// ─── Activating & signing ──────────────────────────────

const SIGN_STEPS: TourStep[] = [
  { target: 'contract-save-draft-button', caption: 'All required fields are filled, so save the draft' },
  { target: 'contract-activate-and-sign-button', caption: 'Click “Activate & sign” — it saves and reveals the signature panel' },
  { target: 'sign-as-employer-panel', caption: 'The “Sign as Employer” panel appears below the editor' },
  { target: 'signature-font-option', caption: 'Pick a signature font — your name renders in that handwriting style' },
  { target: 'confirm-and-activate-button', caption: 'Confirm & Activate writes the employer signature and sets the contract active' },
]

function FontChip({ name, font, demoId, active, selected }: { name: string; font: string; demoId?: string; active?: boolean; selected?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="rounded-lg border px-3 py-2 text-center"
      style={{
        borderColor: selected || active ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
        ...ringStyle(!!active),
      }}
    >
      <div className="text-base leading-none" style={{ fontFamily: font, color: 'var(--color-text)' }}>{name}</div>
    </div>
  )
}

export function ContractsSignDemo() {
  const [saved, setSaved] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [fontPicked, setFontPicked] = useState(false)
  const [active, setActive] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 0) setSaved(true)
    else if (i === 1) setPanelOpen(true)
    else if (i === 3) setFontPicked(true)
    else if (i === 4) setActive(true)
  }, [])
  const reset = useCallback(() => {
    setSaved(false)
    setPanelOpen(false)
    setFontPicked(false)
    setActive(false)
  }, [])

  const tour = useGuidedTour(SIGN_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Activating a contract — the employer signs and it goes live."
      steps={SIGN_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/documents/contracts/edit"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <FakePill>{active ? 'PKWT · Active' : 'PKWT · Draft'}</FakePill>
          <div className="flex items-center gap-2">
            <Btn demoId="contract-save-draft-button" active={at === 'contract-save-draft-button'} variant="ghost">
              {saved ? 'Saved' : 'Save as draft'}
            </Btn>
            <Btn demoId="contract-activate-and-sign-button" active={at === 'contract-activate-and-sign-button'} variant="ghost">
              Activate &amp; sign
            </Btn>
          </div>
        </div>

        <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
          <div className="mb-1 font-semibold" style={{ color: 'var(--color-text)' }}>Employment Agreement — Budi Santoso</div>
          PKWT · 1 Jul 2026 → 30 Jun 2027 · Rp 5,000,000 / month · 40 hours, 5 days per week.
        </div>

        <div
          data-demo-id="sign-as-employer-panel"
          className="mt-3 rounded-lg border p-3"
          style={{
            borderColor: at === 'sign-as-employer-panel' ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            opacity: panelOpen ? 1 : 0.4,
            ...ringStyle(at === 'sign-as-employer-panel'),
          }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Sign as Employer</div>
          <div className="mb-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Choose how your name appears on the signature line.</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Signer name" value="Thorne Davis" placeholder="Full name" />
            <Field label="Signer title" value="Director" placeholder="Title" />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <FontChip name="T. Davis" font="'Brush Script MT', cursive" demoId="signature-font-option" active={at === 'signature-font-option'} selected={fontPicked} />
            <FontChip name="T. Davis" font="Georgia, serif" />
            <FontChip name="T. Davis" font="'Segoe Script', cursive" />
            <FontChip name="T. Davis" font="'Comic Sans MS', cursive" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Btn demoId="confirm-and-activate-button" active={at === 'confirm-and-activate-button'} variant="ghost">
              Confirm &amp; Activate
            </Btn>
            {active && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--color-success)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Contract is now active
              </span>
            )}
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── Contract history ──────────────────────────────────

const HISTORY_STEPS: TourStep[] = [
  { target: 'contract-more-menu', caption: 'From a contract, open the More menu and choose History' },
  { target: 'version-rail', caption: 'Every version is listed, newest first, with who changed it' },
  { target: 'version-rail-item', caption: 'Click an older version to load its exact snapshot' },
  { target: 'structural-snapshot-strip', caption: 'The strip shows the wage and terms as they were at that moment' },
  { target: 'view-mode-toggle', caption: 'Toggle to Template mode to see the raw {{merge_field}} tokens' },
]

function VersionRow({ v, who, summary, date, demoId, active, selected }: { v: string; who: string; summary: string; date: string; demoId?: string; active?: boolean; selected?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="rounded-lg border px-2.5 py-2"
      style={{
        borderColor: selected || active ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
        ...ringStyle(!!active),
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{v}</span>
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{date}</span>
      </div>
      <div className="mt-1 truncate text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>{who}</div>
      <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{summary}</div>
    </div>
  )
}

export function ContractsHistoryDemo() {
  const [olderSelected, setOlderSelected] = useState(false)
  const [template, setTemplate] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 2) setOlderSelected(true)
    else if (i === 4) setTemplate(true)
  }, [])
  const reset = useCallback(() => {
    setOlderSelected(false)
    setTemplate(false)
  }, [])

  const tour = useGuidedTour(HISTORY_STEPS, apply, reset)
  const at = tour.activeTarget

  const wage = olderSelected ? 'Rp 5,000,000' : 'Rp 5,500,000'
  const allowance = olderSelected ? 'Rp 800,000' : 'Rp 1,000,000'

  return (
    <DesktopStage
      tour={tour}
      label="Contract history — every version, frozen as it was signed."
      steps={HISTORY_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/documents/contracts/history"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold" style={{ color: 'var(--color-text)' }}>Contract History — Budi Santoso</div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Current version: {olderSelected ? 'v3 (viewing v1)' : 'v3'}</div>
          </div>
          <FakePill demoId="contract-more-menu" active={at === 'contract-more-menu'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
            History
          </FakePill>
        </div>

        <div className="grid grid-cols-[160px_1fr] gap-3">
          <div data-demo-id="version-rail" className="space-y-2 rounded-lg p-1" style={ringStyle(at === 'version-rail')}>
            <VersionRow v="v3" who="You" summary="Raised base wage" date="Today" selected={!olderSelected} />
            <VersionRow v="v2" who="Sari (HR)" summary="Fixed dates" date="3 Jun" />
            <VersionRow v="v1" who="You" summary="Initial draft" date="1 Jun" demoId="version-rail-item" active={at === 'version-rail-item'} selected={olderSelected} />
          </div>

          <div data-demo-id="version-pane" className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', ...ringStyle(at === 'version-pane') }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <FakePill>EN · ID</FakePill>
              <FakePill demoId="view-mode-toggle" active={at === 'view-mode-toggle'}>{template ? 'Template' : 'Rendered'}</FakePill>
            </div>
            <div className="rounded-md border p-2.5 text-[11px] leading-relaxed" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
              {template
                ? 'This Agreement is between {{company_name}} and {{employee_name}}, for the position of {{position}} at {{base_wage}} per month.'
                : `This Agreement is between Acme Indonesia and Budi Santoso, for the position of Software Engineer at ${wage} per month.`}
            </div>

            <div data-demo-id="structural-snapshot-strip" className="mt-2 rounded-md border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'structural-snapshot-strip') }}>
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Snapshot at this version</div>
              <div className="grid grid-cols-2 gap-x-3">
                <KV k="Employee" v="Budi Santoso" />
                <KV k="Base wage" v={wage} />
                <KV k="Allowance" v={allowance} />
                <KV k="Hours / day" v="8" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
