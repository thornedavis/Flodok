import { useState } from 'react'
import { Link } from 'react-router-dom'

export function AuthLayout({
  panelEyebrow,
  panelTitle,
  panelSubtitle,
  panelAccent,
  children,
}: {
  panelEyebrow?: string
  panelTitle: string
  panelSubtitle: string
  panelAccent?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen md:flex" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Left visual panel — hidden on mobile */}
      <div
        className="relative hidden flex-1 flex-col justify-between overflow-hidden md:flex"
        style={{
          minHeight: '100vh',
          backgroundColor: '#0a1525',
          color: '#fff',
        }}
      >
        {/* Radial blooms */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 80% 0%, rgba(59,130,246,0.45), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 70% at 0% 100%, rgba(37,99,235,0.30), transparent 60%)',
          }}
        />
        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Top: brand */}
        <div className="relative p-10">
          <Link
            to="/"
            className="text-lg font-semibold tracking-tight"
            style={{ color: '#fff' }}
          >
            Flodok
          </Link>
        </div>

        {/* Bottom: copy + accent */}
        <div className="relative px-10 pb-10">
          {panelEyebrow && (
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              {panelEyebrow}
            </p>
          )}
          <h1
            className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl"
            style={{ color: '#fff' }}
          >
            {panelTitle}
          </h1>
          <p
            className="mt-4 max-w-md text-base leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            {panelSubtitle}
          </p>

          {panelAccent && <div className="mt-10">{panelAccent}</div>}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 md:px-12 md:py-16">
        <div className="w-full max-w-sm">
          {/* Mobile-only brand mark */}
          <div className="mb-8 flex justify-center md:hidden">
            <Link
              to="/"
              className="text-xl font-semibold tracking-tight"
              style={{ color: 'var(--color-text)' }}
            >
              Flodok
            </Link>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Step indicator (signup) ────────────────────────────

export function AuthSteps({
  steps,
  active,
}: {
  steps: string[]
  active: number
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {steps.map((step, i) => {
        const isActive = i === active
        const isComplete = i < active
        return (
          <div
            key={i}
            className="rounded-xl px-4 py-4 transition-colors"
            style={{
              backgroundColor: isActive ? '#fff' : 'rgba(255,255,255,0.05)',
              border: isActive
                ? '1px solid #fff'
                : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div
              className="mb-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                backgroundColor: isActive
                  ? '#0a1525'
                  : isComplete
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.1)',
                color: isActive
                  ? '#fff'
                  : isComplete
                    ? '#0a1525'
                    : 'rgba(255,255,255,0.6)',
              }}
            >
              {isComplete ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <div
              className="text-xs font-semibold leading-tight"
              style={{
                color: isActive ? '#0a1525' : 'rgba(255,255,255,0.7)',
              }}
            >
              {step}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Testimonial card (login) ───────────────────────────

export function AuthTestimonial({
  quote,
  name,
  role,
}: {
  quote: string
  name: string
  role: string
}) {
  return (
    <figure
      className="max-w-md rounded-2xl border p-6"
      style={{
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <blockquote className="text-base leading-relaxed" style={{ color: '#fff' }}>
        "{quote}"
      </blockquote>
      <figcaption className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
        <span className="font-semibold" style={{ color: '#fff' }}>{name}</span>
        {' · '}
        {role}
      </figcaption>
    </figure>
  )
}

// ─── Password input with visibility toggle ──────────────

export function PasswordField({
  value,
  onChange,
  required,
  minLength,
  label,
  showLabel,
  hideLabel,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  required?: boolean
  minLength?: number
  label: string
  showLabel: string
  hideLabel: string
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="w-full rounded-lg border px-3 py-2 pr-10 text-sm"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? hideLabel : showLabel}
          className="absolute inset-y-0 right-0 flex items-center px-3 transition-colors hover:opacity-70"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {show ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
