import { Link } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { getAvatarGradient, getInitials } from '../../lib/avatar'

export function Landing() {
  useTheme() // ensure theme class is applied
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <Nav />
      <Hero />
      <LogoSlider />
      <Benefits />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FAQ />
      <CTASection />
      <Footer />
    </div>
  )
}

// ─── Navbar ─────────────────────────────────────────────

function Nav() {
  const { theme, toggle } = useTheme()
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 85%, transparent)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          Flodok
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex" style={{ color: 'var(--color-text-secondary)' }}>
          <a href="#features" className="transition-colors hover:opacity-70">Features</a>
          <a href="#how-it-works" className="transition-colors hover:opacity-70">How it works</a>
          <a href="#testimonials" className="transition-colors hover:opacity-70">Testimonials</a>
          <a href="#pricing" className="transition-colors hover:opacity-70">Pricing</a>
          <a href="#faq" className="transition-colors hover:opacity-70">FAQ</a>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="hidden rounded-md p-1.5 transition-colors hover:opacity-70 sm:block"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            )}
          </button>
          <Link
            to="/login"
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-70 sm:inline-block"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}

// ─── Hero ───────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 md:pt-24">
      {/* Subtle radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[600px] w-[1100px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--color-primary), transparent 70%)', opacity: 0.12 }}
      />

      <div className="relative mx-auto max-w-6xl text-center">
        {/* Social proof pill */}
        <div
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span className="flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
          Trusted by 100+ Indonesian teams
        </div>

        <h1
          className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl"
          style={{ color: 'var(--color-text)' }}
        >
          The operations OS for Indonesia's best teams.
        </h1>

        <p
          className="mx-auto mt-5 max-w-2xl text-base leading-relaxed md:text-lg"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          SOPs, contracts, performance, and your employee portal — all in one place,
          built from the ground up for how Indonesian companies actually work.
          WIB · WITA · WIT. Bahasa-first.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Start free — no card required
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-bg)',
            }}
          >
            See how it works
          </a>
        </div>

        <p className="mt-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Free for teams up to 10 · 5-minute setup · Cancel anytime
        </p>

        {/* Product mockup */}
        <div className="mt-14">
          <ProductMockup />
        </div>
      </div>
    </section>
  )
}

