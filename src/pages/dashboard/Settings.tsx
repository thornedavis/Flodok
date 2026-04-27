import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { getAvatarGradient } from '../../lib/avatar'
import { displayBadgeIcon } from '../../lib/badgeIcon'
import { formatIdrDigits } from '../../lib/credits'
import { AvatarUpload } from '../../components/AvatarUpload'
import { PhoneInput } from '../../components/PhoneInput'
import { AddressFields, type AddressValue } from '../../components/AddressFields'
import { isValidE164 } from '../../lib/phone'
import type { Translations } from '../../lib/translations'
import type { User, Organization, OrgInvitation } from '../../types/database'
import { IntegrationCard } from '../../components/integrations/IntegrationCard'
import { ConnectFirefliesDialog } from '../../components/integrations/ConnectFirefliesDialog'
import { ConnectAsanaDialog } from '../../components/integrations/ConnectAsanaDialog'
import { listIntegrations, deleteIntegration, type IntegrationRow } from '../../lib/integrations'

type Tab = 'account' | 'organization' | 'team' | 'integrations' | 'credits' | 'bonuses' | 'achievements' | 'billing'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function todayInWIB(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = Number(parts.find(p => p.type === 'year')!.value)
  const m = Number(parts.find(p => p.type === 'month')!.value)
  const d = Number(parts.find(p => p.type === 'day')!.value)
  return new Date(y, m - 1, d)
}

function nextCloseDate(payDay: number, today: Date): Date {
  if (payDay === 0) {
    const lastOfCurrent = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    if (lastOfCurrent < today) return new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return lastOfCurrent
  }
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), payDay)
  if (thisMonth >= today) return thisMonth
  return new Date(today.getFullYear(), today.getMonth() + 1, payDay)
}

