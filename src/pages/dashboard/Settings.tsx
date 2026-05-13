import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { getAvatarGradient } from '../../lib/avatar'
import { BadgeGlyph } from '../../components/BadgeGlyph'
import { BadgePicker } from '../../components/BadgePicker'
import { formatIdrDigits } from '../../lib/credits'
import { AvatarUpload } from '../../components/AvatarUpload'
import { PhoneInput } from '../../components/PhoneInput'
import { isValidE164 } from '../../lib/phone'
import type { Translations } from '../../lib/translations'
import type { User, Organization, OrgInvitation } from '../../types/aliases'
import { IntegrationCard } from '../../components/integrations/IntegrationCard'
import { ConnectFirefliesDialog } from '../../components/integrations/ConnectFirefliesDialog'
import { ConnectAsanaDialog } from '../../components/integrations/ConnectAsanaDialog'
import { listIntegrations, deleteIntegration, type IntegrationRow } from '../../lib/integrations'
import { SIGNATURE_FONTS, ensureSignatureFontsLoaded } from '../../lib/signatureFonts'
import {
  loadOrgBilling,
  openPortal,
  getPaymentMethod,
  isPro as isProOrg,
  type OrgBilling,
  type PaymentMethod,
} from '../../lib/billing'
import { calculateProMonthlyIdr, formatIdr, FREE_EMPLOYEE_LIMIT, PRO_MIN_SEATS } from '../../lib/pricing'
import { UpgradeModal } from '../../components/UpgradeModal'
import { useBilling } from '../../contexts/BillingContext'

ensureSignatureFontsLoaded()

type Tab = 'account' | 'team' | 'integrations' | 'credits' | 'bonuses' | 'achievements' | 'billing'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

export function Settings({ user }: { user: User }) {
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')

  let tab: Tab = 'account'
  if (rawTab === 'team' || rawTab === 'billing') tab = rawTab
  else if (rawTab === 'integrations' && isAdmin) tab = 'integrations'
  else if (rawTab === 'achievements' && isAdmin) tab = 'achievements'
  else if (rawTab === 'credits' && isAdmin) tab = 'credits'
  else if (rawTab === 'bonuses' && isAdmin) tab = 'bonuses'

  function setTab(next: Tab) {
    setParams({ tab: next }, { replace: true })
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.settingsTitle}</h1>

      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <TabButton active={tab === 'account'} onClick={() => setTab('account')}>{t.settingsAccountTab}</TabButton>
        <TabButton active={tab === 'team'} onClick={() => setTab('team')}>{t.settingsTeamTab}</TabButton>
        {isAdmin && (
          <TabButton active={tab === 'integrations'} onClick={() => setTab('integrations')}>{t.settingsIntegrationsTab}</TabButton>
        )}
        {isAdmin && (
          <TabButton active={tab === 'credits'} onClick={() => setTab('credits')}>{t.settingsCreditsTab}</TabButton>
        )}
        {isAdmin && (
          <TabButton active={tab === 'bonuses'} onClick={() => setTab('bonuses')}>{t.settingsBonusesTab}</TabButton>
        )}
        {isAdmin && (
          <TabButton active={tab === 'achievements'} onClick={() => setTab('achievements')}>{t.achievementDefsTitle}</TabButton>
        )}
        <TabButton active={tab === 'billing'} onClick={() => setTab('billing')}>{t.settingsBillingTab}</TabButton>
      </div>

      {tab === 'account' && <AccountTab user={user} t={t} />}
      {tab === 'team' && <TeamMembersSection user={user} t={t} />}
      {tab === 'integrations' && isAdmin && <IntegrationsTab user={user} t={t} />}
      {tab === 'credits' && isAdmin && <CreditsTab user={user} t={t} />}
      {tab === 'bonuses' && isAdmin && <BonusesTab user={user} t={t} />}
      {tab === 'achievements' && isAdmin && <AchievementsTab user={user} t={t} />}
      {tab === 'billing' && <BillingTab user={user} t={t} />}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-2 text-sm font-medium transition-colors"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      {children}
      {active && (
        <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />
      )}
    </button>
  )
}

// ─── Account tab ────────────────────────────────────────

