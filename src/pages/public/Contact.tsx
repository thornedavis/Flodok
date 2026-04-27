import { useState } from 'react'

export function Contact() {
  return (
    <main>
      <ContactHero />
      <ContactGrid />
      <OtherChannels />
    </main>
  )
}

function ContactHero() {
  return (
    <section className="px-6 pb-10 pt-16 md:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-primary)' }}
        >
          Contact
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight md:text-5xl"
          style={{ color: 'var(--color-text)' }}
        >
          We'd love to hear from you.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base md:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          Sales questions, support tickets, partnership ideas, kopi recommendations —
          send us a note and we'll reply within one business day.
        </p>
      </div>
    </section>
  )
}

function ContactGrid() {
  const [submitted, setSubmitted] = useState(false)
  const [topic, setTopic] = useState('sales')

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <section className="px-6 pb-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Form */}
        <div
          className="rounded-2xl border p-8"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          {submitted ? (
            <div className="py-12 text-center">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--color-diff-add)', color: 'var(--color-success)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Thanks — we got it.
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                We'll reply within one business day, usually faster.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setSubmitted(true)
              }}
              className="space-y-5"
            >
              {/* Topic radio cards */}
              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  What's this about?
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { v: 'sales', label: 'Sales' },
                    { v: 'support', label: 'Support' },
                    { v: 'partnership', label: 'Partnership' },
                    { v: 'other', label: 'Other' },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setTopic(opt.v)}
                      className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        borderColor: topic === opt.v ? 'var(--color-primary)' : 'var(--color-border)',
                        backgroundColor: topic === opt.v ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg)',
                        color: topic === opt.v ? 'var(--color-primary)' : 'var(--color-text)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Full name" required>
                  <input type="text" required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
                </Field>
                <Field label="Work email" required>
                  <input type="email" required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Company">
                  <input type="text" className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
                </Field>
                <Field label="Team size">
                  <select className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
                    <option>1–10</option>
                    <option>11–50</option>
                    <option>51–200</option>
                    <option>201–500</option>
                    <option>500+</option>
                  </select>
                </Field>
              </div>

              <Field label="Message" required>
                <textarea
                  required
                  rows={5}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                  placeholder="Tell us a bit about what you're working on…"
                />
              </Field>

              <button
                type="submit"
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Send message
              </button>

              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                By submitting, you agree to our{' '}
                <a href="/privacy" style={{ color: 'var(--color-primary)' }}>
                  Privacy Policy
                </a>
                .
              </p>
            </form>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <ContactCard
            title="Sales"
            body="Pricing, plans, and tailored demos."
            email="sales@flodok.com"
          />
          <ContactCard
            title="Support"
            body="For existing customers — we typically reply in under an hour during WIB business hours."
            email="support@flodok.com"
          />
          <ContactCard
            title="Press & partnerships"
            body="Media inquiries and partner requests."
            email="hello@flodok.com"
          />

          <div
            className="rounded-2xl border p-5"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              Office
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
              Flodok HQ
              <br />
              Jakarta, Indonesia
            </p>
            <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Mon–Fri · 09.00 – 18.00 WIB
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function ContactCard({ title, body, email }: { title: string; body: string; email: string }) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {body}
      </p>
      <a
        href={`mailto:${email}`}
        className="mt-3 inline-block text-sm font-semibold"
        style={{ color: 'var(--color-primary)' }}
      >
        {email}
      </a>
    </div>
  )
}

function OtherChannels() {
  const channels = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
      title: 'WhatsApp Business',
      body: 'Quick questions during WIB hours.',
      action: 'wa.me/62800flodok',
      href: '#',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      title: 'Live chat',
      body: 'Available in-product to logged-in users.',
      action: 'Open the app',
      href: '/dashboard',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
      title: 'Status page',
      body: 'Real-time uptime and incident updates.',
      action: 'status.flodok.com',
      href: 'https://status.flodok.com',
    },
  ]

  return (
    <section
      className="border-t px-6 py-20"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Or reach us another way.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {channels.map(c => (
            <a
              key={c.title}
              href={c.href}
              className="rounded-2xl border p-6 transition-colors"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-primary)' }}
              >
                {c.icon}
              </div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {c.title}
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {c.body}
              </p>
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                {c.action} →
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
