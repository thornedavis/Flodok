import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { renderMergeFields } from '../../lib/mergeFields'
import { SIGNATURE_FONTS, ensureSignatureFontsLoaded } from '../../lib/signatureFonts'
import { buildContractDocumentHash, captureSignatureIp, getUserAgent } from '../../lib/signatureFingerprint'
import { docToMarkdown, type DocumentDoc } from '../../lib/documentDoc'
import { computeProfileSections, profileCompletionPercent } from '../../lib/candidateProfile'
import { DocumentUpload } from '../DocumentUpload'
import type { Contract, ContractSignature, Employee, JobDescription, JobDescriptionSignature, Organization } from '../../types/aliases'

ensureSignatureFontsLoaded()

interface Props {
  employee: Employee
  organization: Organization | null
  activeContract: Contract | null
  employerSignature: ContractSignature | null
  employeeSignature: ContractSignature | null
  // Optional — only present when the candidate applied for a specific JD
  // at intake (Phase D). When set, onboarding inserts a JD-sign step
  // between contract signing and personal details.
  appliedForJd?: JobDescription | null
  jdSignature?: JobDescriptionSignature | null
  onCompleted: () => void
}

type Step = 'welcome' | 'sign' | 'signJd' | 'personal' | 'banking' | 'emergency' | 'docs' | 'done'

const STEP_ORDER: Step[] = ['welcome', 'sign', 'signJd', 'personal', 'banking', 'emergency', 'docs', 'done']
// 'done' isn't a numbered step. The active step list is filtered at
// render time when there's no contract or no JD, so the progress
// denominator below is the *maximum* possible step count; the chrome
// will show "step 2 of 7" even for a candidate who skips signJd. That's
// acceptable noise — better than a denominator that jumps based on
// data we discover mid-flow.
const TOTAL_STEPS = STEP_ORDER.length - 1