export function Settings({ user }: { user: User }) {
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')

  let tab: Tab = 'account'
  if (rawTab === 'organization' || rawTab === 'team' || rawTab === 'billing') tab = rawTab
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
        <TabButton active={tab === 'organization'} onClick={() => setTab('organization')}>{t.settingsOrganizationTab}</TabButton>
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
      {tab === 'organization' && <OrganizationTab user={user} t={t} />}
      {tab === 'team' && <TeamMembersSection user={user} t={t} />}
      {tab === 'integrations' && isAdmin && <IntegrationsTab user={user} t={t} />}
      {tab === 'credits' && isAdmin && <CreditsTab user={user} t={t} />}
      {tab === 'bonuses' && isAdmin && <BonusesTab user={user} t={t} />}
      {tab === 'achievements' && isAdmin && <AchievementsTab user={user} t={t} />}
      {tab === 'billing' && <BillingTab t={t} />}
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
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone || '')
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
  const nameDirty = name.trim() !== user.name && name.trim().length > 0
  const phoneDirty = (phone || null) !== (user.phone || null)
  const dirty = (nameDirty || phoneDirty) && phoneValid && name.trim().length > 0

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
    const { error: updateError } = await supabase
      .from('users')
      .update({ name: name.trim(), phone: phone || null })
      .eq('id', user.id)
    if (updateError) setError(updateError.message)
    else setSavedAt(Date.now())
    setSaving(false)
  }

  function handleCancel() {
    setName(user.name)
    setPhone(user.phone || '')
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

const EMPTY_ADDRESS: AddressValue = { street: '', city: '', province: '', postal_code: '', country: 'ID' }

function OrganizationTab({ user, t }: { user: User; t: Translations }) {
  const { lang } = useLang()
  const { isAdmin } = useRole(user)
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgName, setOrgName] = useState('')
  const [orgPhone, setOrgPhone] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS)
  const [payDayOfMonth, setPayDayOfMonth] = useState<string>('1')
  const [timezone, setTimezone] = useState<string>('Asia/Jakarta')
  const [displayName, setDisplayName] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const { data } = await supabase.from('organizations').select('*').eq('id', user.org_id).single()
    if (data) {
      setOrg(data)
      setOrgName(data.name)
      setOrgPhone(data.phone || '')
      setLogoUrl(data.logo_url)
      setAddress({
        street: data.address_street || '',
        city: data.address_city || '',
        province: data.address_province || '',
        postal_code: data.address_postal_code || '',
        country: data.address_country || 'ID',
      })
      setPayDayOfMonth(String(data.pay_day_of_month ?? 1))
      setTimezone(data.timezone || 'Asia/Jakarta')
      setDisplayName(data.display_name || '')
    }
  }

  async function handleLogoChange(url: string | null) {
    const previous = logoUrl
    setLogoUrl(url)
    const { data, error: updateError } = await supabase
      .from('organizations')
      .update({ logo_url: url })
      .eq('id', user.org_id)
      .select()
      .single()
    if (updateError || !data) {
      console.error('Failed to save logo_url', updateError)
      alert(updateError?.message || 'Could not save organization logo — please try again.')
      setLogoUrl(previous)
      return
    }
    setOrg(data)
  }

  const phoneValid = !orgPhone || isValidE164(orgPhone)
  const addressDirty = !!org && (
    address.street !== (org.address_street || '') ||
    address.city !== (org.address_city || '') ||
    address.province !== (org.address_province || '') ||
    address.postal_code !== (org.address_postal_code || '') ||
    address.country !== (org.address_country || 'ID')
  )
  const parsedPayDay = Number(payDayOfMonth)
  const payDayValid = Number.isFinite(parsedPayDay) && Number.isInteger(parsedPayDay) && parsedPayDay >= 0 && parsedPayDay <= 28
  const payDayDirty = !!org && payDayValid && parsedPayDay !== org.pay_day_of_month
  const timezoneDirty = !!org && timezone !== (org.timezone || 'Asia/Jakarta')
  const displayNameDirty = !!org && (displayName.trim() || null) !== (org.display_name || null)
  const dirty = !!org && (
    orgName.trim() !== org.name ||
    displayNameDirty ||
    (orgPhone || null) !== (org.phone || null) ||
    addressDirty ||
    payDayDirty ||
    timezoneDirty
  ) && orgName.trim().length > 0 && phoneValid && payDayValid

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    const { data } = await supabase.from('organizations').update({
      name: orgName.trim(),
      phone: orgPhone || null,
      address_street: address.street.trim() || null,
      address_city: address.city.trim() || null,
      address_province: address.province.trim() || null,
      address_postal_code: address.postal_code.trim() || null,
      address_country: address.country,
      pay_day_of_month: parsedPayDay,
      timezone,
      display_name: displayName.trim() || null,
    }).eq('id', user.org_id).select().single()
    if (data) setOrg(data)
    setSaving(false)
  }

  function handleCancelOrg() {
    if (!org) return
    setOrgName(org.name)
    setOrgPhone(org.phone || '')
    setAddress({
      street: org.address_street || '',
      city: org.address_city || '',
      province: org.address_province || '',
      postal_code: org.address_postal_code || '',
      country: org.address_country || 'ID',
    })
    setPayDayOfMonth(String(org.pay_day_of_month ?? 1))
    setTimezone(org.timezone || 'Asia/Jakarta')
    setDisplayName(org.display_name || '')
  }

  if (!org) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div className="space-y-10">
      {/* Org details */}
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.organizationSection}</h2>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelOrg}
                disabled={saving || !dirty}
                className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                form="org-edit-form"
                disabled={saving || !dirty}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          )}
        </div>
        {!isAdmin && (
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.adminOnlyHint}</p>
        )}
        <form id="org-edit-form" onSubmit={handleSaveOrg} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationLogoLabel}</label>
            <AvatarUpload
              id={user.org_id}
              storagePrefix="org"
              photoUrl={logoUrl}
              label={orgName || org?.name || ''}
              disabled={!isAdmin}
              onChange={handleLogoChange}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationLegalName}</label>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                required
                readOnly={!isAdmin}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={isAdmin ? inputStyle : { ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.organizationLegalNameHelp}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationDisplayName}</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={orgName}
                readOnly={!isAdmin}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={isAdmin ? inputStyle : { ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.organizationDisplayNameHelp}</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationPhoneLabel}</label>
            {isAdmin ? (
              <PhoneInput value={orgPhone} onChange={setOrgPhone} defaultCountryCode={org?.default_country_code} />
            ) : (
              <input
                type="text"
                value={orgPhone}
                readOnly
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
              />
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationAddressLabel}</label>
            <AddressFields value={address} onChange={setAddress} disabled={!isAdmin} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.payDayLabel}</label>
            <select
              value={payDayOfMonth}
              onChange={e => setPayDayOfMonth(e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border px-3 py-2 text-sm md:w-48"
              style={isAdmin ? inputStyle : { ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                <option key={day} value={String(day)}>
                  {lang === 'id' ? `Tanggal ${day}` : ordinal(day)}
                </option>
              ))}
              <option value="0">{t.payDayOptionLast}</option>
            </select>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.payDayHelp}</p>
            {payDayValid && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t.payDayPreview.replace(
                  '{date}',
                  new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(nextCloseDate(parsedPayDay, todayInWIB())),
                )}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.timezoneLabel}</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border px-3 py-2 text-sm md:w-96"
              style={isAdmin ? inputStyle : { ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            >
              <option value="Asia/Jakarta">{t.timezoneWib}</option>
              <option value="Asia/Makassar">{t.timezoneWita}</option>
              <option value="Asia/Jayapura">{t.timezoneWit}</option>
            </select>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.timezoneHelp}</p>
          </div>

        </form>
      </section>
    </div>
  )
}

// ─── Team members + invites ─────────────────────────────

