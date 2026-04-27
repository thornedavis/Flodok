import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'
import { AuthLayout, AuthSteps, PasswordField } from '../../components/AuthLayout'

export function Signup({
  onSignUp,
}: {
  onSignUp: (
    email: string,
    password: string,
    name: string,
    orgName: string,
  ) => Promise<{ error: unknown }>
}) {
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

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  const steps = ['Sign up your account', 'Verify your email', 'Set up your team']

  return (
    <AuthLayout
      panelEyebrow="Get started"
      panelTitle="Get Started with Us."
      panelSubtitle="Complete these easy steps and you'll be up and running in five minutes."
      panelAccent={<AuthSteps steps={steps} active={success ? 1 : 0} />}
    >
      {success ? (
        <div>
          <div
            className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full"
            style={{
              backgroundColor: 'var(--color-diff-add)',
              color: 'var(--color-success)',
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>

          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            {t.checkYourEmail}
          </h2>
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t.confirmationSentTo} <strong style={{ color: 'var(--color-text)' }}>{email}</strong>.
            {' '}
            {t.clickToActivate}
          </p>

          <Link
            to="/login"
            className="mt-8 inline-block text-sm font-semibold"
            style={{ color: 'var(--color-primary)' }}
          >
            {t.backToSignIn} →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--color-text)' }}
            >
              {t.createAccountTitle}
            </h2>
            <p
              className="mt-1.5 text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.setupOrgTagline}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="rounded-md px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--color-diff-remove)',
                  color: 'var(--color-danger)',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t.yourNameLabel}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t.organizationName}
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                autoComplete="organization"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t.emailLabel}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              />
            </div>

            <PasswordField
              value={password}
              onChange={setPassword}
              required
              minLength={6}
              label={t.passwordLabel}
              showLabel="Show password"
              hideLabel="Hide password"
              autoComplete="new-password"
            />
            <p className="-mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Must be at least 6 characters.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {loading ? t.creatingAccount : t.createAccount}
            </button>
          </form>

          <p
            className="mt-8 text-center text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t.alreadyHaveAccount}{' '}
            <Link
              to="/login"
              className="font-semibold"
              style={{ color: 'var(--color-primary)' }}
            >
              {t.signIn}
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