export function CandidateOnboarding({
  employee: initialEmployee,
  organization,
  activeContract,
  employerSignature,
  employeeSignature: initialSig,
  appliedForJd = null,
  jdSignature: initialJdSig = null,
  onCompleted,
}: Props) {
  const { t, lang } = useLang()
  const [employee, setEmployee] = useState<Employee>(initialEmployee)
  const [signature, setSignature] = useState<ContractSignature | null>(initialSig)
  const [jdSig, setJdSig] = useState<JobDescriptionSignature | null>(initialJdSig)
  const requiresJdSig = !!appliedForJd
  // Pre-offer candidates land here for opportunistic profile completion;
  // copy on the welcome + done screens shifts to match (no "let's review
  // your contract" framing when there isn't one yet).
  const preOffer = employee.lifecycle_stage === 'prospective' || employee.lifecycle_stage === 'shortlisted'
  const [step, setStep] = useState<Step>(() => {
    if (initialEmployee.lifecycle_stage === 'signed') {
      return needsPersonalInfo(initialEmployee) ? 'personal' : 'done'
    }
    return 'welcome'
  })

  // Flip lifecycle_stage to 'signed' only once every required ack is in
  // place. When there's no JD attached, contract sig alone advances; when
  // there is, both signatures must be present. Idempotent — calling it
  // multiple times is fine.
  async function maybeAdvanceToSigned(opts: { contractSigned: boolean; jdSigned: boolean }) {
    if (employee.lifecycle_stage !== 'offered') return
    if (activeContract && !opts.contractSigned) return
    if (requiresJdSig && !opts.jdSigned) return
    await supabase.from('employees').update({ lifecycle_stage: 'signed' }).eq('id', employee.id)
    setEmployee(prev => ({ ...prev, lifecycle_stage: 'signed' }))
  }

  const stepIndex = Math.min(STEP_ORDER.indexOf(step) + 1, TOTAL_STEPS)

  function go(next: Step) { setStep(next) }

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {organization?.display_name || organization?.name || ''}
          </span>
          {step !== 'done' && (
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.onboardingProgress(stepIndex, TOTAL_STEPS)}
            </span>
          )}
        </header>

        <ProgressBar current={stepIndex} total={TOTAL_STEPS} />

        <main className="mt-8 flex-1">
          {step === 'welcome' && (
            <WelcomeStep
              orgName={organization?.display_name || organization?.name || ''}
              preOffer={preOffer}
              employee={employee}
              onContinue={() => go(firstSigningStep(activeContract, requiresJdSig))}
            />
          )}

          {step === 'sign' && (
            <SignStep
              employee={employee}
              organization={organization}
              activeContract={activeContract}
              employerSignature={employerSignature}
              employeeSignature={signature}
              lang={lang}
              onSigned={async sig => {
                setSignature(sig)
                await maybeAdvanceToSigned({ contractSigned: true, jdSigned: !!jdSig })
                go(requiresJdSig ? 'signJd' : 'personal')
              }}
              onSkipBack={() => go('welcome')}
            />
          )}

          {step === 'signJd' && appliedForJd && (
            <SignJdStep
              employee={employee}
              jd={appliedForJd}
              jdSignature={jdSig}
              lang={lang}
              onSigned={async sig => {
                setJdSig(sig)
                await maybeAdvanceToSigned({ contractSigned: !!signature, jdSigned: true })
                go('personal')
              }}
              onSkipBack={() => go(activeContract ? 'sign' : 'welcome')}
            />
          )}

          {step === 'personal' && (
            <PersonalStep
              employee={employee}
              onSaved={updated => { setEmployee(updated); go('banking') }}
              onBack={() => go(previousStepBeforePersonal(activeContract, requiresJdSig))}
            />
          )}

          {step === 'banking' && (
            <BankingStep
              employee={employee}
              onSaved={updated => { setEmployee(updated); go('emergency') }}
              onBack={() => go('personal')}
            />
          )}

          {step === 'emergency' && (
            <EmergencyStep
              employee={employee}
              onSaved={() => go('docs')}
              onBack={() => go('banking')}
            />
          )}

          {step === 'docs' && (
            <DocsStep
              employee={employee}
              onSaved={updated => { setEmployee(updated); go('done') }}
              onSkip={() => go('done')}
              onBack={() => go('emergency')}
            />
          )}

          {step === 'done' && (
            <DoneStep
              startDate={employee.join_date}
              lang={lang}
              preOffer={preOffer}
              onEnter={onCompleted}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function needsPersonalInfo(employee: Employee): boolean {
  return !employee.ktp_nik || !employee.ktp_photo_url
}

// Step routing — keeps the "skip steps that don't apply" logic in one place
// so the welcome screen's Continue button and the personal step's Back
// button agree on what the previous/next step is.
function firstSigningStep(activeContract: Contract | null, requiresJdSig: boolean): Step {
  if (activeContract) return 'sign'
  if (requiresJdSig) return 'signJd'
  return 'personal'
}

function previousStepBeforePersonal(activeContract: Contract | null, requiresJdSig: boolean): Step {
  if (requiresJdSig) return 'signJd'
  if (activeContract) return 'sign'
  return 'welcome'
}

// ───── Progress bar ──────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
      <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--color-primary)' }} />
    </div>
  )
}

// ───── Welcome step ──────────────────────────────────────────────────────

function WelcomeStep({ orgName, preOffer, employee, onContinue }: {
  orgName: string
  preOffer: boolean
  employee: Employee
  onContinue: () => void
}) {
  const { t } = useLang()
  // For pre-offer candidates, show the current completion percentage so they
  // get an at-a-glance "here's how far along you are" framing. The number is
  // approximate (no joins on education/experience/family) but useful as a
  // motivator — same calculator that drives the chip on the Recruitment list.
  const pct = preOffer ? profileCompletionPercent(computeProfileSections(employee)) : null
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
        {preOffer ? t.onboardingWelcomeTitlePreOffer(orgName) : t.onboardingWelcomeTitle(orgName)}
      </h1>
      <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {preOffer ? t.onboardingWelcomeBodyPreOffer : t.onboardingWelcomeBody}
      </p>
      {pct !== null && (
        <div className="space-y-2 rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingProfileProgressLabel}</span>
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--color-primary)' }} />
          </div>
        </div>
      )}
      <div className="pt-4">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg px-6 py-3 text-base font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {preOffer ? t.onboardingWelcomeStartPreOffer : t.onboardingWelcomeStart}
        </button>
      </div>
    </div>
  )
}

