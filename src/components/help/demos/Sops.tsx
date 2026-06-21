// Self-playing guided demos for the SOPs section of the Help Center.
// Built on the shared GuidedDemo kit — every demo is a single state-driven
// screen whose elements flip text/style as the fake cursor "clicks" through
// the steps. No targeted element is ever added or removed mid-tour.

import { useCallback, useState } from 'react'
import {
  DesktopStage,
  useGuidedTour,
  ringStyle,
  Btn,
  Field,
  DCard,
  type TourStep,
} from '../GuidedDemo'

// ─── Create an SOP ─────────────────────────────────────

const CREATE_STEPS: TourStep[] = [
  { target: 'sop-tile', caption: 'Click the New SOP tile to start a blank draft' },
  { target: 'sop-title', caption: 'Give it a title — “Employee Safety Guidelines”' },
  { target: 'editor-add-block', caption: 'Add the first section block' },
  { target: 'block-en-input', caption: 'Write the section in English — “Introduction”' },
  { target: 'block-id-input', caption: 'Add the Indonesian translation — “Pengenalan”' },
  { target: 'publish-button', caption: 'Publish — the SOP goes Active as v1' },
]

export function SopCreateDemo() {
  const [titled, setTitled] = useState(false)
  const [hasBlock, setHasBlock] = useState(false)
  const [en, setEn] = useState(false)
  const [id, setId] = useState(false)
  const [published, setPublished] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setTitled(true)
    else if (i === 2) setHasBlock(true)
    else if (i === 3) setEn(true)
    else if (i === 4) setId(true)
    else if (i === 5) setPublished(true)
  }, [])
  const reset = useCallback(() => {
    setTitled(false)
    setHasBlock(false)
    setEn(false)
    setId(false)
    setPublished(false)
  }, [])

  const tour = useGuidedTour(CREATE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Creating an SOP — title it, write it bilingually, publish."
      steps={CREATE_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/documents"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>SOP editor</div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: published
                ? 'color-mix(in srgb, var(--color-success) 16%, transparent)'
                : 'var(--color-bg-tertiary)',
              color: published ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            }}
          >
            {published ? 'Active · v1' : 'Draft'}
          </span>
        </div>

        {/* Create tile — present the whole time; it's the entry point */}
        <div
          data-demo-id="sop-tile"
          className="mb-3 flex items-center gap-3 rounded-lg border px-3 py-2.5"
          style={{ borderColor: at === 'sop-tile' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'sop-tile') }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>New SOP</div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Start a blank standard operating procedure</div>
          </div>
        </div>

        <div className="mb-3">
          <Field
            label="SOP title"
            value={titled ? 'Employee Safety Guidelines' : ''}
            placeholder="Untitled SOP"
            demoId="sop-title"
            active={at === 'sop-title'}
          />
        </div>

        {/* Bilingual block — always rendered; inputs fill via state */}
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <div className="grid grid-cols-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            <span className="border-r px-3 py-1.5" style={{ borderColor: 'var(--color-border)' }}>English</span>
            <span className="px-3 py-1.5">Bahasa Indonesia</span>
          </div>
          <div className="grid grid-cols-2">
            <div
              data-demo-id="block-en-input"
              className="border-r px-3 py-2.5 text-sm"
              style={{ borderColor: 'var(--color-border)', color: en ? 'var(--color-text)' : 'var(--color-text-tertiary)', ...ringStyle(at === 'block-en-input') }}
            >
              {hasBlock ? (en ? 'Introduction' : 'Type section title…') : '—'}
            </div>
            <div
              data-demo-id="block-id-input"
              className="px-3 py-2.5 text-sm"
              style={{ color: id ? 'var(--color-text)' : 'var(--color-text-tertiary)', ...ringStyle(at === 'block-id-input') }}
            >
              {hasBlock ? (id ? 'Pengenalan' : 'Ketik judul bagian…') : '—'}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Btn variant="ghost" demoId="editor-add-block" active={at === 'editor-add-block'}>+ Add block</Btn>
          <div className="ml-auto" style={{ width: 130 }}>
            <Btn demoId="publish-button" active={at === 'publish-button'}>{published ? 'Published ✓' : 'Publish'}</Btn>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── Versioning & history ──────────────────────────────