function AccountTab({ user, t }: { user: User; t: Translations }) {
  const [org, setOrg] = useState<Organization | null>(null)
  // Local "baseline" of what's currently persisted. Initialized from the
  // user prop and refreshed after a successful save so the dirty check
  // resets — without this, the prop stays stale after save and the Save
  // button looks active forever even when the form matches the DB.
  const [baseline, setBaseline] = useState({
    name: user.name,
    phone: user.phone || '',
    title: user.title || '',
    signatureFont: user.signature_font || SIGNATURE_FONTS[0].name,
  })
  const [name, setName] = useState(baseline.name)
  const [phone, setPhone] = useState(baseline.phone)
  const [title, setTitle] = useState(baseline.title)
  const [signatureFont, setSignatureFont] = useState(baseline.signatureFont)
  const [photoUrl, setPhotoUrl] = useState<string | null>(user.photo_url)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('organizations').select('default_country_code').eq('id', user.org_id).single().then(({ data }) => {
      if (data) setOrg(prev => ({ ...(prev || {} as Organization), default_country_code: data.default_country_code } as Organization))
    })
  }, [user.org_id])

  const phoneValid = !phone || isValidE164(phone)
  const nameDirty = name.trim() !== baseline.name && name.trim().length > 0
  const phoneDirty = (phone || null) !== (baseline.phone || null)
  const titleDirty = (title.trim() || null) !== (baseline.title || null)
  const fontDirty = signatureFont !== baseline.signatureFont
  const dirty = (nameDirty || phoneDirty || titleDirty || fontDirty) && phoneValid && name.trim().length > 0

  async function handlePhotoChange(url: string | null) {
    const previous = photoUrl
    setPhotoUrl(url)
    setError('')
    // .select().single() so a silent 0-row update (RLS block) surfaces as an error
    const { data, error: updateError } = await supabase
      .from('users')
      .update({ photo_url: url })
      .eq('id', user.id)
      .select()
      .single()
    if (updateError || !data) {
      console.error('Failed to save photo_url', updateError)
      setError(updateError?.message || 'Could not save photo — please try again.')
      setPhotoUrl(previous)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    setError('')
    const nextName = name.trim()
    const nextPhone = phone || ''
    const nextTitle = title.trim()
    const { error: updateError } = await supabase
      .from('users')
      .update({
        name: nextName,
        phone: nextPhone || null,
        title: nextTitle || null,
        signature_font: signatureFont,
      })
      .eq('id', user.id)
    if (updateError) {
      setError(updateError.message)
    } else {
      setBaseline({ name: nextName, phone: nextPhone, title: nextTitle, signatureFont })
      setSavedAt(Date.now())
    }
    setSaving(false)
  }

  function handleCancel() {
    setName(baseline.name)
    setPhone(baseline.phone)
    setTitle(baseline.title)
    setSignatureFont(baseline.signatureFont)
    setError('')
  }

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.yourProfile}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || !dirty}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              form="account-edit-form"
              disabled={saving || !dirty}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>
        <form id="account-edit-form" onSubmit={handleSave} className="space-y-5">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.photoLabel}</label>
            <AvatarUpload
              id={user.id}
              storagePrefix="user"
              photoUrl={photoUrl}
              label={user.name}
              onChange={handlePhotoChange}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.fullNameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.phoneWhatsAppLabel}</label>
            <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={org?.default_country_code} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.emailAddressLabel}</label>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.emailChangeHint}</p>
          </div>

          {savedAt && !dirty && (
            <p className="pt-1 text-xs" style={{ color: 'var(--color-success)' }}>{t.profileSaved}</p>
          )}
        </form>
      </section>

      <section className="space-y-5 border-t pt-10" style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.signingProfileSection}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.signingProfileDesc}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.signerTitleLabel}</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t.signerTitlePlaceholder}
            form="account-edit-form"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.signerTitleHelp}</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.defaultSignatureStyle}</label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {SIGNATURE_FONTS.map(font => (
              <button
                key={font.name}
                type="button"
                onClick={() => setSignatureFont(font.name)}
                className="rounded-xl border px-4 py-3 text-left transition-colors"
                style={{
                  borderColor: signatureFont === font.name ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: signatureFont === font.name ? 'var(--color-bg-secondary, var(--color-bg))' : 'transparent',
                }}
              >
                <span className="block truncate text-xl" style={{ fontFamily: `'${font.name}', cursive`, color: 'var(--color-text)' }}>
                  {name || user.name}
                </span>
                <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{font.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t pt-10" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.securitySection}</h2>
        <PasswordResetRow email={user.email} t={t} />
      </section>
    </div>
  )
}

function PasswordResetRow({ email, t }: { email: string; t: Translations }) {
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function handleSend() {
    setSending(true)
    setError('')
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (sendError) setError(sendError.message)
    else setSentAt(Date.now())
    setSending(false)
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.passwordLabel}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg)' }}
        >
          {sending ? t.sendingResetLink : t.sendResetLink}
        </button>
        {sentAt && (
          <span className="text-xs" style={{ color: 'var(--color-success)' }}>{t.resetLinkSent}</span>
        )}
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.resetLinkHint}</p>
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}
    </div>
  )
}

// ─── Organization tab ───────────────────────────────────

// ─── Team members + invites ─────────────────────────────