// ───── Sign step ─────────────────────────────────────────────────────────

function SignStep({ employee, organization, activeContract, employerSignature, employeeSignature, lang, onSigned, onSkipBack }: {
  employee: Employee
  organization: Organization | null
  activeContract: Contract | null
  employerSignature: ContractSignature | null
  employeeSignature: ContractSignature | null
  lang: 'en' | 'id'
  onSigned: (sig: ContractSignature) => void
  onSkipBack: () => void
}) {
  const { t } = useLang()
  const [typedName, setTypedName] = useState(employee.name)
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].name)
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const contractRef = useRef<HTMLDivElement>(null)

  const renderedBody = useMemo(() => {
    if (!activeContract) return ''
    const sourceMd = lang === 'id' && activeContract.content_markdown_id
      ? activeContract.content_markdown_id
      : activeContract.content_markdown
    return renderMergeFields(sourceMd, {
      employee,
      organization,
      contract: activeContract,
      employerSignature,
      employeeSignature: employeeSignature
        ? { typed_name: employeeSignature.typed_name, signature_font: employeeSignature.signature_font, signed_at: employeeSignature.signed_at }
        : { typed_name: typedName, signature_font: selectedFont, signed_at: null },
      lang,
    })
  }, [activeContract, employee, organization, employerSignature, employeeSignature, typedName, selectedFont, lang])

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolledToBottom(true)
  }

  async function handleSign() {
    if (!activeContract || signing) return
    if (!typedName.trim() || !agreed) return
    setSigning(true)
    setError('')
    const documentHash = await buildContractDocumentHash(activeContract.content_markdown, activeContract.current_version)
    const { data, error: sigError } = await supabase
      .from('contract_signatures')
      .insert({
        contract_id: activeContract.id,
        version_number: activeContract.current_version,
        employee_id: employee.id,
        typed_name: typedName.trim(),
        signature_font: selectedFont,
        signer_role: 'employee',
        consent_text: t.onboardingSignConsent,
        document_hash: documentHash,
        user_agent: getUserAgent(),
        signer_email: employee.email || null,
        signer_phone: employee.phone || null,
      })
      .select()
      .single()

    if (sigError || !data) {
      setSigning(false)
      setError(sigError?.message || t.onboardingError)
      return
    }

    // Best-effort: stamp the signer's public IP onto the row server-side.
    captureSignatureIp(data.id, { type: 'portal', slug: employee.slug, accessToken: employee.access_token })

    // The contract_signed feed event is emitted server-side by the
    // contract_signatures AFTER INSERT trigger (migration 136).
    onSigned(data)
  }

  if (!activeContract) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingContractTitle}</h1>
        <div className="rounded-lg border p-6 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
          {t.onboardingContractMissing}
        </div>
        <button type="button" onClick={onSkipBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
      </div>
    )
  }

  if (employeeSignature) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingContractTitle}</h1>
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)', color: 'var(--color-success)' }}>
          {t.onboardingSignAlready}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSigned(employeeSignature)}
            className="rounded-lg px-6 py-3 text-base font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.onboardingNext}
          </button>
        </div>
      </div>
    )
  }

  const canSign = !!typedName.trim() && agreed && scrolledToBottom

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingContractTitle}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingContractBody}</p>
      </div>

      <div
        ref={contractRef}
        onScroll={handleScroll}
        className="prose-portal max-h-96 overflow-y-auto rounded-lg border p-5 text-sm"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
        dangerouslySetInnerHTML={{ __html: contractToHtml(renderedBody) }}
      />

      <div className="space-y-4 rounded-lg border p-5" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingSignTitle}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingSignBody}</p>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingSignNameLabel}</label>
          <input
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingSignFontLabel}</label>
          <div className="grid grid-cols-2 gap-2">
            {SIGNATURE_FONTS.map(font => {
              const isSelected = selectedFont === font.name
              return (
                <button
                  key={font.name}
                  type="button"
                  onClick={() => setSelectedFont(font.name)}
                  className="flex flex-col items-start gap-1 rounded-lg border p-3 transition-all"
                  style={{
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
                  }}
                >
                  <span className="text-2xl leading-none" style={{ fontFamily: `'${font.name}', cursive`, color: 'var(--color-text)' }}>
                    {typedName.trim() || employee.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{font.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <span>{t.onboardingSignConsent}</span>
        </label>

        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onSkipBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
        <button
          type="button"
          onClick={handleSign}
          disabled={!canSign || signing}
          className="rounded-lg px-6 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {signing ? t.onboardingSaving : t.onboardingSignButton}
        </button>
      </div>
    </div>
  )
}

// ───── JD acknowledgment step ────────────────────────────────────────────
//
// Mirrors SignStep but writes to job_description_signatures and uses a
// JD-specific consent line ("acknowledge" instead of "agree to terms").
// No employer countersignature concept here — JDs are signed by one
// party (the employee).

function SignJdStep({ employee, jd, jdSignature, lang, onSigned, onSkipBack }: {
  employee: Employee
  jd: JobDescription
  jdSignature: JobDescriptionSignature | null
  lang: 'en' | 'id'
  onSigned: (sig: JobDescriptionSignature) => void
  onSkipBack: () => void
}) {
  const { t } = useLang()
  const [typedName, setTypedName] = useState(employee.name)
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].name)
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  // JD body is stored as a structured doc (content_doc). Project it to
  // markdown in the candidate's preferred language, then reuse the same
  // contractToHtml helper so the visual treatment matches the contract
  // pane above.
  const renderedBody = useMemo(() => {
    return docToMarkdown(jd.content_doc as DocumentDoc | null, lang)
  }, [jd.content_doc, lang])

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setScrolledToBottom(true)
  }

  async function handleSign() {
    if (signing) return
    if (!typedName.trim() || !agreed) return
    setSigning(true)
    setError('')
    const { data, error: sigError } = await supabase
      .from('job_description_signatures')
      .insert({
        job_description_id: jd.id,
        version_number: jd.current_version,
        employee_id: employee.id,
        typed_name: typedName.trim(),
        signature_font: selectedFont,
      })
      .select()
      .single()

    if (sigError || !data) {
      setSigning(false)
      setError(sigError?.message || t.onboardingError)
      return
    }

    // Match the contract flow's signer-IP capture for the JD signature too —
    // useful for audit if a question ever arises about who acknowledged.
    captureSignatureIp(data.id, { type: 'portal', slug: employee.slug, accessToken: employee.access_token })

    await supabase.from('feed_events').insert({
      org_id: employee.org_id,
      employee_id: employee.id,
      event_type: 'job_description_signed',
      title: jd.title,
      description: `Version ${jd.current_version}`,
      metadata: { job_description_id: jd.id, version: jd.current_version, signature_font: selectedFont },
    })
    onSigned(data as JobDescriptionSignature)
  }

  if (jdSignature) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingJdTitle}</h1>
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)', color: 'var(--color-success)' }}>
          {t.onboardingJdSignAlready}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSigned(jdSignature)}
            className="rounded-lg px-6 py-3 text-base font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.onboardingNext}
          </button>
        </div>
      </div>
    )
  }

  const canSign = !!typedName.trim() && agreed && scrolledToBottom

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingJdTitle}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingJdBody}</p>
      </div>

      <div
        onScroll={handleScroll}
        className="prose-portal max-h-96 overflow-y-auto rounded-lg border p-5 text-sm"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
        dangerouslySetInnerHTML={{ __html: contractToHtml(renderedBody) }}
      />

      <div className="space-y-4 rounded-lg border p-5" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingJdSignTitle}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingJdSignBody}</p>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingSignNameLabel}</label>
          <input
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingSignFontLabel}</label>
          <div className="grid grid-cols-2 gap-2">
            {SIGNATURE_FONTS.map(font => {
              const isSelected = selectedFont === font.name
              return (
                <button
                  key={font.name}
                  type="button"
                  onClick={() => setSelectedFont(font.name)}
                  className="flex flex-col items-start gap-1 rounded-lg border p-3 transition-all"
                  style={{
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
                  }}
                >
                  <span className="text-2xl leading-none" style={{ fontFamily: `'${font.name}', cursive`, color: 'var(--color-text)' }}>
                    {typedName.trim() || employee.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{font.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          <span>{t.onboardingJdConsent}</span>
        </label>

        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onSkipBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
        <button
          type="button"
          onClick={handleSign}
          disabled={!canSign || signing}
          className="rounded-lg px-6 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {signing ? t.onboardingSaving : t.onboardingJdSignButton}
        </button>
      </div>
    </div>
  )
}

// ───── Personal step ─────────────────────────────────────────────────────

function PersonalStep({ employee, onSaved, onBack }: {
  employee: Employee
  onSaved: (updated: Employee) => void
  onBack: () => void
}) {
  const { t } = useLang()
  const [ktpNik, setKtpNik] = useState(employee.ktp_nik || '')
  const [dob, setDob] = useState(employee.date_of_birth || '')
  const [placeOfBirth, setPlaceOfBirth] = useState(employee.place_of_birth || '')
  const [address, setAddress] = useState(employee.address || '')
  const [postalCode, setPostalCode] = useState(employee.postal_code || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase
      .from('employees')
      .update({
        ktp_nik: ktpNik.trim() || null,
        date_of_birth: dob || null,
        place_of_birth: placeOfBirth.trim() || null,
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
      })
      .eq('id', employee.id)
      .select()
      .single()
    if (updateError || !data) {
      setSaving(false)
      setError(updateError?.message || t.onboardingError)
      return
    }
    onSaved(data)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingPersonalTitle}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingPersonalBody}</p>
      </div>

      <div className="space-y-4">
        <Field label={t.onboardingPersonalKtpLabel}>
          <input
            type="text"
            inputMode="numeric"
            value={ktpNik}
            onChange={e => setKtpNik(e.target.value.replace(/\D/g, '').slice(0, 16))}
            placeholder={t.onboardingPersonalKtpPlaceholder}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.onboardingPersonalDobLabel}>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.onboardingPersonalPlaceOfBirthLabel}>
            <input
              type="text"
              value={placeOfBirth}
              onChange={e => setPlaceOfBirth(e.target.value)}
              placeholder={t.onboardingPersonalPlaceOfBirthPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
        </div>
        <Field label={t.onboardingPersonalAddressLabel}>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>
        <Field label={t.onboardingPersonalPostalCodeLabel}>
          <input
            type="text"
            inputMode="numeric"
            value={postalCode}
            onChange={e => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className="w-full max-w-[120px] rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {saving ? t.onboardingSaving : t.onboardingNext}
        </button>
      </div>
    </div>
  )
}

// ───── Banking step ──────────────────────────────────────────────────────

function BankingStep({ employee, onSaved, onBack }: {
  employee: Employee
  onSaved: (updated: Employee) => void
  onBack: () => void
}) {
  const { t } = useLang()
  const [npwp, setNpwp] = useState(employee.npwp || '')
  const [bankName, setBankName] = useState(employee.bank_name || '')
  const [accountNumber, setAccountNumber] = useState(employee.bank_account_number || '')
  const [accountHolder, setAccountHolder] = useState(employee.bank_account_holder || employee.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase
      .from('employees')
      .update({
        npwp: npwp.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_number: accountNumber.trim() || null,
        bank_account_holder: accountHolder.trim() || null,
      })
      .eq('id', employee.id)
      .select()
      .single()
    if (updateError || !data) {
      setSaving(false)
      setError(updateError?.message || t.onboardingError)
      return
    }
    onSaved(data)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingBankingTitle}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingBankingBody}</p>
      </div>

      <div className="space-y-4">
        <Field label={t.onboardingBankingNpwpLabel}>
          <input
            type="text"
            inputMode="numeric"
            value={npwp}
            onChange={e => setNpwp(e.target.value.replace(/\D/g, '').slice(0, 16))}
            placeholder={t.onboardingBankingNpwpPlaceholder}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>
        <Field label={t.onboardingBankingNameLabel}>
          <input
            type="text"
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            placeholder={t.onboardingBankingNamePlaceholder}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>
        <Field label={t.onboardingBankingAccountLabel}>
          <input
            type="text"
            inputMode="numeric"
            value={accountNumber}
            onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>
        <Field label={t.onboardingBankingHolderLabel}>
          <input
            type="text"
            value={accountHolder}
            onChange={e => setAccountHolder(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.onboardingBankingHolderHelp}</p>
        </Field>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {saving ? t.onboardingSaving : t.onboardingNext}
        </button>
      </div>
    </div>
  )
}

// ───── Emergency contact step ────────────────────────────────────────────

function EmergencyStep({ employee, onSaved, onBack }: {
  employee: Employee
  onSaved: () => void
  onBack: () => void
}) {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load any existing emergency contact so we can edit rather than duplicate.
  useEffect(() => {
    let cancelled = false
    supabase.from('employee_emergency_contacts').select('*').eq('employee_id', employee.id).order('created_at').limit(1).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setExistingId(data.id)
          setName(data.name)
          setRelationship(data.relationship)
          setPhone(data.phone)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [employee.id])

  async function handleSave() {
    if (saving) return
    // Allow skipping with all-blank.
    const allBlank = !name.trim() && !relationship.trim() && !phone.trim()
    if (allBlank) { onSaved(); return }
    setSaving(true)
    setError('')

    if (existingId) {
      const { error: updateError } = await supabase
        .from('employee_emergency_contacts')
        .update({
          name: name.trim(),
          relationship: relationship.trim(),
          phone: phone.trim(),
        })
        .eq('id', existingId)
      setSaving(false)
      if (updateError) { setError(updateError.message); return }
      onSaved()
      return
    }

    const { error: insertError } = await supabase
      .from('employee_emergency_contacts')
      .insert({
        org_id: employee.org_id,
        employee_id: employee.id,
        name: name.trim(),
        relationship: relationship.trim(),
        phone: phone.trim(),
      })
    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    onSaved()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingEmergencyTitle}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingEmergencyBody}</p>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      ) : (
        <div className="space-y-4">
          <Field label={t.onboardingEmergencyNameLabel}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.onboardingEmergencyRelationshipLabel}>
            <input
              type="text"
              value={relationship}
              onChange={e => setRelationship(e.target.value)}
              placeholder={t.onboardingEmergencyRelationshipPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.onboardingEmergencyPhoneLabel}>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        </div>
      )}

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg px-6 py-3 text-base font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {saving ? t.onboardingSaving : t.onboardingNext}
        </button>
      </div>
    </div>
  )
}

