import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { PricingCalculator } from '../../components/PricingCalculator'
import {
  FREE_EMPLOYEE_LIMIT,
  PRO_BRACKETS,
  PRO_MIN_SEATS,
  calculateProMonthlyIdr,
  formatIdr,
} from '../../lib/pricing'

export function Pricing() {
  return (
    <main>
      <PricingHero />
      <PricingTiers />
      <CalculatorSection />
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
          Start free for up to {FREE_EMPLOYEE_LIMIT} employees. After that, pay per
          seat — and the rate drops as your team grows. Always priced in Rupiah,
          always month-to-month.
        </p>
      </div>
    </section>
  )
}

// ─── Tiers ──────────────────────────────────────────────

function PricingTiers() {
  const proStartingMonthly = calculateProMonthlyIdr(PRO_MIN_SEATS)

  return (
    <section className="px-6 pb-16">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
        {/* Free */}
        <div
          className="relative flex flex-col rounded-2xl border p-7"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            Free
          </div>
          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
              Rp 0
            </span>
            <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              forever
            </span>
          </div>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Try the flow end-to-end before you commit to anything.
          </p>

          <Link
            to="/signup"
            className="mb-6 block rounded-lg px-4 py-2 text-center text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
          >
            Start free
          </Link>

          <ul className="space-y-2.5">
            {[
              `Up to ${FREE_EMPLOYEE_LIMIT} employees`,
              '1 SOP and 1 contract per employee',
              'Public employee portal',
              'Bahasa & English UI · in-app translation',
              'Community support',
            ].map(f => (
              <li
                key={f}
                className="flex items-start gap-2.5 text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <Check />
                <span>{f}</span>
              </li>
            ))}
            <li
              className="flex items-start gap-2.5 text-sm"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <Dash />
              <span>No AI features or integrations</span>
            </li>
          </ul>
        </div>

        {/* Pro */}
        <div
          className="relative flex flex-col rounded-2xl border p-7"
          style={{
            borderColor: 'var(--color-primary)',
            backgroundColor: 'var(--color-bg-secondary)',
            boxShadow: '0 0 0 1px var(--color-primary)',
          }}
        >
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            For growing teams
          </div>

          <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            Pro
          </div>
          <div className="mb-1 flex items-baseline gap-1">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              From
            </span>
            <span className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
              {formatIdr(proStartingMonthly)}
            </span>
            <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              / month
            </span>
          </div>
          <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Per-seat pricing. Get cheaper per seat as your team grows.
            Minimum {PRO_MIN_SEATS} employees.
          </p>

          <Link
            to="/signup"
            className="mb-6 block rounded-lg px-4 py-2 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Start free trial
          </Link>

          <ul className="space-y-2.5">
            {[
              'Unlimited SOPs & contracts',
              'AI-assisted drafting & translation, included',
              'Contracts & e-signatures',
              'Performance reviews · awards · 1:1s',
              'All integrations (Fireflies, Slack, Google)',
              'Priority email support',
            ].map(f => (
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
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
        Need SSO, custom contracts, or a DPA?{' '}
        <Link to="/contact" style={{ color: 'var(--color-primary)' }} className="font-semibold hover:underline">
          Talk to us
        </Link>{' '}
        — we'll scope a custom plan for organizations with 200+ employees or compliance requirements.
      </p>
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
      className="mt-1 shrink-0"
      style={{ color: 'var(--color-text-tertiary)' }}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// ─── Calculator ────────────────────────────────────────

function CalculatorSection() {
  return (
    <section className="border-y px-6 py-20" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Pricing calculator
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            See exactly what you'd pay.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Drag the slider — your bill is the sum of seats in each bracket,
            like income-tax brackets. Adding a seat never makes your total
            cheaper.
          </p>
        </div>

        <PricingCalculator />

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PRO_BRACKETS.map((bracket, i) => {
            const prevCap = i === 0 ? 0 : (PRO_BRACKETS[i - 1].upTo ?? 0)
            const label =
              bracket.upTo === null
                ? `Seats ${prevCap + 1}+`
                : `Seats ${prevCap + 1}–${bracket.upTo}`
            return (
              <div
                key={label}
                className="rounded-xl border p-4 text-center"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                  {label}
                </div>
                <div className="mt-1 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                  {formatIdr(bracket.pricePerSeat)}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  per seat / month
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Comparison table ──────────────────────────────────

function ComparisonTable() {
  const groups: { name: string; rows: { feature: string; values: (boolean | string)[] }[] }[] = [
    {
      name: 'Core',
      rows: [
        { feature: 'Employees', values: [`Up to ${FREE_EMPLOYEE_LIMIT}`, 'Per seat — graduated'] },
        { feature: 'SOPs', values: [`${FREE_EMPLOYEE_LIMIT} max (1 per employee)`, 'Unlimited'] },
        { feature: 'Contracts', values: [`${FREE_EMPLOYEE_LIMIT} max (1 per employee)`, 'Unlimited'] },
        { feature: 'Public employee portal', values: [true, true] },
        { feature: 'Bahasa & English UI', values: [true, true] },
        { feature: 'In-app translation', values: [true, true] },
        { feature: 'WIB · WITA · WIT time zones', values: [true, true] },
      ],
    },
    {
      name: 'AI features',
      rows: [
        { feature: 'AI-drafted SOPs', values: [false, 'Included · fair use'] },
        { feature: 'AI-drafted contracts', values: [false, 'Included · fair use'] },
        { feature: 'Auto-translate documents', values: [false, 'Included · fair use'] },
        { feature: 'Meeting transcript → SOP updates', values: [false, 'Included · fair use'] },
      ],
    },
    {
      name: 'Documents',
      rows: [
        { feature: 'SOP versioning & history', values: [true, true] },
        { feature: 'E-signatures', values: [false, true] },
        { feature: 'Custom contract templates', values: [false, true] },
        { feature: 'Bulk import (CSV / DOCX)', values: [false, true] },
        { feature: 'PDF export', values: [true, true] },
      ],
    },
    {
      name: 'People',
      rows: [
        { feature: 'Employee directory', values: [true, true] },
        { feature: 'Performance reviews', values: [false, true] },
        { feature: '1:1 trackers', values: [false, true] },
        { feature: 'Awards & gamification', values: [false, true] },
      ],
    },
    {
      name: 'Integrations',
      rows: [
        { feature: 'Fireflies (meeting notes)', values: [false, true] },
        { feature: 'Slack notifications', values: [false, true] },
        { feature: 'Google Workspace SSO', values: [false, true] },
        { feature: 'SAML SSO', values: [false, 'Custom plan'] },
        { feature: 'Webhook API', values: [false, 'Custom plan'] },
      ],
    },
    {
      name: 'Support',
      rows: [
        { feature: 'Community support', values: [true, true] },
        { feature: 'Email support', values: [false, true] },
        { feature: 'Priority response (< 4h)', values: [false, true] },
        { feature: 'Onboarding & training', values: [false, 'Self-serve · paid white-glove'] },
      ],
    },
  ]

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
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
                {['Free', 'Pro'].map((name, i) => (
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
                      colSpan={3}
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
    <section className="border-y px-6 py-20" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
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
                backgroundColor: 'var(--color-bg)',
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
      q: 'How does per-seat pricing actually work?',
      a: `We use graduated brackets, like income-tax brackets. Seats 1–15 are always Rp ${(80_000).toLocaleString('id-ID')} each. Seats 16–40 are always Rp ${(50_000).toLocaleString('id-ID')} each. Seats 41+ are always Rp ${(30_000).toLocaleString('id-ID')} each. Your monthly bill is the sum across the brackets your team fills. Adding a seat never makes your total cheaper.`,
    },
    {
      q: 'What happens when I add or remove an employee mid-cycle?',
      a: "Nothing painful. You add or remove the employee in Flodok and we update your seat count with our payment processor. The cost difference is prorated and shows up on your next monthly invoice — no surprise mid-month charge, no need to re-enter your card. Removing employees works the same way: you get a prorated credit applied to the next bill.",
    },
    {
      q: 'What counts as an "employee"?',
      a: "Anyone you've added to your Flodok organization with an account. People who only access the public employee portal (read-only, no login) don't count toward your seat count.",
    },
    {
      q: 'Why is there a 3-employee minimum on Pro?',
      a: `The Free plan covers solo founders and 2-person teams forever — that's its job. Pro is built for teams large enough to justify contracts, performance reviews, and integrations, so it starts at ${PRO_MIN_SEATS} seats. If you only have ${FREE_EMPLOYEE_LIMIT} people, Free almost certainly does what you need.`,
    },
    {
      q: 'How is my AI usage billed?',
      a: "It isn't. AI-drafted SOPs, contract drafting, document translation, and meeting-transcript processing are all included on Pro under a fair-use policy. We'll only reach out if usage is materially above what a normal team would generate — and we'd rather move you to a custom plan than slap on usage fees.",
    },
    {
      q: 'What payment methods do you accept?',
      a: "Bank transfer (BCA, Mandiri, BNI, BRI), credit card (Visa, Mastercard, JCB), and Indonesian e-wallets (OVO, GoPay, DANA) for monthly plans. Annual contracts can be paid by bank transfer with a Faktur Pajak.",
    },
    {
      q: 'Are there setup fees?',
      a: "No. Self-serve onboarding is included on every plan — including Free. White-glove migration and on-site training are available as paid add-ons but never required.",
    },
    {
      q: 'Do you offer non-profit or education discounts?',
      a: "Yes — registered yayasan (foundations) and accredited Indonesian schools get 50% off Pro. Email sales@flodok.com with your registration to claim.",
    },
    {
      q: 'Do you offer custom enterprise plans?',
      a: "For organizations with 200+ employees, SSO/SAML requirements, custom contracts, or compliance needs (DPA, audit reports, air-gapped deployments), we build custom plans. Get in touch and we'll scope it together.",
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