function generateInviteToken() {
  const array = new Uint8Array(24)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

type EmployeeOption = { id: string; name: string }

function TeamMembersSection({ user, t }: { user: User; t: Translations }) {
  const { isAdmin, isOwner } = useRole(user)
  const [members, setMembers] = useState<User[]>([])
  const [invites, setInvites] = useState<OrgInvitation[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [usersResult, invitesResult, employeesResult] = await Promise.all([
      supabase.from('users').select('*').eq('org_id', user.org_id).order('created_at'),
      supabase.from('org_invitations').select('*').eq('org_id', user.org_id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('org_id', user.org_id).order('name'),
    ])
    setMembers(usersResult.data || [])
    setInvites(invitesResult.data || [])
    setEmployees(employeesResult.data || [])
    setLoading(false)
  }

  async function handleLinkEmployee(userId: string, employeeId: string | null) {
    const { error } = await supabase
      .from('users')
      .update({ employee_id: employeeId })
      .eq('id', userId)
    if (error) { alert(error.message); return }
    loadData()
  }

  async function handleRevoke(id: string) {
    if (!confirm(t.revokeInviteConfirm)) return
    await supabase.from('org_invitations').update({ status: 'revoked' }).eq('id', id)
    loadData()
  }

  async function handleRoleChange(targetId: string, newRole: 'admin' | 'hr' | 'member') {
    const { error } = await supabase.rpc('admin_update_user_role', {
      target_user_id: targetId,
      new_role: newRole,
    })
    if (error) { alert(error.message); return }
    loadData()
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.teamMembersSectionTitle}</h2>
        <div className="flex flex-wrap gap-2">
          {/* Only the current owner sees this. The RPC double-checks, but
              hiding the button keeps the surface tidy for admins/HR/etc. */}
          {isOwner && (
            <button
              onClick={() => setShowTransfer(true)}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {t.transferOwnershipButton}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowInvite(true)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t.inviteMemberButton}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      ) : (
        <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          {members.map(m => {
            const canEditRole = isAdmin && m.id !== user.id && m.role !== 'owner'
            const canEditLink = isAdmin
            // Employees still available to link: the one this user already
            // points at (so the current selection renders even if it'd
            // otherwise be filtered) plus any unlinked employees.
            const linkedTo = m.employee_id ?? null
            const takenByOthers = new Set(members.filter(other => other.id !== m.id && other.employee_id).map(other => other.employee_id as string))
            const availableEmployees = employees.filter(e => e.id === linkedTo || !takenByOthers.has(e.id))
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="h-8 w-8 shrink-0 overflow-hidden rounded-full"
                  style={{ background: m.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(m.id) }}
                >
                  {m.photo_url && (
                    <img src={m.photo_url} alt={m.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                      {m.name}
                    </span>
                    {m.id === user.id && (
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>· {t.youLabel}</span>
                    )}
                  </div>
                  <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{m.email}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    <span>{t.linkedEmployeeLabel}</span>
                    {canEditLink ? (
                      <select
                        value={linkedTo ?? ''}
                        onChange={e => handleLinkEmployee(m.id, e.target.value || null)}
                        className="min-w-0 max-w-[14rem] truncate rounded-md border px-1.5 py-0.5 text-xs"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                        aria-label={t.linkedEmployeeLabel}
                      >
                        <option value="">{t.linkedEmployeeNone}</option>
                        {availableEmployees.map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {linkedTo ? (employees.find(e => e.id === linkedTo)?.name ?? '—') : t.linkedEmployeeNone}
                      </span>
                    )}
                  </div>
                </div>
                {canEditRole ? (
                  /* The role pill is a real <select> styled as a pill — we
                     add an explicit chevron so it reads as clickable instead
                     of as a static label. appearance-none strips the native
                     dropdown arrow that some browsers render outside the
                     rounded-full shape. */
                  <div className="relative shrink-0">
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.id, e.target.value as 'admin' | 'hr' | 'member')}
                      className="cursor-pointer appearance-none rounded-full border py-0.5 pl-2 pr-6 text-xs font-medium"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                      aria-label={t.changeRole}
                    >
                      <option value="admin">{t.adminRole}</option>
                      <option value="hr">{t.hrRole}</option>
                      <option value="member">{t.memberRole}</option>
                    </select>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                ) : (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                  >
                    {roleLabel(m.role, t)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            {t.pendingInvitesTitle}
          </h3>
          <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" style={{ color: 'var(--color-text)' }}>{inv.email}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    <span
                      className="inline-flex rounded-full px-1.5 py-0.5 font-medium"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', color: 'var(--color-warning)' }}
                    >
                      {t.invitePendingLabel}
                    </span>
                    <span>{t.inviteExpiresOn} {new Date(inv.expires_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {isAdmin && <CopyInviteLink inv={inv} t={t} />}
                {isAdmin && (
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    className="text-xs"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    {t.revokeInvite}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteMemberModal
          user={user}
          t={t}
          existingInvites={invites}
          onClose={() => setShowInvite(false)}
          onCreated={() => { loadData() }}
        />
      )}

      {showTransfer && (
        <TransferOwnershipModal
          t={t}
          // Eligible targets: any member of this org who isn't the current
          // owner and isn't the caller themselves. The RPC re-checks but
          // a tidy picker is a better UX than letting them pick anyone.
          candidates={members.filter(m => m.id !== user.id && m.role !== 'owner')}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => {
            setShowTransfer(false)
            // Full reload: the caller's own role flipped to admin, which
            // changes what the Settings page renders (and what they can
            // do everywhere else). Easier than threading the role change
            // through state.
            window.location.reload()
          }}
        />
      )}
    </section>
  )
}

function roleLabel(role: string, t: Translations) {
  if (role === 'owner') return t.ownerRole
  if (role === 'admin') return t.adminRole
  if (role === 'hr') return t.hrRole
  return t.memberRole
}

function CopyInviteLink({ inv, t }: { inv: OrgInvitation; t: Translations }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/invite/${inv.token}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors"
      style={{
        borderColor: 'var(--color-border)',
        color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)',
      }}
    >
      {copied ? t.inviteLinkCopied : t.copyInviteLink}
    </button>
  )
}

function InviteMemberModal({ user, t, existingInvites, onClose, onCreated }: {
  user: User
  t: Translations
  existingInvites: OrgInvitation[]
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'hr' | 'admin'>('member')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdInvite, setCreatedInvite] = useState<OrgInvitation | null>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t.invalidEmail)
      return
    }

    if (existingInvites.some(i => i.email.toLowerCase() === trimmed)) {
      setError(t.inviteAlreadyExists)
      return
    }

    setCreating(true)
    const token = generateInviteToken()
    const { data, error: insertError } = await supabase
      .from('org_invitations')
      .insert({
        org_id: user.org_id,
        email: trimmed,
        token,
        role,
        invited_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setCreating(false)
      return
    }

    setCreatedInvite(data)
    setCreating(false)
    onCreated()
  }

  const inviteUrl = createdInvite ? `${window.location.origin}/invite/${createdInvite.token}` : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {createdInvite ? (
          <>
            <h2 className="mb-1 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.inviteCreatedTitle}</h2>
            <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t.inviteCreatedDesc}
            </p>
            <div className="mb-4 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={e => e.target.select()}
                className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
              />
              <CopyInviteLink inv={createdInvite} t={t} />
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t.done}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="mb-1 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.inviteMemberTitle}</h2>
            <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.inviteMemberDesc}</p>

            {error && (
              <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.inviteEmailLabel}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t.inviteEmailPlaceholder}
                required
                autoFocus
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>

            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.inviteRoleLabel}</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'member' | 'hr' | 'admin')}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="member">{t.memberRole}</option>
                <option value="hr">{t.hrRole}</option>
                <option value="admin">{t.adminRole}</option>
              </select>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                {role === 'admin' ? t.inviteRoleAdminDesc : role === 'hr' ? t.inviteRoleHrDesc : t.inviteRoleMemberDesc}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={creating || !email.trim()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {creating ? t.creatingInvite : t.sendInvite}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Transfer ownership ─────────────────────────────────
//
// One-shot atomic role swap via the transfer_ownership RPC. The current
// owner picks another member of the org; on confirm, both users get
// re-roled in a single transaction (caller → admin, target → owner).
// The RPC re-validates everything server-side — this modal exists to
// give the action a deliberately heavy UX so it can't be triggered
// accidentally:
//   - Distinct entry point (not the role dropdown that handles
//     admin↔hr↔member changes)
//   - Strong warning copy
//   - Typed confirmation (the user must type the target's name to
//     enable the confirm button) — eliminates "I just clicked through"
//     misfires that a single confirm() dialog can't catch

function TransferOwnershipModal({ t, candidates, onClose, onTransferred }: {
  t: Translations
  candidates: User[]
  onClose: () => void
  onTransferred: () => void
}) {
  const [targetId, setTargetId] = useState<string>('')
  const [typedName, setTypedName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const target = candidates.find(c => c.id === targetId) ?? null
  // The confirm gate matches the target's name case-insensitively + trims.
  // Strict enough to defeat muscle-memory clicks; lax enough to not reject
  // a trailing space or a "vs the user actually typed wrong".
  const confirmValid = !!target && typedName.trim().toLowerCase() === target.name.trim().toLowerCase()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!target || !confirmValid || submitting) return
    setSubmitting(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('transfer_ownership', { p_target_user_id: target.id })
    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }
    onTransferred()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-1 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.transferOwnershipTitle}</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.transferOwnershipDesc}
        </p>

        {candidates.length === 0 ? (
          <div className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {t.transferOwnershipNoCandidates}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.transferOwnershipTargetLabel}
              </label>
              <select
                value={targetId}
                onChange={e => { setTargetId(e.target.value); setTypedName('') }}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              >
                <option value="">{t.transferOwnershipTargetPlaceholder}</option>
                {candidates.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border px-3 py-3 text-sm" style={{ borderColor: 'var(--color-warning)', backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)' }}>
              {t.transferOwnershipWarning}
            </div>

            {target && (
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.transferOwnershipTypedConfirmLabel(target.name)}
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                  placeholder={target.name}
                  autoComplete="off"
                />
              </div>
            )}

            {error && (
              <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={!confirmValid || submitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-danger)' }}
              >
                {submitting ? t.transferOwnershipSubmitting : t.transferOwnershipConfirmButton}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}

// ─── Integrations tab ───────────────────────────────────

function IntegrationsTab({ user, t }: { user: User; t: Translations }) {
  const { canWrite: billingCanWrite } = useBilling()
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [reviewMode, setReviewMode] = useState<boolean | null>(null)
  const [updatingReviewMode, setUpdatingReviewMode] = useState(false)
  const [activeDialog, setActiveDialog] = useState<'fireflies' | 'asana' | null>(null)
  const [busyProvider, setBusyProvider] = useState<string | null>(null)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [rows, orgResult] = await Promise.all([
      listIntegrations(user.org_id).catch(() => []),
      supabase.from('organizations').select('review_mode').eq('id', user.org_id).single(),
    ])
    setIntegrations(rows)
    if (orgResult.data) setReviewMode(orgResult.data.review_mode)
  }

  async function handleToggleReviewMode(next: boolean) {
    setUpdatingReviewMode(true)
    const previous = reviewMode
    setReviewMode(next)
    const { error } = await supabase.from('organizations').update({ review_mode: next }).eq('id', user.org_id)
    if (error) { setReviewMode(previous); alert(error.message) }
    setUpdatingReviewMode(false)
  }

  async function handleDisconnect(provider: 'fireflies' | 'asana') {
    if (!confirm(t.integrationDisconnectConfirm)) return
    setBusyProvider(provider)
    try {
      await deleteIntegration(provider)
      await loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyProvider(null)
    }
  }

  const fireflies = integrations.find(i => i.provider === 'fireflies') ?? null
  const asana = integrations.find(i => i.provider === 'asana') ?? null

  return (
    <div className="space-y-10">
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.integrationsIntro}</p>

      {/* Review mode — controls whether API-submitted updates need approval */}
      <section>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.reviewModeSectionTitle}</h2>
        <div
          className="flex items-start justify-between gap-4 rounded-xl border p-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.reviewModeLabel}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.reviewModeDesc}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reviewMode === true}
            onClick={() => reviewMode !== null && handleToggleReviewMode(!reviewMode)}
            disabled={reviewMode === null || updatingReviewMode}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
            style={{
              backgroundColor: reviewMode ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
            }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: reviewMode ? '22px' : '2px' }}
            />
          </button>
        </div>
      </section>

      {/* Third-party integrations */}
      <section>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.integrationsSectionTitle}
        </h2>
        <div className="space-y-3">
          <IntegrationCard
            title={t.firefliesTitle}
            description={t.firefliesDesc}
            row={fireflies}
            onConnect={billingCanWrite ? () => setActiveDialog('fireflies') : () => {}}
            onDisconnect={billingCanWrite ? () => handleDisconnect('fireflies') : () => {}}
            onVerified={loadData}
            busy={busyProvider === 'fireflies' || !billingCanWrite}
            t={t}
          />
          <IntegrationCard
            title={t.asanaTitle}
            description={t.asanaDesc}
            row={asana}
            onConnect={billingCanWrite ? () => setActiveDialog('asana') : () => {}}
            onDisconnect={billingCanWrite ? () => handleDisconnect('asana') : () => {}}
            onVerified={loadData}
            busy={busyProvider === 'asana' || !billingCanWrite}
            t={t}
          />
        </div>
      </section>

      {activeDialog === 'fireflies' && (
        <ConnectFirefliesDialog
          orgId={user.org_id}
          existing={fireflies}
          onClose={() => setActiveDialog(null)}
          onSaved={async () => { setActiveDialog(null); await loadData() }}
          t={t}
        />
      )}
      {activeDialog === 'asana' && (
        <ConnectAsanaDialog
          existing={asana}
          onClose={() => setActiveDialog(null)}
          onSaved={async () => { setActiveDialog(null); await loadData() }}
          t={t}
        />
      )}
    </div>
  )
}

// ─── Credits tab ────────────────────────────────────────
// Master switch for the Credits feature + the credits_divisor config that
// used to live on the Organization tab.

function CreditsTab({ user, t }: { user: User; t: Translations }) {
  const [enabled, setEnabled] = useState(true)
  const [creditsDivisor, setCreditsDivisor] = useState<string>('1000')
  const [savedDivisor, setSavedDivisor] = useState<number>(1000)
  const [maxPerAward, setMaxPerAward] = useState<string>('')
  const [savedMaxPerAward, setSavedMaxPerAward] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingDivisor, setSavingDivisor] = useState(false)
  const [savingMax, setSavingMax] = useState(false)

  useEffect(() => { load() }, [user.org_id])

  async function load() {
    const { data } = await supabase
      .from('organizations')
      .select('credits_enabled, credits_divisor, max_credit_per_award')
      .eq('id', user.org_id)
      .single()
    if (data) {
      setEnabled(data.credits_enabled ?? true)
      setSavedDivisor(data.credits_divisor ?? 1000)
      setCreditsDivisor(String(data.credits_divisor ?? 1000))
      setSavedMaxPerAward(data.max_credit_per_award ?? null)
      setMaxPerAward(data.max_credit_per_award != null ? String(data.max_credit_per_award) : '')
    }
    setLoading(false)
  }

  async function toggleEnabled(next: boolean) {
    setEnabled(next)
    const { error } = await supabase.from('organizations').update({ credits_enabled: next }).eq('id', user.org_id)
    if (error) {
      setEnabled(!next)
      alert(error.message)
    }
  }

  const parsedDivisor = Number(creditsDivisor)
  const divisorValid = Number.isFinite(parsedDivisor) && parsedDivisor > 0 && Number.isInteger(parsedDivisor)
  const divisorDirty = divisorValid && parsedDivisor !== savedDivisor

  async function saveDivisor() {
    if (!divisorDirty) return
    setSavingDivisor(true)
    const { error } = await supabase
      .from('organizations')
      .update({ credits_divisor: parsedDivisor })
      .eq('id', user.org_id)
    if (!error) setSavedDivisor(parsedDivisor)
    else alert(error.message)
    setSavingDivisor(false)
  }

  // Max per award: blank string → null (no cap). Otherwise must be a positive int.
  const trimmedMax = maxPerAward.trim()
  const parsedMax = trimmedMax === '' ? null : Number(trimmedMax)
  const maxValid = trimmedMax === '' || (Number.isFinite(parsedMax) && Number.isInteger(parsedMax) && (parsedMax as number) > 0)
  const maxDirty = maxValid && parsedMax !== savedMaxPerAward

  async function saveMax() {
    if (!maxDirty) return
    setSavingMax(true)
    const { error } = await supabase
      .from('organizations')
      .update({ max_credit_per_award: parsedMax })
      .eq('id', user.org_id)
    if (!error) setSavedMaxPerAward(parsedMax)
    else alert(error.message)
    setSavingMax(false)
  }

  if (loading) return <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>

  return (
    <div className="space-y-5">
      <InfoBanner
        storageKey="flodok.banner.credits.dismissed"
        title={t.bannerCreditsTitle}
        body={t.bannerCreditsBody}
        icon={creditsIcon}
        accent="#3b82f6"
      />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.creditsEnabledLabel}</p>
        <Toggle checked={enabled} onChange={toggleEnabled} />
      </div>
      <p className="-mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.creditsEnabledHelp}</p>

      <div style={{ opacity: enabled ? 1 : 0.5 }}>
        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.creditsDivisorLabel}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={creditsDivisor}
            onChange={e => setCreditsDivisor(e.target.value)}
            onBlur={saveDivisor}
            disabled={!enabled}
            className="rounded-lg border px-3 py-2 text-sm md:w-48"
            style={inputStyle}
          />
          {savingDivisor && <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>…</span>}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.creditsDivisorHelp}</p>
      </div>

      <div style={{ opacity: enabled ? 1 : 0.5 }}>
        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.maxCreditPerAwardLabel}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={maxPerAward}
            onChange={e => setMaxPerAward(e.target.value)}
            onBlur={saveMax}
            disabled={!enabled}
            placeholder={t.noCapPlaceholder}
            className="rounded-lg border px-3 py-2 text-sm md:w-48"
            style={inputStyle}
          />
          {savingMax && <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>…</span>}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.maxCreditPerAwardHelp}</p>
      </div>
    </div>
  )
}