const VERSION_STEPS: TourStep[] = [
  { target: 'editor-content', caption: 'Edit the SOP — add new emergency procedures' },
  { target: 'change-summary-input', caption: 'Note what changed for the version log' },
  { target: 'publish-button', caption: 'Publish — Flodok bumps v2 to v3' },
  { target: 'history-button', caption: 'Open History to see every version' },
  { target: 'version-v2', caption: 'Select v2 to compare against current v3' },
  { target: 'diff-toggle', caption: 'Show the diff — additions green, removals red' },
]

export function SopVersioningDemo() {
  const [edited, setEdited] = useState(false)
  const [summary, setSummary] = useState(false)
  const [version, setVersion] = useState(2)
  const [selectedV2, setSelectedV2] = useState(false)
  const [diff, setDiff] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 0) setEdited(true)
    else if (i === 1) setSummary(true)
    else if (i === 2) setVersion(3)
    else if (i === 4) setSelectedV2(true)
    else if (i === 5) setDiff(true)
  }, [])
  const reset = useCallback(() => {
    setEdited(false)
    setSummary(false)
    setVersion(2)
    setSelectedV2(false)
    setDiff(false)
  }, [])

  const tour = useGuidedTour(VERSION_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Versioning an SOP — publish bumps the version, and History keeps every one."
      steps={VERSION_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/documents"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-base"
              style={{ color: 'var(--color-text)', fontWeight: edited && version === 2 ? 700 : 600 }}
            >
              Employee Safety Guidelines
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 16%, transparent)', color: 'var(--color-success)' }}>
              Active · v{version}
            </span>
          </div>
          <Btn variant="ghost" demoId="history-button" active={at === 'history-button'}>History</Btn>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: '130px 1fr' }}>
          {/* Version rail — always present */}
          <DCard title="Versions">
            <div className="space-y-1">
              <div className="flex items-center justify-between rounded-md px-2 py-1 text-xs" style={{ backgroundColor: !selectedV2 ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent', color: !selectedV2 ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                <span className="font-semibold">v{version}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>current</span>
              </div>
              {version === 3 && (
                <div
                  data-demo-id="version-v2"
                  className="flex items-center justify-between rounded-md px-2 py-1 text-xs"
                  style={{ backgroundColor: selectedV2 ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent', color: selectedV2 ? 'var(--color-primary)' : 'var(--color-text-secondary)', ...ringStyle(at === 'version-v2') }}
                >
                  <span className="font-semibold">v2</span>
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>2 Jun</span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-md px-2 py-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <span className="font-semibold">v1</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>20 May</span>
              </div>
            </div>
          </DCard>

          {/* Editor / diff pane — always present, content flips */}
          <div className="min-w-0">
            <div
              data-demo-id="editor-content"
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'editor-content') }}
            >
              <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>3. Emergency procedures</div>
              <div className="mt-1 space-y-1 text-[11px]">
                <div style={{ color: 'var(--color-text-secondary)' }}>Keep all fire exits clear at all times.</div>
                {diff ? (
                  <>
                    <div className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>− Report hazards to your manager.</div>
                    <div className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--color-diff-add)', color: 'var(--color-success)' }}>+ Report hazards via the portal within 24h.</div>
                    <div className="rounded px-1.5 py-0.5" style={{ backgroundColor: 'var(--color-diff-add)', color: 'var(--color-success)' }}>+ Assemble at the north car park.</div>
                  </>
                ) : (
                  <>
                    <div style={{ color: 'var(--color-text-secondary)' }}>Report hazards to your manager.</div>
                    {edited && <div style={{ color: 'var(--color-text)' }}>Assemble at the north car park.</div>}
                  </>
                )}
              </div>
            </div>

            <div className="mt-3">
              <Field
                label="Change summary (optional)"
                value={summary ? 'Added new emergency procedures' : ''}
                placeholder="What changed in this version?"
                demoId="change-summary-input"
                active={at === 'change-summary-input'}
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span
                data-demo-id="diff-toggle"
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
                style={{ borderColor: at === 'diff-toggle' ? 'var(--color-primary)' : 'var(--color-border)', color: diff ? 'var(--color-primary)' : 'var(--color-text-secondary)', ...ringStyle(at === 'diff-toggle') }}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded" style={{ backgroundColor: diff ? 'var(--color-primary)' : 'transparent', border: diff ? 'none' : '1.5px solid var(--color-border-strong)' }}>
                  {diff && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                Show diff vs current
              </span>
              <div className="ml-auto" style={{ width: 120 }}>
                <Btn demoId="publish-button" active={at === 'publish-button'}>{version === 3 ? 'Published ✓' : 'Publish'}</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── Import an existing PDF ────────────────────────────

const IMPORT_STEPS: TourStep[] = [
  { target: 'import-button', caption: 'Click Import existing on the Documents header' },
  { target: 'sop-type-button', caption: 'Pick the SOP document type' },
  { target: 'file-input', caption: 'Browse to a PDF — company-sop-procedures.pdf' },
  { target: 'analyse-button', caption: 'Analyse — the vision model reads the PDF' },
  { target: 'review-section', caption: 'Review the auto-extracted title and sections' },
  { target: 'create-button', caption: 'Create — a bilingual draft opens, ready to refine' },
]

export function SopImportDemo() {
  const [typePicked, setTypePicked] = useState(false)
  const [file, setFile] = useState(false)
  const [analysed, setAnalysed] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setTypePicked(true)
    else if (i === 2) setFile(true)
    else if (i === 3) setAnalysed(true)
  }, [])
  const reset = useCallback(() => {
    setTypePicked(false)
    setFile(false)
    setAnalysed(false)
  }, [])

  const tour = useGuidedTour(IMPORT_STEPS, apply, reset)
  const at = tour.activeTarget

  const types: { label: string; key: string }[] = [
    { label: 'Contract', key: 'contract' },
    { label: 'NDA', key: 'nda' },
    { label: 'Job Description', key: 'jd' },
    { label: 'SOP', key: 'sop' },
  ]

  return (
    <DesktopStage
      tour={tour}
      label="Importing an existing PDF — Flodok reads it and pre-fills a draft SOP."
      steps={IMPORT_STEPS}
      activeNav="Documents"
      url="app.flodok.com/dashboard/documents"
    >
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Documents</div>
          <span
            data-demo-id="import-button"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: at === 'import-button' ? 'var(--color-primary)' : 'var(--color-border)', color: 'var(--color-text)', ...ringStyle(at === 'import-button') }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Import existing
          </span>
        </div>

        {/* Import modal — single screen; left = select, right = review */}
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border-strong)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="border-b px-4 py-2.5 text-sm font-semibold" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            Import document
          </div>

          <div className="grid gap-4 p-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* Select column */}
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Document type</div>
              <div className="grid grid-cols-2 gap-2">
                {types.map((t) => {
                  const isSop = t.key === 'sop'
                  const selected = isSop && typePicked
                  return (
                    <span
                      key={t.key}
                      data-demo-id={isSop ? 'sop-type-button' : undefined}
                      className="rounded-lg border px-2.5 py-1.5 text-center text-xs font-medium"
                      style={{
                        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--color-bg)',
                        color: selected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        ...(isSop ? ringStyle(at === 'sop-type-button') : {}),
                      }}
                    >
                      {t.label}
                    </span>
                  )
                })}
              </div>

              <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>PDF file</div>
              <div
                data-demo-id="file-input"
                className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs"
                style={{ borderColor: at === 'file-input' ? 'var(--color-primary)' : 'var(--color-border-strong)', backgroundColor: 'var(--color-bg)', color: file ? 'var(--color-text)' : 'var(--color-text-tertiary)', ...ringStyle(at === 'file-input') }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <span className="truncate">{file ? 'company-sop-procedures.pdf' : 'Browse or drop a PDF here'}</span>
              </div>

              <div className="mt-3">
                <Btn demoId="analyse-button" active={at === 'analyse-button'}>
                  {analysed ? 'Analysed ✓' : 'Analyse'}
                </Btn>
              </div>
            </div>

            {/* Review column — present the whole time; fills after analysis */}
            <div
              data-demo-id="review-section"
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', ...ringStyle(at === 'review-section') }}
            >
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                {!analysed ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    Awaiting analysis
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ color: 'var(--color-success)' }}>Extracted</span>
                  </>
                )}
              </div>

              <Field
                label="Title"
                value={analysed ? 'Company SOP — Procedures' : ''}
                placeholder="Detected after analysis"
                active={false}
              />

              <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Detected sections</div>
              <div className="mt-1 space-y-1 text-[11px]">
                {analysed ? (
                  <>
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                      1. Scope &amp; purpose · EN/ID
                    </div>
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                      2. Safety procedures · EN/ID
                    </div>
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                      3. Responsibilities · EN/ID
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--color-text-tertiary)' }}>The model lists detected sections here.</div>
                )}
              </div>

              <div className="mt-3">
                <Btn demoId="create-button" active={at === 'create-button'}>Create draft</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
