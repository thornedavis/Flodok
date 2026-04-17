import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { getAvatarGradient } from '../../lib/avatar'
import { AvatarUpload } from '../../components/AvatarUpload'
import { PhoneInput } from '../../components/PhoneInput'
import { CountrySelect } from '../../components/CountrySelect'
import { isValidE164 } from '../../lib/phone'
import type { Translations } from '../../lib/translations'
import type { User, Organization, ApiKey, OrgInvitation } from '../../types/database'

type Tab = 'account' | 'organization' | 'integrations' | 'billing'

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
  if (rawTab === 'organization' || rawTab === 'billing') tab = rawTab
  else if (rawTab === 'integrations' && isAdmin) tab = 'integrations'

  function setTab(next: Tab) {
    setParams({ tab: next }, { replace: true })
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.settingsTitle}</h1>

      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <TabButton active={tab === 'account'} onClick={() => setTab('account')}>{t.settingsAccountTab}</TabButton>
        <TabButton active={tab === 'organization'} onClick={() => setTab('organization')}>{t.settingsOrganizationTab}</TabButton>
        {isAdmin && (
          <TabButton active={tab === 'integrations'} onClick={() => setTab('integrations')}>{t.settingsIntegrationsTab}</TabButton>
        )}
        <TabButton active={tab === 'billing'} onClick={() => setTab('billing')}>{t.settingsBillingTab}</TabButton>
      </div>

      {tab === 'account' && <AccountTab user={user} t={t} />}
      {tab === 'organization' && <OrganizationTab user={user} t={t} />}
      {tab === 'integrations' && isAdmin && <IntegrationsTab user={user} t={t} />}
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

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.yourProfile}</h2>
      <form onSubmit={handleSave} className="space-y-4 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? t.saving : t.save}
          </button>
          {savedAt && !dirty && (
            <span className="text-xs" style={{ color: 'var(--color-success)' }}>{t.profileSaved}</span>
          )}
        </div>
      </form>
    </section>
  )
}

// ─── Organization tab ───────────────────────────────────

function OrganizationTab({ user, t }: { user: User; t: Translations }) {
  const { isAdmin } = useRole(user)
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgName, setOrgName] = useState('')
  const [countryCode, setCountryCode] = useState('+62')
  const [orgPhone, setOrgPhone] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const { data } = await supabase.from('organizations').select('*').eq('id', user.org_id).single()
    if (data) {
      setOrg(data)
      setOrgName(data.name)
      setCountryCode(data.default_country_code)
      setOrgPhone(data.phone || '')
      setLogoUrl(data.logo_url)
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
  const dirty = !!org && (
    orgName.trim() !== org.name ||
    countryCode.trim() !== org.default_country_code ||
    (orgPhone || null) !== (org.phone || null)
  ) && orgName.trim().length > 0 && countryCode.trim().length > 0 && phoneValid

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    const { data } = await supabase.from('organizations').update({
      name: orgName.trim(),
      default_country_code: countryCode.trim(),
      phone: orgPhone || null,
    }).eq('id', user.org_id).select().single()
    if (data) setOrg(data)
    setSaving(false)
  }

  if (!org) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div className="space-y-10">
      {/* Org details */}
      <section>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.organizationSection}</h2>
        {!isAdmin && (
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.adminOnlyHint}</p>
        )}
        <form onSubmit={handleSaveOrg} className="space-y-4 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
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

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationName}</label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              required
              readOnly={!isAdmin}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={isAdmin ? inputStyle : { ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.organizationPhoneLabel}</label>
            {isAdmin ? (
              <PhoneInput value={orgPhone} onChange={setOrgPhone} defaultCountryCode={countryCode} />
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
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.defaultCountryCode}</label>
            <CountrySelect value={countryCode} onChange={setCountryCode} disabled={!isAdmin} />
          </div>

          {isAdmin && (
            <button type="submit" disabled={saving || !dirty} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {saving ? t.saving : t.save}
            </button>
          )}
        </form>
      </section>

      {/* Team members */}
      <TeamMembersSection user={user} t={t} />
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
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewMode, setReviewMode] = useState<boolean | null>(null)
  const [updatingReviewMode, setUpdatingReviewMode] = useState(false)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [keysResult, orgResult] = await Promise.all([
      supabase.from('api_keys').select('*').eq('org_id', user.org_id).order('created_at', { ascending: false }),
      supabase.from('organizations').select('review_mode').eq('id', user.org_id).single(),
    ])
    setApiKeys(keysResult.data || [])
    if (orgResult.data) setReviewMode(orgResult.data.review_mode)
    setLoading(false)
  }

  async function handleToggleReviewMode(next: boolean) {
    setUpdatingReviewMode(true)
    const previous = reviewMode
    setReviewMode(next)
    const { error } = await supabase.from('organizations').update({ review_mode: next }).eq('id', user.org_id)
    if (error) { setReviewMode(previous); alert(error.message) }
    setUpdatingReviewMode(false)
  }

  async function handleGenerateKey() {
    if (!newKeyName.trim()) return

    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const key = 'flk_live_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
    const prefix = key.slice(0, 16) + '...'

    const encoder = new TextEncoder()
    const data = encoder.encode(key)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const { error } = await supabase.from('api_keys').insert({
      org_id: user.org_id,
      key_hash: hashHex,
      key_prefix: prefix,
      name: newKeyName.trim(),
    })

    if (error) { alert(error.message); return }

    setGeneratedKey(key)
    setNewKeyName('')
    loadData()
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm(t.revokeKeyConfirm)) return
    await supabase.from('api_keys').delete().eq('id', keyId)
    loadData()
  }

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

      {/* API Keys */}
      <section>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.apiKeysSection}</h2>

        {generatedKey && (
          <div className="mb-4 overflow-hidden rounded-xl border p-4" style={{ borderColor: 'var(--color-success)', backgroundColor: 'var(--color-diff-add)' }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t.apiKeyGenerated}
              </p>
              <button
                onClick={() => { navigator.clipboard.writeText(generatedKey); setGeneratedKey('') }}
                className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-success)' }}
              >
                {t.copyAndDismiss}
              </button>
            </div>
            <input
              type="text"
              readOnly
              value={generatedKey}
              onFocus={e => e.target.select()}
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>
        )}

        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.keyName}</label>
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder={t.keyNamePlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleGenerateKey}
            disabled={!newKeyName.trim()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.generate}
          </button>
        </div>

        {!loading && apiKeys.length > 0 && (
          <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            {apiKeys.map(key => (
              <div key={key.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{key.name}</span>
                  <span className="ml-2 text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>{key.key_prefix}</span>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.createdOn} {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · ${t.lastUsedOn} ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeKey(key.id)}
                  className="text-xs"
                  style={{ color: 'var(--color-danger)' }}
                >
                  {t.revoke}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Third-party integrations placeholder */}
      <section>
        <div
          className="rounded-xl border border-dashed p-8 text-center"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-3"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            {t.integrationsComingSoonTitle}
          </h3>
          <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.integrationsComingSoonDesc}
          </p>
        </div>
      </section>
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