function generateInviteToken() {
  const array = new Uint8Array(24)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

function TeamMembersSection({ user, t }: { user: User; t: Translations }) {
  const { isAdmin } = useRole(user)
  const [members, setMembers] = useState<User[]>([])
  const [invites, setInvites] = useState<OrgInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [usersResult, invitesResult] = await Promise.all([
      supabase.from('users').select('*').eq('org_id', user.org_id).order('created_at'),
      supabase.from('org_invitations').select('*').eq('org_id', user.org_id).eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    setMembers(usersResult.data || [])
    setInvites(invitesResult.data || [])
    setLoading(false)
  }

  async function handleRevoke(id: string) {
    if (!confirm(t.revokeInviteConfirm)) return
    await supabase.from('org_invitations').update({ status: 'revoked' }).eq('id', id)
    loadData()
  }

  async function handleRoleChange(targetId: string, newRole: 'admin' | 'manager') {
    const { error } = await supabase.rpc('admin_update_user_role', {
      target_user_id: targetId,
      new_role: newRole,
    })
    if (error) { alert(error.message); return }
    loadData()
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.teamMembersSectionTitle}</h2>
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

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      ) : (
        <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          {members.map(m => {
            const canEditRole = isAdmin && m.id !== user.id && m.role !== 'owner'
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
                </div>
                {canEditRole ? (
                  <select
                    value={m.role}
                    onChange={e => handleRoleChange(m.id, e.target.value as 'admin' | 'manager')}
                    className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                    aria-label={t.changeRole}
                  >
                    <option value="admin">{t.adminRole}</option>
                    <option value="manager">{t.memberRole}</option>
                  </select>
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
    </section>
  )
}

function roleLabel(role: string, t: Translations) {
  if (role === 'owner') return t.ownerRole
  if (role === 'admin') return t.adminRole
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
  const [role, setRole] = useState<'manager' | 'admin'>('manager')
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
                onChange={e => setRole(e.target.value as 'manager' | 'admin')}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="manager">{t.memberRole}</option>
                <option value="admin">{t.adminRole}</option>
              </select>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                {role === 'admin' ? t.inviteRoleAdminDesc : t.inviteRoleMemberDesc}
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

// ─── Integrations tab ───────────────────────────────────

function IntegrationsTab({ user, t }: { user: User; t: Translations }) {
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
            onConnect={() => setActiveDialog('fireflies')}
            onDisconnect={() => handleDisconnect('fireflies')}
            onVerified={loadData}
            busy={busyProvider === 'fireflies'}
            t={t}
          />
          <IntegrationCard
            title={t.asanaTitle}
            description={t.asanaDesc}
            row={asana}
            onConnect={() => setActiveDialog('asana')}
            onDisconnect={() => handleDisconnect('asana')}
            onVerified={loadData}
            busy={busyProvider === 'asana'}
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
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.creditsEnabledLabel}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.creditsEnabledHelp}</p>
        </div>
        <Toggle checked={enabled} onChange={toggleEnabled} />
      </div>

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
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.bonusesEnabledLabel}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.bonusesEnabledHelp}</p>
        </div>
        <Toggle checked={enabled} onChange={toggleEnabled} />
      </div>

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
    const payload = {
      name,
      description: formDescription.trim() || null,
      icon: formIcon.trim() || null,
      trigger_type: formTriggerType,
      trigger_rule: formTriggerType === 'auto' ? {} : null,
      is_featured: formFeatured,
      is_active: formActive,
    }
    const { error: dbError } = editingId
      ? await supabase.from('achievement_definitions').update(payload).eq('id', editingId)
      : await supabase.from('achievement_definitions').insert({ org_id: user.org_id, ...payload })
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    setShowForm(false)
    resetForm()
    await loadData()
  }

  return (
    <div className="space-y-5">
      {/* Org-level master switch */}
      <div className="flex items-start justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.badgesEnabledLabel}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.badgesEnabledHelp}</p>
        </div>
        <Toggle checked={orgBadgesEnabled} onChange={toggleOrgBadgesEnabled} />
      </div>

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
                      <span className="text-2xl">{displayBadgeIcon(def.icon, '🏅')}</span>
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-md rounded-xl border p-5 shadow-lg"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {editingId ? t.edit : t.newAchievement}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementName}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementIcon}</label>
                <input
                  type="text"
                  value={formIcon}
                  onChange={e => setFormIcon(e.target.value)}
                  maxLength={4}
                  className="w-full rounded-lg border px-3 py-2 text-center text-2xl md:w-24"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementDescription}</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
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
      )}
    </div>
  )
}

// ─── Billing tab (placeholder) ──────────────────────────

function BillingTab({ t }: { t: Translations }) {
  return (
    <section>
      <div
        className="rounded-xl border border-dashed p-10 text-center"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto mb-3"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
        <h2 className="mb-1 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.billingComingSoonTitle}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.billingComingSoonDesc}
        </p>
      </div>
    </section>
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