// ─── Bonuses tab ────────────────────────────────────────

function BonusesTab({ user, t }: { user: User; t: Translations }) {
  const [enabled, setEnabled] = useState(true)
  const [maxBonus, setMaxBonus] = useState<string>('')
  const [savedMaxBonus, setSavedMaxBonus] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingMax, setSavingMax] = useState(false)

  useEffect(() => { load() }, [user.org_id])

  async function load() {
    const { data } = await supabase
      .from('organizations')
      .select('bonuses_enabled, max_bonus_idr')
      .eq('id', user.org_id)
      .single()
    if (data) {
      setEnabled(data.bonuses_enabled ?? true)
      setSavedMaxBonus(data.max_bonus_idr ?? null)
      setMaxBonus(data.max_bonus_idr != null ? String(data.max_bonus_idr) : '')
    }
    setLoading(false)
  }

  async function toggleEnabled(next: boolean) {
    setEnabled(next)
    const { error } = await supabase.from('organizations').update({ bonuses_enabled: next }).eq('id', user.org_id)
    if (error) {
      setEnabled(!next)
      alert(error.message)
    }
  }

  const trimmedMax = maxBonus.trim()
  const parsedMax = trimmedMax === '' ? null : Number(trimmedMax)
  const maxValid = trimmedMax === '' || (Number.isFinite(parsedMax) && Number.isInteger(parsedMax) && (parsedMax as number) > 0)
  const maxDirty = maxValid && parsedMax !== savedMaxBonus

  async function saveMax() {
    if (!maxDirty) return
    setSavingMax(true)
    const { error } = await supabase
      .from('organizations')
      .update({ max_bonus_idr: parsedMax })
      .eq('id', user.org_id)
    if (!error) setSavedMaxBonus(parsedMax)
    else alert(error.message)
    setSavingMax(false)
  }

  if (loading) return <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>

  return (
    <div className="space-y-5">
      <InfoBanner
        storageKey="flodok.banner.bonuses.dismissed"
        title={t.bannerBonusesTitle}
        body={t.bannerBonusesBody}
        icon={bonusesIcon}
        accent="#10b981"
      />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.bonusesEnabledLabel}</p>
        <Toggle checked={enabled} onChange={toggleEnabled} />
      </div>
      <p className="-mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.bonusesEnabledHelp}</p>

      <div style={{ opacity: enabled ? 1 : 0.5 }}>
        <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.maxBonusIdrLabel}</label>
        <div className="flex items-center gap-2">
          <div className="relative md:w-56">
            <input
              type="text"
              inputMode="numeric"
              value={formatIdrDigits(maxBonus)}
              onChange={e => setMaxBonus(e.target.value.replace(/\D/g, ''))}
              onBlur={saveMax}
              disabled={!enabled}
              placeholder={t.noCapPlaceholder}
              className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
              style={inputStyle}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
          </div>
          {savingMax && <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>…</span>}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.maxBonusIdrHelp}</p>
      </div>
    </div>
  )
}


