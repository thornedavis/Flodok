import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { isPro } from '../../lib/billing'
import { SUPPORT_CONTACTS, whatsAppLinkFor } from '../../lib/supportContacts'

// Unified contact surface. Reachable from both `/contact` (public marketing
// nav, redirected) and `/help/contact` (in-app help center sidebar). Same
// component, same content — the redirect just funnels everyone through one
// experience.
//
// Pro-gated WhatsApp: logged-in customers on an active Pro subscription
// see a direct "Chat on WhatsApp" CTA that deep-links to the owner's
// WhatsApp with a prefilled greeting. Anyone else (anonymous or Free) sees
// the WhatsApp channel described but pointed at the upgrade flow instead.

type SupportContext =
  | { kind: 'anonymous' }
  | { kind: 'free'; orgName: string | null }
  | { kind: 'pro'; orgName: string | null }

export function HelpContact() {
  const ctx = useSupportContext()

  return (
    <div className="-mt-2 max-w-3xl">
      <ContactHero />
      <section className="mb-12">
        <ContactForm ctx={ctx} />
      </section>
      <OtherChannels ctx={ctx} />
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────

function ContactHero() {
  return (
    <header className="mb-8">
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
      <p className="mt-4 max-w-2xl text-base md:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
        Sales questions, support tickets, partnership ideas, kopi recommendations —
        send us a note and we'll reply within one business day. Most questions
        are already covered in the{' '}
        <Link to="/help/faq" style={{ color: 'var(--color-primary)' }}>FAQ</Link>{' '}
        — worth a quick scan first.
      </p>
    </header>
  )
}

// ─── Form ────────────────────────────────────────────────

function ContactForm({ ctx }: { ctx: SupportContext }) {
  const [submitted, setSubmitted] = useState(false)
  const [topic, setTopic] = useState<'support' | 'sales' | 'partnership' | 'other'>(
    ctx.kind === 'pro' || ctx.kind === 'free' ? 'support' : 'sales',
  )
  const [category, setCategory] = useState('')

  const inputStyle: React.CSSProperties = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  if (submitted) {
    return (
      <div
        className="rounded-2xl border p-8"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
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
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
      }}
      className="space-y-5 rounded-2xl border p-8"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {/* Topic radio cards */}
      <div>
        <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          What's this about?
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { v: 'support', label: 'Support' },
              { v: 'sales', label: 'Sales' },
              { v: 'partnership', label: 'Partnership' },
              { v: 'other', label: 'Other' },
            ] as const
          ).map((opt) => (
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

      {/* Category dropdown — only meaningful for support tickets */}
      {topic === 'support' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Category
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
            <option value="hiring">Hiring & candidates</option>
            <option value="contracts">Contracts & e-signatures</option>
            <option value="sops">SOPs</option>
            <option value="portal">Employee portal</option>
            <option value="billing">Billing & invoices</option>
            <option value="bug">Something's broken (bug)</option>
            <option value="feature">Feature request</option>
            <option value="security">Security / data protection</option>
            <option value="other">Other</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <input type="text" required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label="Work email" required>
          <input type="email" required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>

      {topic === 'sales' && (
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
      )}

      <Field label="Message" required>
        <textarea
          required
          rows={5}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={inputStyle}
          placeholder={topic === 'support' ? 'What can we help with?' : "Tell us a bit about what you're working on…"}
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
        <Link to="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>.
      </p>
    </form>
  )
}

// ─── Channels (Email, WhatsApp Pro-gated, Status) ───────

function OtherChannels({ ctx }: { ctx: SupportContext }) {
  return (
    <section className="mb-12">
      <h2 className="mb-5 text-xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
        Or reach us another way
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ChannelCard
          icon={<EmailIcon />}
          title="Email"
          body="Send us a message and we'll respond within one business day."
          actionLabel={SUPPORT_CONTACTS.emailSupport}
          href={`mailto:${SUPPORT_CONTACTS.emailSupport}`}
        />
        <WhatsAppChannel ctx={ctx} />
        <ChannelCard
          icon={<StatusIcon />}
          title="Status page"
          body="Real-time uptime and incident updates."
          actionLabel={SUPPORT_CONTACTS.statusPageDisplay}
          href={SUPPORT_CONTACTS.statusPageUrl}
        />
      </div>
    </section>
  )
}

function WhatsAppChannel({ ctx }: { ctx: SupportContext }) {
  if (ctx.kind === 'pro') {
    return (
      <ChannelCard
        icon={<WhatsAppIcon />}
        title="WhatsApp"
        body="Direct line to the founder. Click to start a chat — included with your Pro subscription."
        actionLabel="Chat on WhatsApp"
        href={whatsAppLinkFor(ctx.orgName)}
        accent
      />
    )
  }
  // Free / anonymous → describe the channel and point at upgrade.
  return (
    <ChannelCard
      icon={<WhatsAppIcon />}
      title="WhatsApp"
      body="Direct WhatsApp support is included with Pro. Free customers and visitors get the same response time via email."
      actionLabel={ctx.kind === 'free' ? 'Upgrade to Pro' : 'See Pro features'}
      href={ctx.kind === 'free' ? '/dashboard/settings' : '/pricing'}
    />
  )
}

// ─── Reusable bits ───────────────────────────────────────

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

function ChannelCard({ icon, title, body, actionLabel, href, accent }: {
  icon: React.ReactNode
  title: string
  body: string
  actionLabel: string
  href: string
  accent?: boolean
}) {
  const isExternal = href.startsWith('http') || href.startsWith('mailto:')
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="rounded-2xl border p-6 transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{
        borderColor: accent ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      <div
        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
        style={{
          backgroundColor: accent ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--color-bg-tertiary)',
          color: accent ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        }}
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {body}
      </p>
      <p className="mt-3 text-sm font-semibold" style={{ color: accent ? 'var(--color-primary)' : 'var(--color-primary)' }}>
        {actionLabel} →
      </p>
    </a>
  )
}

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1s-1.2-.5-2.3-1.4c-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2 0 1.3.9 2.6 1.1 2.7.1.2 1.8 2.7 4.3 3.8 1.6.7 2.2.7 3 .6.5-.1 1.7-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.2-.3-.2-.6-.3z M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5-1.3c1.5.8 3.2 1.3 5 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
    </svg>
  )
}

function StatusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

// ─── Auth + plan detection ───────────────────────────────

// HelpCenterLayout doesn't mount BillingProvider (that's dashboard-only),
// so this page does its own session + org-billing fetch. Returns:
//   anonymous → no session
//   free      → logged in, plan_tier !== pro OR subscription not active
//   pro       → logged in, isPro(org) === true
function useSupportContext(): SupportContext {
  const [ctx, setCtx] = useState<SupportContext>({ kind: 'anonymous' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) return

      const { data: userRow } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', session.user.id)
        .single()
      if (!userRow?.org_id) {
        if (!cancelled) setCtx({ kind: 'free', orgName: null })
        return
      }

      const { data: orgRow } = await supabase
        .from('organizations')
        .select('name, display_name, plan_tier, subscription_status')
        .eq('id', userRow.org_id)
        .single()
      if (cancelled) return
      if (!orgRow) {
        setCtx({ kind: 'free', orgName: null })
        return
      }

      const orgName = orgRow.display_name || orgRow.name || null
      if (isPro(orgRow)) setCtx({ kind: 'pro', orgName })
      else setCtx({ kind: 'free', orgName })
    }

    load()
    return () => { cancelled = true }
  }, [])

  return ctx
}
