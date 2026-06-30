import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'

// Owner-claim acceptance. The owner arrives via a Supabase invite link
// (auth.admin.inviteUserByEmail, sent by the owner-claim edge function) whose
// redirect lands here with both an invite session (in the URL) and our claim
// token (the :token path segment). We wait for the session, let them set a
// password on the invited identity, then call redeem_owner_claim to promote
// them member -> owner. See migrations 178/179.
//
// Display state is DERIVED from the async signals (token validity + session +
// timeout) rather than set imperatively inside effects, so every setState lives
// in a callback (no synchronous setState-in-effect).
export function ClaimOwner() {
  const { token } = useParams<{ token: string }>()
  const { t } = useLang()
  const navigate = useNavigate()
  const [tokenValid, setTokenValid] = useState<boolean | null>(token ? null : false)
  const [orgName, setOrgName] = useState('')
  const [hasSession, setHasSession] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [submit, setSubmit] = useState<'idle' | 'saving' | 'done'>('idle')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false

    // Validate the claim token via the anon-safe scoped RPC (mirrors
    // get_invite_by_token): resolves only THIS token to its org name.
    supabase.rpc('get_owner_claim_by_token', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return
      const claim = Array.isArray(data) ? data[0] : data
      if (error || !claim) { setTokenValid(false); return }
      setOrgName(claim.org_name)
      setTokenValid(true)
    })

    // Wait for the invite session Supabase delivers in the URL.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setHasSession(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') setHasSession(true)
    })
    // If the session hasn't landed shortly, re-check storage once (the event may
    // have fired before our listener attached) before declaring the link stale.
    const timeout = window.setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return
        if (data.session) setHasSession(true)
        else setTimedOut(true)
      })
    }, 6000)

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [token])

  const ready = tokenValid === true && hasSession
  const invalid = tokenValid === false || (timedOut && !ready)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!token) return
    if (password.length < 8) { setError(t.passwordTooShort); return }
    if (password !== confirm) { setError(t.passwordsDoNotMatch); return }

    setSubmit('saving')
    // 1. Set a password on the invited identity (it has none yet).
    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setError(pwErr.message); setSubmit('idle'); return }

    // 2. Promote member -> owner. The RPC validates the token, that the
    //    caller's email matches the claim, and that the org is still ownerless.
    const { error: redeemErr } = await supabase.rpc('redeem_owner_claim', { p_token: token })
    if (redeemErr) { setError(redeemErr.message); setSubmit('idle'); return }

    setSubmit('done')
    // Hard reload (not client nav) so useAuth refetches the user — they were a
    // 'member' a moment ago and are now 'owner'; a SPA navigation would keep the
    // stale role and show member-level UI until the next refresh.
    window.setTimeout(() => { window.location.href = '/dashboard' }, 1200)
  }

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <h1 className="mb-2 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.claimOwnerTitle}</h1>

        {submit === 'done' ? (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-add, var(--color-bg-tertiary))', color: 'var(--color-success)' }}>
            {t.claimOwnerDone}
          </div>
        ) : invalid ? (
          <div className="space-y-3">
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {t.claimOwnerInvalid}
            </div>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="text-sm font-medium"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.backToLogin}
            </button>
          </div>
        ) : ready ? (
          <>
            <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.claimOwnerIntro(orgName)}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.newPasswordLabel}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.passwordMinLengthHint}</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.confirmNewPasswordLabel}</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={submit === 'saving'}
                className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {submit === 'saving' ? t.claimOwnerSubmitting : t.claimOwnerButton}
              </button>

              {/* Always-available escape so a terminal redeem error (e.g. the org
                  already has an owner) is never a dead-end — they can sign in as
                  the member they already are. */}
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="w-full text-center text-xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t.backToLogin}
              </button>
            </form>
          </>
        ) : (
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.claimOwnerChecking}</div>
        )}
      </div>
    </div>
  )
}
