import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'

export function Pricing() {
  return (
    <main>
      <PricingHero />
      <PricingTiers />
      <ComparisonTable />
      <AddOns />
      <PricingFAQ />
      <PricingCTA />
    </main>
  )
}

// ─── Hero ───────────────────────────────────────────────

function PricingHero() {
  return (
    <section className="px-6 pb-14 pt-16 md:pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-primary)' }}
        >
          Pricing
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight md:text-5xl"
          style={{ color: 'var(--color-text)' }}
        >
          Pricing built for Indonesian teams.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base md:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          Start free. Upgrade when you outgrow it. Always priced in Rupiah,
          always month-to-month. Annual plans save 20%.
        </p>
      </div>
    </section>
  )
}

// ─── Tiers ──────────────────────────────────────────────

function PricingTiers() {
  const [annual, setAnnual] = useState(false)

  const tiers = [
    {
      name: 'Starter',
      monthly: 0,
      annual: 0,
      blurb: 'For small teams getting started.',
      features: [
        'Up to 10 employees',
        'Unlimited SOPs',
        'Public employee portal',
        'Bahasa & English UI',
        'Community support',
      ],
      cta: 'Start free',
      highlighted: false,
    },
    {
      name: 'Pro',
      monthly: 290_000,
      annual: 232_000,
      blurb: 'For growing teams.',
      features: [
        'Up to 50 employees',
        'Everything in Starter',
        'Contracts & e-signatures',
        'Performance reviews',
        'Integrations (Fireflies, Slack)',
        'Priority email support',
      ],
      cta: 'Start free trial',
      highlighted: true,
    },
    {
      name: 'Scale',
      monthly: 890_000,
      annual: 712_000,
      blurb: 'For larger operations.',
      features: [
        'Unlimited employees',
        'Everything in Pro',
        'Custom roles & permissions',
        'SSO (SAML)',
        'Dedicated success manager',
        'Custom SLAs',
      ],
      cta: 'Talk to sales',
      highlighted: false,
    },
  ]

  return (
    <section className="px-6 pb-20">
      <div className="mx-auto max-w-6xl">
        {/* Billing toggle */}
        <div
          className="mx-auto mb-10 inline-flex items-center gap-1 rounded-full border p-1"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            display: 'flex',
            width: 'fit-content',
            marginInline: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: !annual ? 'var(--color-bg)' : 'transparent',
              color: !annual ? 'var(--color-text)' : 'var(--color-text-secondary)',
              boxShadow: !annual ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: annual ? 'var(--color-bg)' : 'transparent',
              color: annual ? 'var(--color-text)' : 'var(--color-text-secondary)',
              boxShadow: annual ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            Annual
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: 'var(--color-diff-add)',
                color: 'var(--color-success)',
              }}
            >
              −20%
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {tiers.map(tier => {
            const price = annual ? tier.annual : tier.monthly
            return (
              <div
                key={tier.name}
                className="relative flex flex-col rounded-2xl border p-7"
                style={{
                  borderColor: tier.highlighted ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: tier.highlighted ? 'var(--color-bg-secondary)' : 'var(--color-bg)',
                  boxShadow: tier.highlighted ? '0 0 0 1px var(--color-primary)' : 'none',
                }}
              >
                {tier.highlighted && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    Most popular
                  </div>
                )}

                <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {tier.name}
                </div>
                <div className="mb-1 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                    {price === 0 ? 'Rp 0' : `Rp ${price.toLocaleString('id-ID')}`}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    / month
                  </span>
                </div>
                <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {tier.blurb}
                </p>

                <Link
                  to={tier.cta === 'Talk to sales' ? '/contact' : '/signup'}
                  className="mb-6 block rounded-lg px-4 py-2 text-center text-sm font-semibold transition-opacity hover:opacity-90"
                  style={
                    tier.highlighted
                      ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                      : {
                          backgroundColor: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text)',
                        }
                  }
                >
                  {tier.cta}
                </Link>

                <ul className="space-y-2.5">
                  {tier.features.map(f => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      <Check />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {annual
            ? 'Billed annually in Rupiah. Cancel anytime.'
            : 'Billed monthly in Rupiah. Cancel anytime.'}
        </p>
      </div>
    </section>
  )
}

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0"
      style={{ color: 'var(--color-success)' }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function Dash() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0"
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// ─── Comparison table ──────────────────────────────────

function ComparisonTable() {
  const groups: { name: string; rows: { feature: string; values: (boolean | string)[] }[] }[] = [
    {
      name: 'Core',
      rows: [
        { feature: 'Employees', values: ['Up to 10', 'Up to 50', 'Unlimited'] },
        { feature: 'SOPs', values: ['Unlimited', 'Unlimited', 'Unlimited'] },
        { feature: 'Public employee portal', values: [true, true, true] },
        { feature: 'Bahasa & English UI', values: [true, true, true] },
        { feature: 'WIB · WITA · WIT time zones', values: [true, true, true] },
      ],
    },
    {
      name: 'Documents',
      rows: [
        { feature: 'SOP versioning & history', values: [true, true, true] },
        { feature: 'Contracts & e-signatures', values: [false, true, true] },
        { feature: 'Custom contract templates', values: [false, true, true] },
        { feature: 'Bulk import (CSV / DOCX)', values: [false, true, true] },
        { feature: 'PDF export', values: [true, true, true] },
      ],
    },
    {
      name: 'People',
      rows: [
        { feature: 'Employee directory', values: [true, true, true] },
        { feature: 'Performance reviews', values: [false, true, true] },
        { feature: '1:1 trackers', values: [false, true, true] },
        { feature: 'Awards & gamification', values: [false, true, true] },
        { feature: 'Custom roles & permissions', values: [false, false, true] },
      ],
    },
    {
      name: 'Integrations',
      rows: [
        { feature: 'Fireflies (meeting notes)', values: [false, true, true] },
        { feature: 'Slack notifications', values: [false, true, true] },
        { feature: 'Google Workspace SSO', values: [false, true, true] },
        { feature: 'SAML SSO', values: [false, false, true] },
        { feature: 'Webhook API', values: [false, false, true] },
      ],
    },
    {
      name: 'Support & SLA',
      rows: [
        { feature: 'Community support', values: [true, true, true] },
        { feature: 'Email support', values: [false, true, true] },
        { feature: 'Priority response (< 4h)', values: [false, true, true] },
        { feature: 'Dedicated success manager', values: [false, false, true] },
        { feature: 'Custom SLA', values: [false, false, true] },
        { feature: 'Onboarding & training', values: [false, 'Self-serve', 'White-glove'] },
      ],
    },
  ]

  return (
    <section className="border-y px-6 py-20" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Compare every feature.
          </h2>
        </div>

        <div
          className="overflow-x-auto rounded-2xl border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th
                  className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-tertiary)' }}
                />
                {['Starter', 'Pro', 'Scale'].map((name, i) => (
                  <th
                    key={name}
                    className="px-5 py-4 text-left text-sm font-semibold"
                    style={{
                      color: 'var(--color-text)',
                      backgroundColor: i === 1 ? 'color-mix(in srgb, var(--color-primary) 6%, transparent)' : 'transparent',
                    }}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <Fragment key={group.name}>
                  <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                    <td
                      colSpan={4}
                      className="px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {group.name}
                    </td>
                  </tr>
                  {group.rows.map(row => (
                    <tr
                      key={row.feature}
                      style={{ borderTop: '1px solid var(--color-border)' }}
                    >
                      <td className="px-5 py-3" style={{ color: 'var(--color-text)' }}>
                        {row.feature}
                      </td>
                      {row.values.map((v, i) => (
                        <td
                          key={i}
                          className="px-5 py-3"
                          style={{
                            color: 'var(--color-text-secondary)',
                            backgroundColor: i === 1 ? 'color-mix(in srgb, var(--color-primary) 4%, transparent)' : 'transparent',
                          }}
                        >
                          {typeof v === 'boolean' ? (v ? <Check /> : <Dash />) : v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ─── Add-ons ────────────────────────────────────────────

function AddOns() {
  const items = [
    {
      title: 'Onboarding & migration',
      price: 'From Rp 4.900.000',
      body: 'Our team imports your existing SOPs, contracts, and employee data — and trains your admins. One-time fee.',
    },
    {
      title: 'Custom integration',
      price: 'From Rp 12.000.000',
      body: 'Build a connection to your payroll, HRIS, or internal tools. Scoped, quoted, delivered in weeks.',
    },
    {
      title: 'On-site training',
      price: 'From Rp 6.500.000 / day',
      body: 'A Flodok specialist runs your team through the product in person, in Bahasa or English.',
    },
  ]

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Add-ons
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Need more? We've got you.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {items.map(item => (
            <div
              key={item.title}
              className="rounded-2xl border p-6"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {item.title}
              </h3>
              <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                {item.price}
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing FAQ ────────────────────────────────────────

function PricingFAQ() {
  const items = [
    {
      q: 'What counts as an "employee"?',
      a: "Anyone you've added to your Flodok organization with an account. People who only access the public employee portal (read-only, no login) don't count toward your limit.",
    },
    {
      q: 'Can I change plans anytime?',
      a: "Yes. Upgrade instantly — we'll prorate the difference. Downgrade applies at the start of your next billing cycle.",
    },
    {
      q: 'What happens if I exceed my plan limit?',
      a: "Nothing breaks. We'll notify you and your account stays fully functional. You'll have 14 days to upgrade or remove employees before any changes apply.",
    },
    {
      q: 'What payment methods do you accept?',
      a: "Bank transfer (BCA, Mandiri, BNI, BRI), credit card (Visa, Mastercard, JCB), and Indonesian e-wallets (OVO, GoPay, DANA) for monthly plans. Annual contracts can be paid by bank transfer with invoice.",
    },
    {
      q: 'Are there setup fees?',
      a: "No setup fees on Starter or Pro. Scale customers can opt into our white-glove onboarding (priced separately) — but it's never required.",
    },
    {
      q: 'Do you offer non-profit or education discounts?',
      a: "Yes — registered yayasan (foundations) and accredited Indonesian schools get 50% off Pro and Scale plans. Email sales@flodok.com with your registration to claim.",
    },
    {
      q: 'Do you offer custom enterprise plans?',
      a: "For organizations with 500+ employees, complex compliance needs, or air-gapped deployments, we build custom plans. Get in touch and we'll scope it together.",
    },
    {
      q: 'Refund policy?',
      a: "We offer a 30-day money-back guarantee on annual plans. Monthly plans aren't refunded, but you can cancel anytime and you won't be charged again.",
    },
  ]

  return (
    <section className="border-t px-6 py-20" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Pricing FAQ
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Pricing questions, answered.
          </h2>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border px-5 py-4"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between text-base font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                <span>{item.q}</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 transition-transform group-open:rotate-45"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Bottom CTA ─────────────────────────────────────────

function PricingCTA() {
  return (
    <section className="px-6 pb-24 pt-4">
      <div className="mx-auto max-w-4xl">
        <div
          className="rounded-3xl border px-8 py-14 text-center md:px-16"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Still deciding?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Start free — there's no card required. Or talk to us about a custom plan.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Start free →
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              Talk to sales
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
