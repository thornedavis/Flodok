import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'

type Phase = 'verifying' | 'ready' | 'invalid' | 'saving' | 'done'

// After the user clicks the recovery email link, Supabase returns them here
// with a short-lived recovery session. We wait for that session to appear
// (either already in storage, or delivered via PASSWORD_RECOVERY event) and
// then let them set a new password.
export function ResetPassword() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) setPhase('ready')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setPhase('ready')
      }
    })
    // If the hash didn't resolve into a session within a few seconds, the
    // link is likely expired/invalid.
    const timeout = window.setTimeout(() => {
      setPhase(current => (current === 'verifying' ? 'invalid' : current))
    }, 4000)
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError(t.passwordTooShort)
      return
    }
    if (password !== confirm) {
      setError(t.passwordsDoNotMatch)
      return
    }
    setPhase('saving')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setPhase('ready')
      return
    }
    setPhase('done')
    window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <h1 className="mb-2 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.resetPasswordTitle}</h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.resetPasswordSubtitle}</p>

        {phase === 'verifying' && (
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>
        )}

        {phase === 'invalid' && (
          <div className="space-y-3">
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {t.resetLinkInvalid}
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
        )}

        {(phase === 'ready' || phase === 'saving') && (
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
                autoFocus
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
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
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>

            <button
              type="submit"
              disabled={phase === 'saving'}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {phase === 'saving' ? t.updatingPassword : t.updatePassword}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-add, var(--color-bg-tertiary))', color: 'var(--color-success)' }}>
            {t.passwordUpdatedRedirect}
          </div>
        )}
      </div>
    </div>
  )
}