// ───── Documents step ────────────────────────────────────────────────────

function DocsStep({ employee, onSaved, onSkip, onBack }: {
  employee: Employee
  onSaved: (updated: Employee) => void
  onSkip: () => void
  onBack: () => void
}) {
  const { t } = useLang()
  const [ktpUrl, setKtpUrl] = useState(employee.ktp_photo_url)
  const [kkUrl, setKkUrl] = useState(employee.kk_photo_url)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function persistField(field: 'ktp_photo_url' | 'kk_photo_url', url: string | null) {
    const update: { ktp_photo_url?: string | null; kk_photo_url?: string | null } =
      field === 'ktp_photo_url' ? { ktp_photo_url: url } : { kk_photo_url: url }
    const { error: updateError } = await supabase
      .from('employees')
      .update(update)
      .eq('id', employee.id)
    if (updateError) setError(updateError.message)
  }

  async function handleContinue() {
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', employee.id)
      .single()
    setSaving(false)
    if (updateError || !data) {
      setError(updateError?.message || t.onboardingError)
      return
    }
    onSaved(data)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.onboardingDocsTitle}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingDocsBody}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingDocsKtpLabel}</label>
          <DocumentUpload
            employeeId={employee.id}
            kind="ktp"
            photoUrl={ktpUrl}
            label={employee.name}
            onChange={url => { setKtpUrl(url); persistField('ktp_photo_url', url) }}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onboardingDocsKkLabel}</label>
          <DocumentUpload
            employeeId={employee.id}
            kind="kk"
            photoUrl={kkUrl}
            label={employee.name}
            onChange={url => { setKkUrl(url); persistField('kk_photo_url', url) }}
          />
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>← {t.onboardingBack}</button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.onboardingDocsSkip}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={saving}
            className="rounded-lg px-6 py-3 text-base font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? t.onboardingSaving : t.onboardingNext}
          </button>
        </div>
      </div>
    </div>
  )
}

