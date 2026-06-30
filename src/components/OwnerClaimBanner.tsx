// Persistent "owner not confirmed" banner. Renders at the top of every
// dashboard page (like DunningBanner) while the org is OWNERLESS — i.e. it was
// set up on-behalf and the real owner hasn't claimed yet. Recovers the gap
// where an on-behalf admin skipped the wizard without sending the claim: lets
// them send / resend / correct the owner invite inline (via the owner-claim
// edge function). Only admins see it; once an owner is confirmed it disappears.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { useRole } from '../hooks/useRole'
import { ownerClaim } from '../lib/ownerClaim'
import type { User } from '../types/aliases'

const COLORS = { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.4)', text: '#d97706', accent: '#f59e0b' }

export function OwnerClaimBanner({ user }: { user: User }) {
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const [status, setStatus] = useState<'loading' | 'hasOwner' | 'ownerless'>('loading')
  const [claimEmail, setClaimEmail] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    // Ownerless? (no users row with role='owner' in this org.)
    supabase.from('users')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', user.org_id)
      .eq('role', 'owner')
      .then(({ count }) => {
        if (cancelled) return
        if ((count ?? 0) > 0) { setStatus('hasOwner'); return }
        // Ownerless — surface the pending claim (if any) so we can show its email.
        supabase.from('owner_claims')
          .select('owner_email')
          .eq('org_id', user.org_id)
          .eq('status', 'pending')
          .maybeSingle()
          .then(({ data }) => {
            if (cancelled) return
            setClaimEmail(data?.owner_email ?? null)
            setStatus('ownerless')
          })
      })
    return () => { cancelled = true }
  }, [user.org_id, isAdmin])

  if (!isAdmin || status !== 'ownerless') return null

  async function resend() {
    setBusy(true); setNote('')
    try {
      await ownerClaim({ action: 'resend' })
      setNote(t.ocbResent)
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }

  function startEdit() {
    setOwnerEmail(claimEmail ?? '')
    setOwnerName('')
    setNote('')
    setEditing(true)
  }

  async function submitEdit() {
    const email = ownerEmail.trim().toLowerCase()
    if (!email.includes('@')) { setNote(t.onbOwnerEmailInvalid); return }
    setBusy(true); setNote('')
    try {
      await ownerClaim({
        action: claimEmail ? 'change-email' : 'create',
        owner_email: email,
        owner_name: ownerName.trim() || null,
      })
      setClaimEmail(email)
      setEditing(false)
      setNote(t.ocbSent)
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <div className="mb-6 rounded-xl border px-4 py-3" style={{ backgroundColor: COLORS.bg, borderColor: COLORS.border }} role="alert">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <div className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {claimEmail ? t.ocbPendingTitle : t.ocbNoneTitle}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {claimEmail ? t.ocbPendingBody(claimEmail) : t.ocbNoneBody}
            </p>
            {note && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{note}</p>
            )}
          </div>
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-2">
            {claimEmail && (
              <button
                type="button"
                onClick={resend}
                disabled={busy}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: COLORS.border, color: COLORS.text }}
              >
                {t.ocbResend}
              </button>
            )}
            <button
              type="button"
              onClick={startEdit}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: COLORS.accent }}
            >
              {claimEmail ? t.ocbChangeEmail : t.ocbInviteOwner}
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onbOwnerNameLabel}</label>
            <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.onbOwnerEmailLabel}</label>
            <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
          </div>
          <button
            type="button"
            onClick={submitEdit}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.accent }}
          >
            {busy ? t.onbSendingInvite : t.onbSendInvite}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setNote('') }}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t.ocbCancel}
          </button>
        </div>
      )}
    </div>
  )
}
