import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { AvatarUpload } from '../../components/AvatarUpload'
import { Wordmark } from '../../components/Brand'
import { ownerClaim } from '../../lib/ownerClaim'
import { inviteMember } from '../../lib/inviteMember'
import type { User, Organization } from '../../types/aliases'

// First-run setup wizard. Runs full-screen between signup and the dashboard,
// gated by organizations.onboarding_completed_at (App.tsx). Each step writes
// through on advance, so closing the tab — or hitting Exit, which signs out and
// returns to /login — keeps prior progress: the gate derives "still onboarding"
// from the unset flag, so the next login drops them straight back into the flow.
//
// Layout follows the auth pages so signup → onboarding feels seamless: a thin
// progress bar pinned to the very top, the Flodok wordmark top-left, and Exit
// top-right. An intro cover screen precedes the numbered steps; the footer is a
// single content-aware button (Skip when empty → Continue / Send & continue
// once a step's fields are filled), with Back to its left.
//
// Steps: company identity, payroll basics, invite team — plus an "invite the
// owner" step first when the creator set up on the owner's behalf (179).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FlowStep = 'owner' | 'company' | 'operate' | 'invite'

export function Onboarding({ user, org, onSignOut }: {
  user: User
  org: Organization
  onSignOut: () => Promise<void> | void
}) {
  const { t } = useLang()
  // On-behalf setup provisions the creator as admin of an ownerless org (179);
  // a plain owner signup has role 'owner'. Only the former needs the owner-claim.
  const isOnBehalf = user.role !== 'owner'

  const steps: FlowStep[] = isOnBehalf
    ? ['owner', 'company', 'operate', 'invite']
    : ['company', 'operate', 'invite']

  const [started, setStarted] = useState(false) // false = intro cover screen
  const [stepIdx, setStepIdx] = useState(0)
  const step = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1

  const [saving, setSaving] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [error, setError] = useState('')

  // Company identity
  const [name, setName] = useState(org.name ?? '')
  const [displayName, setDisplayName] = useState(org.display_name ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logo_url)
  const [street, setStreet] = useState(org.address_street ?? '')
  const [city, setCity] = useState(org.address_city ?? '')
  const [province, setProvince] = useState(org.address_province ?? '')
  const [postal, setPostal] = useState(org.address_postal_code ?? '')

  // Payroll basics
  const [timezone, setTimezone] = useState(org.timezone ?? 'Asia/Jakarta')
  const [payDay, setPayDay] = useState(String(org.pay_day_of_month ?? 1))

  // On-behalf owner claim
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [claimSentTo, setClaimSentTo] = useState<string | null>(null)
  const [claimBusy, setClaimBusy] = useState(false)

  // Invite a teammate
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'hr' | 'member'>('member')
  const [inviteBusy, setInviteBusy] = useState(false)

  const busy = saving || claimBusy || inviteBusy || exiting

  function goNext() {
    setError('')
    if (isLast) { void finish(); return }
    setStepIdx(i => Math.min(i + 1, steps.length - 1))
  }

  function back() {
    setError('')
    if (stepIdx === 0) { setStarted(false); return } // step 1 ← intro cover
    setStepIdx(i => Math.max(i - 1, 0))
  }

  async function saveCompany(): Promise<boolean> {
    if (!name.trim()) { setError(t.onbNameRequired); return false }
    setSaving(true); setError('')
    const { error: e } = await supabase.from('organizations').update({
      name: name.trim(),
      display_name: displayName.trim() || null,
      logo_url: logoUrl,
      address_street: street.trim() || null,
      address_city: city.trim() || null,
      address_province: province.trim() || null,
      address_postal_code: postal.trim() || null,
    }).eq('id', org.id)
    setSaving(false)
    if (e) { setError(e.message); return false }
    return true
  }

  async function saveOperate(): Promise<boolean> {
    const parsed = parseInt(payDay, 10)
    // pay_day_of_month is 1–28, or 0 = last day of month (mirrors the DB +
    // Company settings). Days 29–31 aren't offered; use 0 for month-end.
    const payDayVal = Number.isFinite(parsed) ? Math.max(0, Math.min(28, parsed)) : 1
    setSaving(true); setError('')
    const { error: e } = await supabase.from('organizations')
      .update({ timezone, pay_day_of_month: payDayVal })
      .eq('id', org.id)
    setSaving(false)
    if (e) { setError(e.message); return false }
    return true
  }

  async function sendOwnerClaim(): Promise<boolean> {
    const email = ownerEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { setError(t.onbOwnerEmailInvalid); return false }
    setClaimBusy(true); setError('')
    try {
      await ownerClaim({ action: 'create', owner_email: email, owner_name: ownerName.trim() || null })
      setClaimSentTo(email)
      setClaimBusy(false)
      return true
    } catch (e) {
      setError((e as Error).message)
      setClaimBusy(false)
      return false
    }
  }

  async function createInvite(): Promise<boolean> {
    const email = inviteEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { setError(t.onbInviteEmailInvalid); return false }
    setInviteBusy(true); setError('')
    try {
      // Creates + emails the invite (Supabase "Invite user" template).
      await inviteMember({ email, role: inviteRole })
      setInviteBusy(false)
      return true
    } catch (err) {
      setError((err as Error).message)
      setInviteBusy(false)
      return false
    }
  }

  async function finish() {
    setSaving(true); setError('')
    const { error: e } = await supabase.from('organizations')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', org.id)
    if (e) { setError(e.message); setSaving(false); return }
    // Hard reload into the app: useAuth refetches the org (now flagged complete)
    // and the App gate routes to the dashboard. A full load avoids any
    // refetch-timing/stale-state window around the wizard→dashboard handoff.
    // (saving stays true through the reload, keeping the buttons disabled.)
    window.location.assign('/dashboard')
  }

  // Exit = leave for now without losing progress. Sign out and return to login;
  // because onboarding_completed_at is still unset, the gate routes them back
  // into the wizard on their next login (their saved fields are already there).
  async function handleExit() {
    setExiting(true)
    try { await onSignOut() } catch { /* sign-out best-effort; reload below resets state */ }
    window.location.assign('/login')
  }

  // The single content-aware footer action for the current step.
  type Primary = { label: string; busyLabel?: string; onClick: () => void }
  function primaryAction(): Primary {
    if (step === 'owner') {
      if (claimSentTo) return { label: t.onbContinue, onClick: goNext }
      const ready = ownerName.trim() !== '' && EMAIL_RE.test(ownerEmail.trim())
      if (ready) return { label: t.onbSendContinue, busyLabel: t.onbSendingInvite, onClick: () => { void sendOwnerThenNext() } }
      return { label: t.onbSkip, onClick: goNext }
    }
    if (step === 'company') {
      if (name.trim() !== '') return { label: t.onbContinue, busyLabel: t.onbSaving, onClick: () => { void saveCompanyThenNext() } }
      return { label: t.onbSkip, onClick: goNext }
    }
    if (step === 'operate') {
      return { label: t.onbContinue, busyLabel: t.onbSaving, onClick: () => { void saveOperateThenNext() } }
    }
    // invite — the final step
    if (EMAIL_RE.test(inviteEmail.trim())) {
      return { label: t.onbSendFinish, busyLabel: t.onbSendingInvite, onClick: () => { void sendInviteThenFinish() } }
    }
    return { label: t.onbFinish, busyLabel: t.onbFinishing, onClick: () => { void finish() } }
  }

  async function sendOwnerThenNext() { if (await sendOwnerClaim()) goNext() }
  async function saveCompanyThenNext() { if (await saveCompany()) goNext() }
  async function saveOperateThenNext() { if (await saveOperate()) goNext() }
  async function sendInviteThenFinish() { if (await createInvite()) await finish() }

  const orgLabel = displayName.trim() || name.trim() || org.name
  const progressPct = !started ? 0 : Math.round(((stepIdx + 1) / steps.length) * 100)

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }
  const fieldLabel = 'mb-1 block text-sm font-medium'
  const fieldInput = 'w-full rounded-lg border px-3 py-2 text-sm'

  const stepIntro: Record<FlowStep, { title: string; desc: string }> = {
    owner: { title: t.onbIntroStepOwnerTitle, desc: t.onbIntroStepOwnerDesc },
    company: { title: t.onbIntroStepCompanyTitle, desc: t.onbIntroStepCompanyDesc },
    operate: { title: t.onbIntroStepOperateTitle, desc: t.onbIntroStepOperateDesc },
    invite: { title: t.onbIntroStepInviteTitle, desc: t.onbIntroStepInviteDesc },
  }

  // Eyebrow + heading shared across the numbered steps.
  const stepHeader = (title: string, subtitle?: string) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
        {t.onbStepOf(stepIdx + 1, steps.length)}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl" style={{ color: 'var(--color-text)' }}>{title}</h1>
      {subtitle && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>
      )}
    </div>
  )

  // Green tick shown inside an email field once the value is a valid address.
  const emailTick = (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center" aria-label={t.onbEmailValid} title={t.onbEmailValid}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )

  const primary = primaryAction()

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Progress bar — pinned to the very top edge, fills as the flow advances */}
      <div className="h-1 w-full" style={{ backgroundColor: 'var(--color-border)' }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%`, backgroundColor: 'var(--color-primary)' }}
        />
      </div>

      {/* Header — wordmark top-left (matches the auth pages) + Exit top-right */}
      <header className="flex items-center justify-between px-6 pb-3 pt-9 md:px-10">
        <Wordmark height={24} />
        <button
          type="button"
          onClick={handleExit}
          disabled={exiting}
          className="text-xs font-medium uppercase tracking-widest transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {t.onbExit}
        </button>
      </header>

      {/* Content — vertically + horizontally centered; tall steps scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-5 py-10 md:py-16">
          <div className="w-full max-w-lg">
            {!started ? (
              /* ── Intro cover ─────────────────────────────────────── */
              <div className="space-y-9">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
                    {t.onbIntroEyebrow}
                  </p>
                  <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
                    {t.onbIntroTitle}
                  </h1>
                  <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.onbIntroBody}
                  </p>
                </div>

                <ol className="space-y-4">
                  {steps.map((s, i) => (
                    <li key={s} className="flex gap-3.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}
                      >
                        {i + 1}
                      </span>
                      <div className="pt-0.5">
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{stepIntro[s].title}</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{stepIntro[s].desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setStarted(true)}
                    className="w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {t.onbGetStarted}
                  </button>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.onbIntroHelp}{' '}
                    <a
                      href="/help"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {t.onbIntroHelpLink}
                    </a>
                  </p>
                </div>
              </div>
            ) : (
              /* ── Numbered steps ──────────────────────────────────── */
              <>
                <main>
                  {error && (
                    <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                      {error}
                    </div>
                  )}

                  {step === 'owner' && (
                    <div className="space-y-5">
                      {stepHeader(t.onbOwnerStepTitle, t.onbOwnerStepSubtitle)}
                      {claimSentTo ? (
                        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
                          <p className="text-sm" style={{ color: 'var(--color-text)' }}>{t.onbClaimSentTo(claimSentTo)}</p>
                          <div className="mt-3 flex gap-4">
                            <button type="button" onClick={() => { void sendOwnerClaim() }} disabled={claimBusy} className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                              {t.onbResendInvite}
                            </button>
                            <button type="button" onClick={() => setClaimSentTo(null)} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                              {t.onbChangeOwnerEmail}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbOwnerNameLabel}</label>
                            <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className={fieldInput} style={inputStyle} />
                          </div>
                          <div>
                            <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbOwnerEmailLabel}</label>
                            <div className="relative">
                              <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className={`${fieldInput} pr-10`} style={inputStyle} />
                              {EMAIL_RE.test(ownerEmail.trim()) && emailTick}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {step === 'company' && (
                    <div className="space-y-5">
                      {stepHeader(t.onbCompanyTitle, t.onbCompanySubtitle)}
                      <div className="space-y-4">
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbLegalNameLabel}</label>
                          <input type="text" value={name} onChange={e => setName(e.target.value)} required className={fieldInput} style={inputStyle} />
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbDisplayNameLabel}</label>
                          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className={fieldInput} style={inputStyle} />
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbLogoLabel}</label>
                          <AvatarUpload id={org.id} storagePrefix="org" photoUrl={logoUrl} label={orgLabel} onChange={setLogoUrl} />
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbAddressStreet}</label>
                          <input type="text" value={street} onChange={e => setStreet(e.target.value)} className={fieldInput} style={inputStyle} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbAddressCity}</label>
                            <input type="text" value={city} onChange={e => setCity(e.target.value)} className={fieldInput} style={inputStyle} />
                          </div>
                          <div>
                            <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbAddressProvince}</label>
                            <input type="text" value={province} onChange={e => setProvince(e.target.value)} className={fieldInput} style={inputStyle} />
                          </div>
                          <div>
                            <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbAddressPostal}</label>
                            <input type="text" value={postal} onChange={e => setPostal(e.target.value)} className={fieldInput} style={inputStyle} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 'operate' && (
                    <div className="space-y-5">
                      {stepHeader(t.onbOperateTitle, t.onbOperateSubtitle)}
                      <div className="space-y-4">
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.timezoneLabel}</label>
                          <select value={timezone} onChange={e => setTimezone(e.target.value)} className={fieldInput} style={inputStyle}>
                            <option value="Asia/Jakarta">{t.timezoneWib}</option>
                            <option value="Asia/Makassar">{t.timezoneWita}</option>
                            <option value="Asia/Jayapura">{t.timezoneWit}</option>
                          </select>
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbPayDayLabel}</label>
                          <input type="number" min={0} max={28} value={payDay} onChange={e => setPayDay(e.target.value)} className={fieldInput} style={inputStyle} />
                          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.onbPayDayHint}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 'invite' && (
                    <div className="space-y-5">
                      {stepHeader(t.onbInviteTitle, t.onbInviteSubtitle)}
                      <div className="grid grid-cols-[1fr_auto] gap-3">
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbInviteEmailLabel}</label>
                          <div className="relative">
                            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className={`${fieldInput} pr-10`} style={inputStyle} />
                            {EMAIL_RE.test(inviteEmail.trim()) && emailTick}
                          </div>
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbInviteRoleLabel}</label>
                          <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'admin' | 'hr' | 'member')} className={fieldInput} style={inputStyle}>
                            <option value="admin">{t.onbRoleAdmin}</option>
                            <option value="hr">{t.onbRoleHr}</option>
                            <option value="member">{t.onbRoleMember}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </main>

                <footer className="mt-10 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={back}
                    disabled={busy}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t.onbBack}
                  </button>
                  <button
                    type="button"
                    onClick={primary.onClick}
                    disabled={busy}
                    className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {busy && primary.busyLabel ? primary.busyLabel : primary.label}
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