function ProductMockup() {
  return (
    <div
      className="mx-auto max-w-5xl overflow-hidden rounded-2xl border shadow-2xl"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
        <div
          className="ml-3 hidden rounded-md px-3 py-0.5 text-xs sm:block"
          style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-tertiary)' }}
        >
          app.flodok.com/dashboard
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
        {/* Sidebar */}
        <div
          className="hidden border-r p-3 md:block"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="mb-4 px-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            Acme Indonesia
          </div>
          {[
            'Overview',
            'Employees',
            'SOPs',
            'Contracts',
            'Performance',
            'Pending',
            'Settings',
          ].map((item, i) => (
            <div
              key={item}
              className="mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
              style={{
                backgroundColor: i === 2 ? 'var(--color-bg-tertiary)' : 'transparent',
                color: i === 2 ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontWeight: i === 2 ? 600 : 400,
              }}
            >
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: 'var(--color-border)' }} />
              {item}
            </div>
          ))}
        </div>

        {/* Main panel */}
        <div className="p-5" style={{ backgroundColor: 'var(--color-bg)' }}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>SOPs</div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>24 active · 3 pending review</div>
            </div>
            <div
              className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              + New SOP
            </div>
          </div>

          <div className="space-y-2">
            {[
              { name: 'Customer onboarding playbook', dept: 'Sales', updated: '2 hari yang lalu' },
              { name: 'Cash handling — daily close', dept: 'Operations', updated: '5 hari yang lalu' },
              { name: 'Refund & dispute handling', dept: 'Customer Success', updated: '1 minggu yang lalu' },
              { name: 'New hire — week one checklist', dept: 'People', updated: '2 minggu yang lalu' },
              { name: 'Inventory reconciliation', dept: 'Operations', updated: '3 minggu yang lalu' },
            ].map((sop, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg-secondary)',
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{sop.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{sop.dept} · updated {sop.updated}</div>
                  </div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: 'var(--color-diff-add)',
                    color: 'var(--color-success)',
                  }}
                >
                  Live
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Logo slider ────────────────────────────────────────

function LogoSlider() {
  // Placeholder "logos" — stylized wordmarks. Swap for real assets later.
  const logos = [
    { name: 'Sentana', style: 'font-serif italic' },
    { name: 'KOPI ◆ NUSA', style: 'font-bold tracking-widest text-xs' },
    { name: 'Lumio', style: 'font-light tracking-wide' },
    { name: 'Tanaman.co', style: 'font-mono' },
    { name: 'BERAS PRIMA', style: 'font-black tracking-tight' },
    { name: 'Halo Studio', style: 'font-semibold' },
    { name: 'Pasar Lokal', style: 'font-serif' },
    { name: 'Mitra Niaga', style: 'font-extrabold uppercase tracking-tight' },
  ]
  // Duplicate for seamless marquee loop
  const loop = [...logos, ...logos]

  return (
    <section
      className="border-y py-10"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <p
          className="mb-6 text-center text-xs font-medium uppercase tracking-widest"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Trusted by teams across Indonesia
        </p>

        <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)' }}>
          <div className="flex animate-[marquee_30s_linear_infinite] gap-12 whitespace-nowrap">
            {loop.map((logo, i) => (
              <div
                key={i}
                className={`shrink-0 text-xl ${logo.style}`}
                style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}
              >
                {logo.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Benefits (bento) ───────────────────────────────────

function Benefits() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            Why Flodok
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Stop running your team out of WhatsApp and Google Sheets.
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Flodok replaces the patchwork of tools Indonesian operators reach for —
            with software that actually fits how you work.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2">
          <BentoCard
            className="md:col-span-2"
            title="SOPs that actually get read"
            body="Versioned, searchable, and accessible to every employee in their language. No more PDFs lost in the group chat."
            visual={
              <div className="flex h-32 items-center justify-center gap-2">
                {['v1.0', 'v1.1', 'v2.0', 'v2.3'].map((v, i) => (
                  <div
                    key={v}
                    className="rounded-md border px-3 py-2 text-xs font-mono"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: i === 3 ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                      color: i === 3 ? '#fff' : 'var(--color-text-secondary)',
                      transform: `translateY(${i * -4}px)`,
                    }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            }
          />
          <BentoCard
            title="Contracts without the chaos"
            body="Draft, sign, and store employment contracts. Full version history and audit trail."
            visual={
              <div className="flex h-32 items-end justify-center">
                <div
                  className="h-full w-20 rounded-md border-t-4"
                  style={{
                    borderColor: 'var(--color-primary)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    backgroundImage: 'repeating-linear-gradient(180deg, var(--color-border) 0 1px, transparent 1px 8px)',
                  }}
                />
              </div>
            }
          />
          <BentoCard
            title="Performance reviews that ship"
            body="Lightweight 360s and 1:1 trackers. No more spreadsheet-based reviews that nobody finishes."
            visual={
              <div className="flex h-32 items-end justify-center gap-2 px-6">
                {[40, 70, 55, 90, 65].map((h, i) => (
                  <div
                    key={i}
                    className="w-4 rounded-sm"
                    style={{ height: `${h}%`, backgroundColor: i === 3 ? 'var(--color-primary)' : 'var(--color-border-strong)' }}
                  />
                ))}
              </div>
            }
          />
          <BentoCard
            title="An employee portal worth opening"
            body="Public link. Your team accesses SOPs, announcements, and awards — no login, no IT involvement."
            visual={
              <div className="flex h-32 items-center justify-center">
                <div
                  className="rounded-lg border px-4 py-3 text-xs"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  flodok.com/portal/<span style={{ color: 'var(--color-primary)' }}>acme</span>
                </div>
              </div>
            }
          />
          <BentoCard
            title="Built for Indonesia"
            body="WIB · WITA · WIT time zones. Bahasa-first UI. IDR pricing. Made by people who run businesses here."
            visual={
              <div className="flex h-32 items-center justify-center gap-3 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                {['WIB', 'WITA', 'WIT'].map(z => (
                  <div
                    key={z}
                    className="rounded-md border px-3 py-2"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
                  >
                    {z}
                  </div>
                ))}
              </div>
            }
          />
        </div>
      </div>
    </section>
  )
}

function BentoCard({
  title,
  body,
  visual,
  className = '',
}: {
  title: string
  body: string
  visual: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${className}`}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div className="mb-5">{visual}</div>
      <h3 className="mb-1.5 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {body}
      </p>
    </div>
  )
}

// ─── How it works ───────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Set up your organization',
      body: 'Add your company name, time zone, and brand. Five minutes flat — no onboarding call required.',
    },
    {
      number: '02',
      title: 'Invite your team',
      body: 'One link, sent over WhatsApp or email. Your team is in before they finish their kopi.',
    },
    {
      number: '03',
      title: 'Tighten your operation',
      body: 'Publish SOPs, send contracts, run reviews. Watch the work that used to live in your head become repeatable.',
    },
  ]

  return (
    <section
      id="how-it-works"
      className="border-y px-6 py-24"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            From chaos to clarity in three steps.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map(step => (
            <div
              key={step.number}
              className="rounded-2xl border p-6"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div
                className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-mono font-semibold"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-primary)',
                }}
              >
                {step.number}
              </div>
              <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ────────────────────────────────────────────

function Pricing() {
  const tiers = [
    {
      name: 'Starter',
      price: 'Rp 0',
      cadence: '/ month',
      blurb: 'For small teams getting their operation off the ground.',
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
      price: 'Rp 290.000',
      cadence: '/ month',
      blurb: 'For growing teams that need contracts, reviews, and integrations.',
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
      price: 'Rp 890.000',
      cadence: '/ month',
      blurb: 'For larger operations with custom needs.',
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
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            Pricing
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Simple pricing. No surprises.
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Start free. Upgrade when your team outgrows it. Cancel anytime — we'll never make you talk to anyone.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {tiers.map(tier => (
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
                  {tier.price}
                </span>
                <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  {tier.cadence}
                </span>
              </div>
              <p className="mb-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {tier.blurb}
              </p>

              <Link
                to="/signup"
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
                  <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
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
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          Prices in IDR, billed monthly. Annual plans save 20%.
        </p>
      </div>
    </section>
  )
}

// ─── Testimonials ───────────────────────────────────────

function Testimonials() {
  const quotes = [
    {
      quote:
        "We replaced four different tools with Flodok. Onboarding a new hire used to take us a full week — now it's under a day.",
      name: 'Sari Wijaya',
      role: 'COO',
      company: 'Nusa Coffee Co.',
      id: 'sari-wijaya',
    },
    {
      quote:
        "The fact that it's in Bahasa, supports WITA, and is priced in Rupiah is the only reason my team actually uses it. The other tools we tried felt foreign.",
      name: 'Rian Pratama',
      role: 'Head of People',
      company: 'Lumio Studio',
      id: 'rian-pratama',
    },
    {
      quote:
        "Our SOPs used to live in a Google Drive nobody opened. Now my warehouse team checks Flodok on their phones before every shift.",
      name: 'Dewi Kusuma',
      role: 'Operations Lead',
      company: 'Pasar Lokal',
      id: 'dewi-kusuma',
    },
    {
      quote:
        "Setup took 20 minutes. We had contracts going out the same afternoon. I was bracing for a six-week implementation.",
      name: 'Ahmad Surya',
      role: 'Founder',
      company: 'Halo Studio',
      id: 'ahmad-surya',
    },
  ]

  return (
    <section
      id="testimonials"
      className="border-y px-6 py-24"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            Loved by operators
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            From Jakarta to Makassar to Medan.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {quotes.map(q => (
            <div
              key={q.id}
              className="rounded-2xl border p-7"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div className="mb-5 flex gap-0.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <svg
                    key={i}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
                  </svg>
                ))}
              </div>

              <p className="mb-6 text-base leading-relaxed" style={{ color: 'var(--color-text)' }}>
                "{q.quote}"
              </p>

              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ background: getAvatarGradient(q.id), color: 'var(--color-text)' }}
                >
                  {getInitials(q.name)}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{q.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {q.role} · {q.company}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ────────────────────────────────────────────────

function FAQ() {
  const items = [
    {
      q: 'Is Flodok built specifically for Indonesia?',
      a: "Yes. The product is in Bahasa Indonesia and English, supports WIB / WITA / WIT time zones, and is priced in Rupiah. It's built by people running businesses here — not localized as an afterthought.",
    },
    {
      q: 'Do my employees need to create accounts?',
      a: "No. Every Flodok organization gets a public employee portal with a unique link. Your team can access SOPs, announcements, and awards without logging in. You only need accounts for managers and admins.",
    },
    {
      q: 'Can I import existing SOPs?',
      a: "Yes. Paste from Google Docs, Notion, or Word — Flodok preserves formatting, lists, tables, and links. For larger migrations, our team will handle the import for you on Pro and Scale plans.",
    },
    {
      q: 'How does pricing work?',
      a: "Starter is free forever for teams up to 10. Pro is Rp 290.000/month for up to 50 employees. Scale is Rp 890.000/month for unlimited. All plans are month-to-month — annual saves 20%. Cancel anytime in settings.",
    },
    {
      q: 'Is my data secure?',
      a: "Your data is encrypted in transit and at rest. We're SOC 2 Type I certified and working toward Type II. Data is hosted on infrastructure that supports Indonesian data residency requirements (PP 71/2019).",
    },
    {
      q: 'Do you integrate with payroll or BPJS?',
      a: "Direct payroll and BPJS integrations are on our 2026 roadmap. In the meantime, Flodok exports clean CSVs that work with Mekari Talenta, Gajihub, and most local payroll systems.",
    },
    {
      q: 'Can I cancel anytime?',
      a: "Yes — one click in Settings. No exit calls, no retention emails, no fine print. We'd rather you come back when it's the right fit.",
    },
  ]

  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            FAQ
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Questions, answered.
          </h2>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border px-5 py-4 transition-colors"
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

// ─── CTA Section ────────────────────────────────────────

function CTASection() {
  return (
    <section className="px-6 pb-24">
      <div className="mx-auto max-w-5xl">
        <div
          className="relative overflow-hidden rounded-3xl border px-8 py-16 text-center md:px-16 md:py-20"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-text)',
            color: 'var(--color-bg)',
          }}
        >
          {/* Decorative grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            Run your team like the world's best.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base md:text-lg" style={{ opacity: 0.7 }}>
            Free for teams up to 10. Five minutes to set up. No card. No call.
          </p>

          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              Start free →
            </Link>
            <a
              href="mailto:hello@flodok.com"
              className="inline-flex items-center justify-center rounded-lg border px-6 py-3 text-sm font-semibold transition-colors"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-bg) 30%, transparent)',
                color: 'var(--color-bg)',
              }}
            >
              Talk to sales
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ─────────────────────────────────────────────

function Footer() {
  return (
    <footer
      className="border-t px-6 py-14"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Link to="/" className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
              Flodok
            </Link>
            <p className="mt-3 max-w-xs text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              The operations OS for Indonesia's best teams. Made in Jakarta.
            </p>

            {/* Newsletter */}
            <form
              className="mt-5 flex max-w-sm gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="you@company.com"
                className="flex-1 rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                }}
              />
              <button
                type="submit"
                className="rounded-md px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Subscribe
              </button>
            </form>
          </div>

          <FooterCol
            title="Product"
            links={[
              ['Features', '#features'],
              ['Pricing', '#pricing'],
              ['How it works', '#how-it-works'],
              ['Roadmap', '#'],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ['About', '#'],
              ['Customers', '#testimonials'],
              ['Contact', 'mailto:hello@flodok.com'],
              ['Careers', '#'],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ['Privacy', '#'],
              ['Terms', '#'],
              ['Security', '#'],
              ['DPA', '#'],
            ]}
          />
        </div>

        <div
          className="mt-12 flex flex-col items-start justify-between gap-4 border-t pt-6 text-xs sm:flex-row sm:items-center"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
        >
          <div>© {new Date().getFullYear()} Flodok. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <a href="#" className="transition-colors hover:opacity-70">Twitter</a>
            <a href="#" className="transition-colors hover:opacity-70">LinkedIn</a>
            <a href="#" className="transition-colors hover:opacity-70">Instagram</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </h4>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="text-sm transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