// ─── Achievements tab ───────────────────────────────────

function AchievementsTab({ user, t }: { user: User; t: Translations }) {
  type Def = {
    id: string
    name: string
    description: string | null
    icon: string | null
    trigger_type: 'manual' | 'auto'
    trigger_rule: Record<string, unknown> | null
    is_featured: boolean
    is_active: boolean
  }
  type Group = 'tenure' | 'compensation' | 'leaderboard' | 'manual'

  // Group + within-group sort. Tenure: day → week → month → year (chronological).
  // Leaderboard: Podium → Number One → Reigning Champion (broadest rank first).
  // Manual + Compensation: stable by name.
  function classify(def: Def): { group: Group; sortKey: number } {
    if (def.trigger_type === 'manual') return { group: 'manual', sortKey: 0 }
    const rule = def.trigger_rule || {}
    const ruleType = rule.type as string | undefined
    if (ruleType === 'tenure_calendar') {
      const unit = (rule.unit as string) || 'day'
      const amount = (rule.amount as number) || 0
      const unitRank = unit === 'day' ? 0 : unit === 'month' ? 1 : 2
      return { group: 'tenure', sortKey: unitRank * 1000 + amount }
    }
    if (ruleType === 'first_event') return { group: 'compensation', sortKey: 0 }
    if (ruleType === 'leaderboard_rank') {
      const maxRank = (rule.max_rank as number) || 0
      const consecutive = (rule.consecutive_periods as number) || 1
      // Lower max_rank (#1) is "harder" → comes after Podium (max_rank 3).
      // Within same max_rank, more consecutive periods = harder → comes later.
      return { group: 'leaderboard', sortKey: -maxRank * 100 + consecutive }
    }
    return { group: 'manual', sortKey: 999 }
  }

  const GROUP_ORDER: Group[] = ['tenure', 'compensation', 'leaderboard', 'manual']
  const GROUP_LABEL: Record<Group, string> = {
    tenure: t.badgeGroupTenure,
    compensation: t.badgeGroupCompensation,
    leaderboard: t.badgeGroupLeaderboard,
    manual: t.badgeGroupManual,
  }
  const [defs, setDefs] = useState<Def[]>([])
  const [orgBadgesEnabled, setOrgBadgesEnabled] = useState<boolean>(true)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formIcon, setFormIcon] = useState('🏅')
  const [formTriggerType, setFormTriggerType] = useState<'manual' | 'auto'>('manual')
  const [formFeatured, setFormFeatured] = useState(false)
  const [formActive, setFormActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    setLoading(true)
    const [defsRes, orgRes] = await Promise.all([
      supabase
        .from('achievement_definitions')
        .select('id, name, description, icon, trigger_type, trigger_rule, is_featured, is_active')
        .eq('org_id', user.org_id),
      supabase
        .from('organizations')
        .select('badges_enabled')
        .eq('id', user.org_id)
        .single(),
    ])
    setDefs((defsRes.data || []) as Def[])
    setOrgBadgesEnabled(orgRes.data?.badges_enabled ?? true)
    setLoading(false)
  }

  // Build grouped + sorted view of definitions
  const grouped = (() => {
    const buckets: Record<Group, Def[]> = { tenure: [], compensation: [], leaderboard: [], manual: [] }
    const sortKeys = new Map<string, number>()
    for (const def of defs) {
      const { group, sortKey } = classify(def)
      buckets[group].push(def)
      sortKeys.set(def.id, sortKey)
    }
    for (const group of GROUP_ORDER) {
      buckets[group].sort((a, b) => {
        const diff = (sortKeys.get(a.id) ?? 0) - (sortKeys.get(b.id) ?? 0)
        return diff !== 0 ? diff : a.name.localeCompare(b.name)
      })
    }
    return buckets
  })()

  async function toggleOrgBadgesEnabled(next: boolean) {
    setOrgBadgesEnabled(next)
    const { error: updateError } = await supabase
      .from('organizations')
      .update({ badges_enabled: next })
      .eq('id', user.org_id)
    if (updateError) {
      setOrgBadgesEnabled(!next)
      alert(updateError.message)
    }
  }

  async function toggleDefActive(def: Def, next: boolean) {
    setDefs(prev => prev.map(d => (d.id === def.id ? { ...d, is_active: next } : d)))
    const { error: updateError } = await supabase
      .from('achievement_definitions')
      .update({ is_active: next })
      .eq('id', def.id)
    if (updateError) {
      setDefs(prev => prev.map(d => (d.id === def.id ? { ...d, is_active: !next } : d)))
      alert(updateError.message)
    }
  }

  function resetForm() {
    setEditingId(null)
    setFormName('')
    setFormDescription('')
    setFormIcon('🏅')
    setFormTriggerType('manual')
    setFormFeatured(false)
    setFormActive(true)
    setError('')
  }

  function openNew() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(def: Def) {
    setEditingId(def.id)
    setFormName(def.name)
    setFormDescription(def.description || '')
    setFormIcon(def.icon || '🏅')
    setFormTriggerType(def.trigger_type)
    setFormFeatured(def.is_featured)
    setFormActive(def.is_active)
    setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = formName.trim()
    if (!name) { setError(t.titleRequired); return }
    setSaving(true)
    setError('')
    const basePayload = {
      name,
      description: formDescription.trim() || null,
      icon: formIcon.trim() || null,
      trigger_type: formTriggerType,
      is_featured: formFeatured,
      is_active: formActive,
    }
    const { error: dbError } = editingId
      ? await supabase.from('achievement_definitions').update(basePayload).eq('id', editingId)
      : await supabase.from('achievement_definitions').insert({
          org_id: user.org_id,
          ...basePayload,
          trigger_rule: formTriggerType === 'auto' ? {} : null,
        })
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    setShowForm(false)
    resetForm()
    await loadData()
  }

  return (
    <div className="space-y-5">
      <InfoBanner
        storageKey="flodok.banner.badges.dismissed"
        title={t.bannerBadgesTitle}
        body={t.bannerBadgesBody}
        icon={badgesIcon}
        accent="#f59e0b"
      />

      {/* Org-level master switch */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.badgesEnabledLabel}</p>
        <Toggle checked={orgBadgesEnabled} onChange={toggleOrgBadgesEnabled} />
      </div>
      <p className="-mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.badgesEnabledHelp}</p>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.achievementDefsTitle}</h2>
        <button
          type="button"
          onClick={openNew}
          disabled={!orgBadgesEnabled}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.newAchievement}
        </button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      ) : defs.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noAchievementsYet}</p>
      ) : (
        <div className="space-y-6" style={{ opacity: orgBadgesEnabled ? 1 : 0.5 }}>
          {GROUP_ORDER.filter(g => grouped[g].length > 0).map(group => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                {GROUP_LABEL[group]}
              </h3>
              <ul className="space-y-2">
                {grouped[group].map(def => (
                  <li
                    key={def.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                    style={{ borderColor: 'var(--color-border)', opacity: def.is_active ? 1 : 0.5 }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BadgeGlyph icon={def.icon} size={26} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                          {def.name}
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                            {def.trigger_type === 'manual' ? 'manual' : 'auto'}
                          </span>
                          {def.is_featured && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                              {t.badgeFeaturedPill}
                            </span>
                          )}
                          {!def.is_active && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                              {t.badgeDisabledLabel}
                            </span>
                          )}
                        </p>
                        {def.description && (
                          <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{def.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Toggle
                        checked={def.is_active}
                        onChange={next => toggleDefActive(def, next)}
                        disabled={!orgBadgesEnabled}
                      />
                      <button
                        type="button"
                        onClick={() => openEdit(def)}
                        disabled={!orgBadgesEnabled}
                        className="rounded-lg px-2 py-1 text-xs disabled:opacity-50"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {t.edit}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {showForm && (() => {
        const coreLocked = editingId !== null && formTriggerType === 'auto' && !user.is_platform_admin
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-md rounded-xl border p-5 shadow-lg"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {editingId ? t.edit : t.newAchievement}
            </h3>
            {coreLocked && (
              <p className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-bg-secondary)' }}>
                {t.autoBadgeLockedHint}
              </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementName}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus={!coreLocked}
                  disabled={coreLocked}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementIcon}</label>
                <BadgePicker value={formIcon} onChange={setFormIcon} disabled={coreLocked} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementDescription}</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={2}
                  disabled={coreLocked}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementTriggerType}</label>
                <select
                  value={formTriggerType}
                  onChange={e => setFormTriggerType(e.target.value as 'manual' | 'auto')}
                  disabled
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                >
                  <option value="manual">{t.triggerManual}</option>
                  <option value="auto">{t.triggerAuto}</option>
                </select>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {editingId
                    ? 'Trigger type is locked once created.'
                    : 'Custom achievements are awarded manually. Automated milestones (tenure, leaderboard, etc.) are pre-configured for every organization.'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <input type="checkbox" checked={formFeatured} onChange={e => setFormFeatured(e.target.checked)} />
                  {t.isFeaturedLabel}
                </label>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                  {t.isActiveLabel}
                </label>
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-4 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {saving ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

// ─── Billing tab ───────────────────────────────────────

function BillingTab({ user, t }: { user: User; t: Translations }) {
  const { isAdmin } = useRole(user)
  const [billing, setBilling] = useState<OrgBilling | null>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [employeeCount, setEmployeeCount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'portal' | 'portal_payment' | 'portal_cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [b, orgRow, { count }] = await Promise.all([
          loadOrgBilling(user.org_id),
          supabase.from('organizations').select('name').eq('id', user.org_id).single(),
          supabase
            .from('employees')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', user.org_id),
        ])
        if (cancelled) return
        setBilling(b)
        setOrgName(orgRow.data?.name ?? '')
        setEmployeeCount(count ?? 0)
        // Fetch the saved card lazily — only relevant for Pro orgs, and we
        // don't want to block the rest of the page on the Stripe round trip.
        if (b && isProOrg(b)) {
          getPaymentMethod()
            .then(pm => { if (!cancelled) setPaymentMethod(pm) })
            .catch(err => console.error('payment-method fetch failed:', err))
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user.org_id, refreshKey])

  async function handlePortal(flow?: 'payment_method_update' | 'subscription_cancel') {
    const busyKey = flow === 'payment_method_update'
      ? 'portal_payment'
      : flow === 'subscription_cancel'
        ? 'portal_cancel'
        : 'portal'
    setBusy(busyKey)
    setError(null)
    try {
      const url = await openPortal({
        returnUrl: `${window.location.origin}/settings?tab=billing`,
        flow,
      })
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.billingLoading}</div>
  }
  if (!billing) {
    return <div className="p-10 text-center text-sm" style={{ color: 'var(--color-error)' }}>{error ?? t.billingLoadError}</div>
  }

  const onPro = isProOrg(billing)
  // For Pro: use the actual Stripe subscription quantity (what they're being
  // billed). For Free: compute the floor (employees or PRO_MIN_SEATS) so the
  // "what Pro would cost" estimate is meaningful.
  const billableSeats = onPro && billing.subscription_quantity != null
    ? billing.subscription_quantity
    : Math.max(employeeCount, PRO_MIN_SEATS)
  const monthlyEstimate = calculateProMonthlyIdr(billableSeats)
  const periodEndDate = billing.current_period_end
    ? new Date(billing.current_period_end).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <section className="space-y-6">
      {/* PLAN */}
      <BillingSection title={t.billingPlanSection}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {onPro
                  ? `${t.billingPlanPro} · ${formatIdr(monthlyEstimate)} / month`
                  : t.billingPlanFreeHeading}
              </span>
              {onPro && billing.subscription_status && billing.subscription_status !== 'active' && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--color-warning-bg, #fef3c7)', color: 'var(--color-warning, #92400e)' }}
                >
                  {billing.subscription_status}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {onPro
                ? t.billingProDesc.replace('{count}', String(employeeCount)).replace('{billable}', String(billableSeats))
                : t.billingFreeDescShort.replace('{limit}', String(FREE_EMPLOYEE_LIMIT))}
            </p>
            {onPro && periodEndDate && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {billing.cancel_at_period_end ? t.billingProAccessUntil : t.billingNextInvoice} {periodEndDate}
              </p>
            )}

            {/* Employee usage bar — denominator is the Free cap for Free orgs,
                or the paid Stripe quantity for Pro orgs. On Free, hitting the
                cap turns the bar red (hard limit). On Pro, the cap is soft —
                adding more auto-bumps the subscription quantity — so we just
                show the bar at full without the red warning. */}
            <div className="mt-4 max-w-md">
              <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                <span>{t.billingEmployees}</span>
                <span>{employeeCount} / {onPro ? billableSeats : FREE_EMPLOYEE_LIMIT}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (employeeCount / (onPro ? billableSeats : FREE_EMPLOYEE_LIMIT)) * 100)}%`,
                    backgroundColor:
                      !onPro && employeeCount >= FREE_EMPLOYEE_LIMIT ? '#ef4444' : 'var(--color-primary)',
                  }}
                />
              </div>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => (onPro ? setShowAdjust(true) : setShowUpgrade(true))}
              className="shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                borderColor: onPro ? 'var(--color-border)' : 'transparent',
                color: onPro ? 'var(--color-text)' : 'white',
                backgroundColor: onPro ? 'var(--color-bg)' : 'var(--color-primary)',
              }}
            >
              {onPro ? t.billingAdjustButton : t.billingUpgradeButton}
            </button>
          )}
        </div>

        {billing.cancel_at_period_end && (
          <p className="mt-4 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
            {t.billingCancelScheduledNote}
          </p>
        )}
      </BillingSection>

      {/* BILLING INFORMATION */}
      <BillingSection title={t.billingInfoSection}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {orgName || '—'}
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {user.email}
            </div>
            {!onPro && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.billingInfoEmpty}
              </p>
            )}
          </div>
          {onPro && isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePortal()}
                disabled={busy !== null}
                className="rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
              >
                {busy === 'portal' ? t.billingRedirecting : t.billingChangeInfoButton}
              </button>
              <button
                type="button"
                onClick={() => handlePortal()}
                disabled={busy !== null}
                className="rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
              >
                {t.billingHistoryButton}
              </button>
            </div>
          )}
        </div>
      </BillingSection>

      {/* PAYMENT DETAILS */}
      <BillingSection title={t.billingPaymentSection}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-12 items-center justify-center rounded-md"
              style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              {onPro ? (
                paymentMethod ? (
                  <>
                    <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                      <span className="font-semibold">{formatCardBrand(paymentMethod.brand)}</span>
                      <span className="ml-2 font-mono tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                        •••• {paymentMethod.last4}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.billingExpires} {String(paymentMethod.exp_month).padStart(2, '0')}/{String(paymentMethod.exp_year).slice(-2)}
                    </div>
                  </>
                ) : (
                  <div className="font-mono text-sm tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>
                    •••• •••• •••• ••••
                  </div>
                )
              ) : (
                <>
                  <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {t.billingPaymentEmptyTitle}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.billingPaymentEmptyBody}
                  </div>
                </>
              )}
            </div>
          </div>
          {onPro && isAdmin && (
            <button
              type="button"
              onClick={() => handlePortal('payment_method_update')}
              disabled={busy !== null}
              className="rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
            >
              {busy === 'portal_payment' ? t.billingRedirecting : t.billingUpdatePaymentButton}
            </button>
          )}
        </div>
      </BillingSection>

      {/* DANGER ZONE (Pro only, admin only, not already cancelled) */}
      {onPro && isAdmin && !billing.cancel_at_period_end && (
        <details
          className="group rounded-xl border p-4 transition-colors"
          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.04)' }}
        >
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold" style={{ color: '#ef4444' }}>
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {t.billingDangerSection} · {t.billingDangerSubtitle}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-180">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="mt-4">
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t.billingDangerWarning}
            </p>
            <button
              type="button"
              onClick={() => handlePortal('subscription_cancel')}
              disabled={busy !== null}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#ef4444' }}
            >
              {busy === 'portal_cancel' ? t.billingRedirecting : t.billingCancelButton}
            </button>
          </div>
        </details>
      )}

      {error && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}

      {!isAdmin && (
        <p className="text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.billingAdminOnlyNote}
        </p>
      )}

      {showUpgrade && (
        <UpgradeModal
          t={t}
          initialSeats={Math.max(employeeCount, PRO_MIN_SEATS)}
          cancelReturnPath="/settings?tab=billing"
          onClose={() => setShowUpgrade(false)}
        />
      )}

      {showAdjust && (
        <UpgradeModal
          t={t}
          mode="adjust"
          initialSeats={billableSeats}
          minSeats={billableSeats}
          cancelReturnPath="/settings?tab=billing"
          onClose={() => setShowAdjust(false)}
          onAdjusted={() => setRefreshKey(k => k + 1)}
        />
      )}
    </section>
  )
}

// Pretty-print Stripe's card.brand strings ("visa", "mastercard", "amex",
// "jcb", "discover", "diners", "unionpay", "unknown"). Stripe uses lowercase
// machine names; we want title-case for display, with a couple of acronyms.
function formatCardBrand(brand: string): string {
  const acronyms: Record<string, string> = {
    amex: 'Amex',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  }
  if (acronyms[brand]) return acronyms[brand]
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function BillingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
        {title}
      </h3>
      <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        {children}
      </div>
    </div>
  )
}


// Small shared switch used inside the Badges tab. Renders a pill-style
// toggle that calls onChange(next) when clicked.
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

// Dismissable explainer banner used at the top of feature-config tabs.
// Persists dismissal in localStorage so it doesn't reappear on every visit.
function InfoBanner({
  storageKey,
  title,
  body,
  icon,
  accent = '#6366f1',
}: {
  storageKey: string
  title: string
  body: string
  icon?: React.ReactNode
  accent?: string
}) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  if (dismissed) return null

  function handleDismiss() {
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch { /* localStorage unavailable — silent */ }
    setDismissed(true)
  }

  return (
    <div
      className="relative flex gap-3 rounded-xl border p-4 pr-10"
      style={{
        borderColor: `${accent}33`,
        backgroundColor: `${accent}10`,
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18"/>
          <line x1="6" y1="18" x2="18" y2="6"/>
        </svg>
      </button>
      {icon && (
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}26`, color: accent }}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {body}
        </p>
      </div>
    </div>
  )
}

// Icons for the Credits / Bonuses / Badges callouts.
const creditsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="6" rx="8" ry="3"/>
    <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/>
    <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>
  </svg>
)

const bonusesIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/>
    <rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>
)

const badgesIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
)
