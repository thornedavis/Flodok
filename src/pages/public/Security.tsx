import { Link } from 'react-router-dom'

export function Security() {
  return (
    <main>
      <SecurityHero />
      <Pillars />
      <Compliance />
      <Disclosure />
      <SecurityCTA />
    </main>
  )
}

function SecurityHero() {
  return (
    <section className="px-6 pb-14 pt-16 md:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-primary)' }}
        >
          Security
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight md:text-5xl"
          style={{ color: 'var(--color-text)' }}
        >
          Built secure. Built in Indonesia.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base md:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          Your team's contracts, SOPs, and reviews are some of the most sensitive things
          on your network. We treat them like it.
        </p>
      </div>
    </section>
  )
}

function Pillars() {
  const pillars = [
    {
      title: 'Encryption',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      body: 'TLS 1.3 in transit. AES-256 at rest. Encrypted database backups. Keys rotated regularly and stored in a managed key vault.',
    },
    {
      title: 'Authentication',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      body: 'bcrypt-hashed passwords with strong policy. SSO via Google Workspace and SAML (Scale plan). Optional MFA for every user.',
    },
    {
      title: 'Access control',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      body: 'Role-based access control with least-privilege defaults. Row-level security in the database. Audit logs for every admin action, retained 12 months.',
    },
    {
      title: 'Infrastructure',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14a9 3 0 0 0 18 0V5" />
          <path d="M3 12a9 3 0 0 0 18 0" />
        </svg>
      ),
      body: 'Hosted on Supabase (Singapore) and Cloudflare (Indonesia POPs). Production isolated from development. Daily encrypted backups with tested restore procedures.',
    },
    {
      title: 'Monitoring',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      body: '24/7 application and infrastructure monitoring. Anomaly detection on auth events. Automated dependency scanning. On-call rotation for incidents.',
    },
    {
      title: 'Resilience',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 12 8 12 11 21 13 3 16 12 21 12" />
        </svg>
      ),
      body: 'Daily backups with 30-day retention. Disaster recovery plan tested twice a year. 99.9% uptime SLA on Pro and Scale plans.',
    },
  ]

  return (
    <section className="border-y px-6 py-20" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            How we protect your data.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pillars.map(p => (
            <div
              key={p.title}
              className="rounded-2xl border p-6"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-primary)' }}
              >
                {p.icon}
              </div>
              <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {p.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Compliance() {
  const items = [
    {
      title: 'UU PDP (UU 27/2022)',
      body: "Indonesia's Personal Data Protection Law. We process Customer Data as a Data Processor under our DPA, with 72-hour breach notification.",
    },
    {
      title: 'PP 71/2019',
      body: "Indonesian data residency requirements. Primary infrastructure operates in Indonesia and Singapore; we keep production data within ASEAN.",
    },
    {
      title: 'GDPR-aligned',
      body: 'For international Customers, we apply GDPR-equivalent protections including Standard Contractual Clauses for cross-border transfers.',
    },
    {
      title: 'SOC 2 Type II',
      body: 'In progress for 2026. Type I report available on request under NDA.',
    },
  ]

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Compliance
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Built for Indonesian compliance.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map(item => (
            <div
              key={item.title}
              className="rounded-2xl border p-6"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          Need our security questionnaire, SOC 2 report, or DPA? Email{' '}
          <a href="mailto:security@flodok.com" style={{ color: 'var(--color-primary)' }}>
            security@flodok.com
          </a>
          .
        </p>
      </div>
    </section>
  )
}

function Disclosure() {
  return (
    <section className="border-t px-6 py-20" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Vulnerability disclosure
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Found a security issue?
          </h2>
        </div>

        <div
          className="rounded-2xl border p-7"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            We welcome responsible disclosure from security researchers. Email a description and
            steps to reproduce to{' '}
            <a href="mailto:security@flodok.com" style={{ color: 'var(--color-primary)' }}>
              security@flodok.com
            </a>
            . We commit to:
          </p>
          <ul
            className="mt-4 space-y-2 text-sm"
            style={{ color: 'var(--color-text-secondary)', paddingLeft: '1.25rem', listStyleType: 'disc' }}
          >
            <li>Acknowledge receipt within 24 hours;</li>
            <li>Provide an initial assessment within 5 business days;</li>
            <li>Keep you updated as we triage and patch;</li>
            <li>Not pursue legal action for good-faith research that follows this policy.</li>
          </ul>
          <p className="mt-4 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Please don't access data you don't own, perform DoS testing, or publicly disclose
            vulnerabilities before we've had a chance to address them.
          </p>
        </div>
      </div>
    </section>
  )
}

function SecurityCTA() {
  return (
    <section className="px-6 pb-24 pt-4">
      <div className="mx-auto max-w-4xl">
        <div
          className="rounded-3xl border px-8 py-14 text-center md:px-16"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Want the full picture?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Read our <Link to="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>,{' '}
            <Link to="/dpa" style={{ color: 'var(--color-primary)' }}>Data Processing Agreement</Link>, or{' '}
            <Link to="/contact" style={{ color: 'var(--color-primary)' }}>get in touch</Link> for our
            full security questionnaire.
          </p>
        </div>
      </div>
    </section>
  )
}
