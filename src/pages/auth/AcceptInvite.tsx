import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'

type InviteState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'ready'; email: string; orgName: string; token: string }

export function AcceptInvite({ onSignUp }: {
  onSignUp: (email: string, password: string, name: string, orgName: string, inviteToken?: string) => Promise<{ error: unknown }>
}) {
  const { token } = useParams<{ token: string }>()
  const { t } = useLang()
  const navigate = useNavigate()
  const [state, setState] = useState<InviteState>({ status: 'loading' })

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!token) { setState({ status: 'invalid' }); return }

    async function load() {
      // Scoped lookup (migration 163): resolves only THIS token to the org
      // name + email, never exposing other orgs' invites. Replaces the old
      // direct table reads that the anon key could enumerate org-wide.
      const { data, error } = await supabase.rpc('get_invite_by_token', {
        p_token: token as string,
      })
      const invite = Array.isArray(data) ? data[0] : data
      if (error || !invite) {
        setState({ status: 'invalid' })
        return
      }
      setState({ status: 'ready', email: invite.email, orgName: invite.org_name, token: token as string })
    }

    load()
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state.status !== 'ready') return
    setError('')
    setSubmitting(true)
    const { error: signErr } = await onSignUp(
      state.email,
      password,
      name.trim(),
      state.orgName,
      state.token,
    )
    setSubmitting(false)
    if (signErr) {
      setError((signErr as Error).message)
      return
    }
    // With email confirmation on, signUp returns no session — show a "check
    // your email" state instead of bouncing to the signed-out route tree. The
    // invite is already redeemed server-side by the signup trigger (164); the
    // user joins the org on first login after confirming. If confirmation is
    // off (session present), go straight to the dashboard.
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      navigate('/dashboard', { replace: true })
    } else {
      setSubmitted(true)
    }
  }

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {t.acceptInviteTitle}
        </h1>

        {state.status === 'loading' && (
          <p className="mt-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.acceptInviteChecking}
          </p>
        )}

        {state.status === 'invalid' && (
          <div className="mt-8 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.acceptInviteInvalid}</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.acceptInviteInvalidDesc}</p>
            <Link to="/login" className="mt-6 inline-block text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              {t.backToLogin}
            </Link>
          </div>
        )}

        {state.status === 'ready' && submitted && (
          <div className="mt-8 text-center">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {t.checkYourEmail}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {t.confirmationSentTo} <strong style={{ color: 'var(--color-text)' }}>{state.email}</strong>. {t.clickToActivate}
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
              {t.backToSignIn} →
            </Link>
          </div>
        )}

        {state.status === 'ready' && !submitted && (
          <>
            <p className="mb-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t.acceptInviteIntro(state.orgName)}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.emailLabel}
                </label>
                <input
                  type="email"
                  value={state.email}
                  readOnly
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ ...inputStyle, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.yourNameLabel}
                </label>
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
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.passwordLabel}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {submitting ? t.creatingAccount : t.acceptInviteSignupButton}
              </button>

              <p className="text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.acceptInviteSignInHint}
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
