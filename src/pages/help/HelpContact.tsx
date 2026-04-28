import { useState } from 'react'
import { Link } from 'react-router-dom'

export function HelpContact() {
  const [submitted, setSubmitted] = useState(false)
  const [category, setCategory] = useState('')

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          Contact support
        </h1>
        <p className="mt-3 text-base" style={{ color: 'var(--color-text-secondary)' }}>
          We read every message that comes in. Most questions are already covered
          in the <Link to="/help/faq" style={{ color: 'var(--color-primary)' }}>FAQ</Link> — check
          there first.
        </p>
      </header>

      {/* Submit a request */}
      <section className="mb-10">
        <h2 className="mb-5 text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          Submit a request
        </h2>

        {submitted ? (
          <div
            className="rounded-2xl border px-7 py-10 text-center"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'var(--color-diff-add)',
                color: 'var(--color-success)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
              Got it. We'll be in touch.
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              We respond within one business day, usually faster.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(true)
            }}
            className="space-y-4"
          >
            <div>
              <label
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Select a category…
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
              >
                <option value="" disabled>Pick one</option>
                <option value="getting-started">Getting started / onboarding</option>
                <option value="billing">Billing & invoices</option>
                <option value="bug">Something's broken (bug)</option>
                <option value="feature">Feature request</option>
                <option value="security">Security / data protection</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name" required>
                <input type="text" required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </Field>
              <Field label="Work email" required>
                <input type="email" required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
              </Field>
            </div>

            <Field label="Message" required>
              <textarea
                required
                rows={5}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={inputStyle}
                placeholder="What can we help with?"
              />
            </Field>

            <button
              type="submit"
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Send message
            </button>
          </form>
        )}
      </section>

      {/* Channels */}
      <section className="mb-10">
        <ChannelCard
          title="Email"
          body="Send us a message and we'll respond within one business day."
          href="mailto:support@flodok.com"
          arrow="→"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          }
        />
        <ChannelCard
          title="WhatsApp"
          body="Prefer to chat? Message us during WIB business hours. Extended WhatsApp support is for paid customers only."
          href="https://wa.me/62800flodok"
          arrow="↗"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          }
        />
      </section>

      {/* Bug bounty */}
      <section
        className="mb-6 rounded-2xl border p-6"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <rect x="8" y="6" width="8" height="14" rx="4" />
            <path d="M19 7l-3 2" />
            <path d="M5 7l3 2" />
            <path d="M19 13h-3" />
            <path d="M8 13H5" />
            <path d="M19 19l-3-2" />
            <path d="M5 19l3-2" />
            <path d="M12 6V2" />
          </svg>
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Bug bounty
          </h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Found a critical issue or something not working as expected? We offer
          free credits to users who help identify and report bugs. Email{' '}
          <a href="mailto:security@flodok.com" style={{ color: 'var(--color-primary)' }}>
            security@flodok.com
          </a>{' '}
          with a description of the issue and we'll take it from there. Full
          disclosure policy on our{' '}
          <Link to="/security" style={{ color: 'var(--color-primary)' }}>Security page</Link>.
        </p>
      </section>

      {/* Enterprise */}
      <section
        className="rounded-2xl border p-6"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="9" x2="9" y2="9.01" />
            <line x1="9" y1="13" x2="9" y2="13.01" />
            <line x1="9" y1="17" x2="9" y2="17.01" />
            <line x1="13" y1="9" x2="17" y2="9" />
            <line x1="13" y1="13" x2="17" y2="13" />
            <line x1="13" y1="17" x2="17" y2="17" />
          </svg>
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Enterprise
          </h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Need custom integrations, dedicated infrastructure, or volume pricing?
          Contact{' '}
          <a href="mailto:hello@flodok.com" style={{ color: 'var(--color-primary)' }}>
            hello@flodok.com
          </a>{' '}
          to discuss your requirements.
        </p>
      </section>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-sm font-medium"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {label}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function ChannelCard({
  title,
  body,
  href,
  icon,
  arrow,
}: {
  title: string
  body: string
  href: string
  icon: React.ReactNode
  arrow: string
}) {
  const isExternal = href.startsWith('http') || href.startsWith('mailto:')
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="mb-3 flex items-center gap-4 rounded-2xl border px-5 py-4 transition-colors"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          {title}
        </div>
        <div className="mt-0.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {body}
        </div>
      </div>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{arrow}</span>
    </a>
  )
}
