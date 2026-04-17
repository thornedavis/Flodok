import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'

export function Signup({ onSignUp }: { onSignUp: (email: string, password: string, name: string, orgName: string) => Promise<{ error: unknown }> }) {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await onSignUp(email, password, name, orgName)
    if (error) {
      setError((error as Error).message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.checkYourEmail}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.confirmationSentTo} <strong>{email}</strong>. {t.clickToActivate}
          </p>
          <Link to="/login" className="mt-6 inline-block text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
            {t.backToSignIn}
          </Link>
        </div>
      </div>
    )
  }

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
    '--tw-ring-color': 'var(--color-primary)',
  } as React.CSSProperties

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {t.createAccountTitle}
        </h1>
        <p className="mb-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.setupOrgTagline}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.yourNameLabel}
            </label>
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
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.organizationName}
            </label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.emailLabel}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
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
            disabled={loading}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {loading ? t.creatingAccount : t.createAccount}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.alreadyHaveAccount}{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--color-primary)' }}>
            {t.signIn}
          </Link>
        </p>
      </div>
    </div>
  )
}
