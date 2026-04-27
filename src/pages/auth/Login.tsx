import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'
import { AuthLayout, AuthTestimonial, PasswordField } from '../../components/AuthLayout'

export function Login({
  onSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<{ error: unknown }>
}) {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await onSignIn(email, password)
    if (error) setError((error as Error).message)
    setLoading(false)
  }

  return (
    <AuthLayout
      panelEyebrow="Welcome back"
      panelTitle="Run your operation."
      panelSubtitle="Sign in to manage your team's SOPs, contracts, and people — all in one place."
      panelAccent={
        <AuthTestimonial
          quote="Onboarding a new hire used to take us a full week. Now it's under a day."
          name="Sari Wijaya"
          role="COO at Nusa Coffee Co."
        />
      }
    >
      <div className="mb-8">
        <h2
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          {t.signIn}
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Enter your credentials to access your dashboard.
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
            {t.emailLabel}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        <PasswordField
          value={password}
          onChange={setPassword}
          required
          label={t.passwordLabel}
          showLabel="Show password"
          hideLabel="Hide password"
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link
            to="/reset-password"
            className="text-xs font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {loading ? t.signingIn : t.signIn}
        </button>
      </form>

      <p
        className="mt-8 text-center text-sm"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {t.noAccount}{' '}
        <Link
          to="/signup"
          className="font-semibold"
          style={{ color: 'var(--color-primary)' }}
        >
          {t.signUp}
        </Link>
      </p>
    </AuthLayout>
  )
}