// ───── Done step ─────────────────────────────────────────────────────────

function DoneStep({ startDate, lang, preOffer, onEnter }: { startDate: string | null; lang: 'en' | 'id'; preOffer: boolean; onEnter: () => void }) {
  const { t } = useLang()
  const formattedDate = startDate
    ? new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(startDate))
    : null

  const title = preOffer ? t.onboardingDoneTitlePreOffer : t.onboardingDoneTitle
  const body = preOffer
    ? t.onboardingDoneBodyPreOffer
    : (formattedDate ? t.onboardingDoneBodyWithDate(formattedDate) : t.onboardingDoneBodyNoDate)
  // Pre-offer candidates have no useful "portal" to enter past this step —
  // they're waiting for an offer. The button label nudges them toward
  // updating their info rather than entering a portal that doesn't apply
  // to them yet.
  const cta = preOffer ? t.onboardingDoneEnterPortalPreOffer : t.onboardingDoneEnterPortal

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="text-3xl font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h1>
      <p className="mx-auto max-w-md text-base" style={{ color: 'var(--color-text-secondary)' }}>
        {body}
      </p>
      <div className="pt-4">
        <button
          type="button"
          onClick={onEnter}
          className="rounded-lg px-6 py-3 text-base font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {cta}
        </button>
      </div>
    </div>
  )
}

// ───── Helpers ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}

// Minimal markdown → HTML for the contract preview. Mirrors the rendering
// done by the existing portal contract view so candidates see the same thing.
function contractToHtml(markdown: string): string {
  // The merge-field renderer already produces some HTML (signature spans).
  // Convert standard markdown structure to HTML; preserve any embedded HTML.
  const lines = markdown.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.replace(/^#{1,6}\s*/, m => `<h${m.trim().length}>`).replace(/^<h(\d)>(.*)$/, (_, n, rest) => `<h${n}>${rest}</h${n}>`)
    if (/^[-*]\s+/.test(raw)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${raw.replace(/^[-*]\s+/, '')}</li>`)
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      if (line.trim() === '') out.push('<p></p>')
      else if (/^<h\d>/.test(line)) out.push(line)
      else out.push(`<p>${line}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('\n').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
