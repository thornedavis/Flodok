import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { AvatarUpload } from '../../components/AvatarUpload'
import { ownerClaim } from '../../lib/ownerClaim'
import type { User, Organization } from '../../types/aliases'

// First-run setup wizard. Runs full-screen between signup and the dashboard,
// gated by organizations.onboarding_completed_at (App.tsx). Each step writes
// through on advance, so closing the tab keeps prior progress; the gate derives
// "still onboarding" from the unset flag, not a client cursor.
//
// Four steps: welcome (+ on-behalf owner invite), company identity, payroll
// basics, invite team. On finish OR skip we stamp onboarding_completed_at and
// hand back to App, which re-routes to the dashboard.

type StepKey = 'welcome' | 'company' | 'operate' | 'invite'
const STEPS: StepKey[] = ['welcome', 'company', 'operate', 'invite']

function generateInviteToken() {
  const array = new Uint8Array(24)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function Onboarding({ user, org }: {
  user: User
  org: Organization
}) {
  const { t } = useLang()
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]
  // On-behalf setup provisions the creator as admin of an ownerless org (179);
  // a plain owner signup has role 'owner'. Only the former needs the owner-claim.
  const isOnBehalf = user.role !== 'owner'

  const [saving, setSaving] = useState(false)
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

  // Invite teammates
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'hr' | 'member'>('member')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  function next() { setError(''); setStepIdx(i => Math.min(i + 1, STEPS.length - 1)) }
  function back() { setError(''); setStepIdx(i => Math.max(i - 1, 0)) }

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

  async function handleNext() {
    if (step === 'company' && !(await saveCompany())) return
    if (step === 'operate' && !(await saveOperate())) return
    next()
  }

  async function sendOwnerClaim() {
    const email = ownerEmail.trim().toLowerCase()
    if (!email.includes('@')) { setError(t.onbOwnerEmailInvalid); return }
    setClaimBusy(true); setError('')
    try {
      await ownerClaim({ action: 'create', owner_email: email, owner_name: ownerName.trim() || null })
      setClaimSentTo(email)
    } catch (e) {
      setError((e as Error).message)
    }
    setClaimBusy(false)
  }

  async function createInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email.includes('@')) { setError(t.onbInviteEmailInvalid); return }
    setInviteBusy(true); setError('')
    const token = generateInviteToken()
    const { error: e } = await supabase.from('org_invitations').insert({
      org_id: org.id, email, token, role: inviteRole, invited_by: user.id,
    })
    setInviteBusy(false)
    if (e) { setError(e.message); return }
    setInviteLink(`${window.location.origin}/invite/${token}`)
    setInviteEmail('')
  }

  async function copyInviteLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (e.g. non-HTTPS) — the link stays visible to copy by hand.
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
    window.location.href = '/dashboard'
  }

  const orgLabel = displayName.trim() || name.trim() || org.name
  const stepNumber = stepIdx + 1
  const total = STEPS.length

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }
  const fieldLabel = 'mb-1 block text-sm font-medium'
  const fieldInput = 'w-full rounded-lg border px-3 py-2 text-sm'

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{orgLabel}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.onbStepOf(stepNumber, total)}</span>
            <button type="button" onClick={finish} disabled={saving} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.onbSkip}
            </button>
          </div>
        </header>

        {/* Progress bar */}
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: i <= stepIdx ? 'var(--color-primary)' : 'var(--color-border)' }}
            />
          ))}
        </div>

        <main className="mt-8 flex-1">
          {error && (
            <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          {step === 'welcome' && (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                {isOnBehalf ? t.onbWelcomeOnBehalfTitle : t.onbWelcomeOwnerTitle}
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {isOnBehalf ? t.onbWelcomeOnBehalfBody : t.onbWelcomeOwnerBody(orgLabel)}
              </p>

              {isOnBehalf && (
                claimSentTo ? (
                  <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-sm" style={{ color: 'var(--color-text)' }}>{t.onbClaimSentTo(claimSentTo)}</p>
                    <div className="mt-3 flex gap-4">
                      <button type="button" onClick={sendOwnerClaim} disabled={claimBusy} className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                        {t.onbResendInvite}
                      </button>
                      <button type="button" onClick={() => setClaimSentTo(null)} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {t.onbChangeOwnerEmail}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                      <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbOwnerNameLabel}</label>
                      <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className={fieldInput} style={inputStyle} />
                    </div>
                    <div>
                      <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbOwnerEmailLabel}</label>
                      <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className={fieldInput} style={inputStyle} />
                    </div>
                    <button
                      type="button"
                      onClick={sendOwnerClaim}
                      disabled={claimBusy}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {claimBusy ? t.onbSendingInvite : t.onbSendInvite}
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          {step === 'company' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{t.onbCompanyTitle}</h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onbCompanySubtitle}</p>
              </div>
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
          )}

          {step === 'operate' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{t.onbOperateTitle}</h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onbOperateSubtitle}</p>
              </div>
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
                <input
                  type="number"
                  min={0}
                  max={28}
                  value={payDay}
                  onChange={e => setPayDay(e.target.value)}
                  className={fieldInput}
                  style={inputStyle}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.onbPayDayHint}</p>
              </div>
            </div>
          )}

          {step === 'invite' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{t.onbInviteTitle}</h1>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.onbInviteSubtitle}</p>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className={fieldLabel} style={{ color: 'var(--color-text-secondary)' }}>{t.onbInviteEmailLabel}</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className={fieldInput} style={inputStyle} />
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
              <button
                type="button"
                onClick={createInvite}
                disabled={inviteBusy}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                {inviteBusy ? t.onbInviteCreating : t.onbInviteCreate}
              </button>

              {inviteLink && (
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
                  <p className="mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t.onbInviteLinkReady}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-black/5 px-2 py-1 text-xs" style={{ color: 'var(--color-text)' }}>{inviteLink}</code>
                    <button type="button" onClick={copyInviteLink} className="shrink-0 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                      {copied ? t.onbCopied : t.onbCopyLink}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={stepIdx === 0 || saving}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t.onbBack}
          </button>
          {step === 'invite' ? (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? t.onbFinishing : t.onbFinish}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? t.onbSaving : t.onbNext}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
