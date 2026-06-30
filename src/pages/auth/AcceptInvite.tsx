import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'

// Team-invite acceptance. The invitee arrives via Supabase's "Invite user" email
// (sent by the invite-member edge fn) whose redirect lands here with an invite
// session in the URL. Their auth identity exists, but the signup trigger (186)
// deliberately does NOT seat them into the org yet — so the invite stays
// genuinely 'pending' and revocable. Acceptance = set a name + password, then
// handle_signup seats them at the invited role (email-bound). Mirrors ClaimOwner:
// display state is derived from async signals (no synchronous setState-in-effect).
export function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const { t } = useLang()
  const navigate = useNavigate()
  const [tokenValid, setTokenValid] = useState<boolean | null>(token ? null : false)
  const [orgName, setOrgName] = useState('')
  const [hasSession, setHasSession] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [submit, setSubmit] = useState<'idle' | 'saving' | 'done'>('idle')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false

    // Validate the invite (still pending now that seating is deferred): resolves
    // the org name, or marks the token invalid/revoked/expired.
    supabase.rpc('get_invite_by_token', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return
      const invite = Array.isArray(data) ? data[0] : data
      if (error || !invite) { setTokenValid(false); return }
      setOrgName(invite.org_name)
      setTokenValid(true)
    })

    // Wait for the invite session Supabase delivers in the URL.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setHasSession(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') setHasSession(true)
    })
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

  const invalidToken = tokenValid === false
  const ready = tokenValid === true && hasSession
  const noSession = tokenValid === true && timedOut && !hasSession

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

    // 2. Seat them into the org at the invited role. handle_signup is the
    //    email-bound seater: it joins only if the invite is still pending and
    //    the authenticated email matches. A revoked invite returns no org here.
    const { data: { session } } = await supabase.auth.getSession()
    const { error: seatErr } = await supabase.rpc('handle_signup', {
      user_id: session?.user.id ?? '',
      user_email: session?.user.email ?? '',
      user_name: name.trim(),
      org_name: '',
      invite_token: token,
    })
    if (seatErr) { setError(seatErr.message); setSubmit('idle'); return }

    setSubmit('done')
    // Hard reload so useAuth refetches the now-seated, now-confirmed user.
    window.setTimeout(() => { window.location.href = '/dashboard' }, 1000)
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
        <h1 className="mb-2 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.acceptInviteTitle}</h1>

        {submit === 'done' ? (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-add, var(--color-bg-tertiary))', color: 'var(--color-success)' }}>
            {t.passwordUpdatedRedirect}
          </div>
        ) : invalidToken ? (
          <div className="space-y-3">
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {t.acceptInviteInvalid}
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
        ) : noSession ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.acceptInviteCheckEmail}</p>
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
            <p className="mb-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.acceptInviteIntro(orgName)}</p>
            <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.acceptInviteSetPwBody}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.yourNameLabel}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.newPasswordLabel}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
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
                {submit === 'saving' ? t.acceptInviteSubmitting : t.acceptInviteButton}
              </button>
            </form>
          </>
        ) : (
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.acceptInviteChecking}</div>
        )}
      </div>
    </div>
  )
}
