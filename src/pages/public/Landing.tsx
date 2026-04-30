import { Link } from 'react-router-dom'
import { getAvatarGradient, getInitials } from '../../lib/avatar'
import { InteractiveDemo } from '../../components/landing/InteractiveDemo'
import { SiteFooter } from '../../components/PublicSiteLayout'
import { PricingCalculator } from '../../components/PricingCalculator'
import { FREE_EMPLOYEE_LIMIT, PRO_MIN_SEATS, calculateProMonthlyIdr, formatIdr } from '../../lib/pricing'

export function Landing() {
  return (
    <>
      <Hero />
      <LogoSlider />
      <Benefits />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <FAQ />
      <CTASection />
    </>
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
          Free for up to 2 employees · 5-minute setup · Cancel anytime
        </p>

        {/* Interactive product demo */}
        <div className="mt-14">
          <div className="mx-auto mb-3 flex max-w-5xl items-end justify-end gap-1.5 pr-3">
            <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
              Interactive demo — click anywhere
            </span>
            <svg
              width="28" height="28" viewBox="0 0 28 28" fill="none"
              stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--color-text-tertiary)' }}
              aria-hidden
            >
              <path d="M3 4 C 14 6, 22 12, 23 24" />
              <polyline points="19 20 23 24 26 20" />
            </svg>
          </div>
          <InteractiveDemo />
        </div>
      </div>
    </section>
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
      number: '1',
      title: 'Set up your organization',
      body: 'Add your company name, time zone, and brand. Five minutes flat — no onboarding call required.',
    },
    {
      number: '2',
      title: 'Invite your team',
      body: 'One link, sent over WhatsApp or email. Your team is in before they finish their kopi.',
    },
    {
      number: '3',
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
                className="mb-3 text-5xl font-semibold leading-none tracking-tight md:text-6xl"
                style={{ color: 'var(--color-primary)' }}
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
  const proStartingMonthly = calculateProMonthlyIdr(PRO_MIN_SEATS)

  const features = {
    free: [
      `Up to ${FREE_EMPLOYEE_LIMIT} employees`,
      '1 SOP and 1 contract per employee',
      'Public employee portal',
      'Bahasa & English UI · in-app translation',
    ],
    pro: [
      'Unlimited SOPs & contracts',
      'AI drafting & translation, included',
      'Contracts, e-signatures, performance reviews',
      'All integrations (Fireflies, Slack, Google)',
    ],
  }

  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            Pricing
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Pay per seat. Get cheaper as you grow.
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Free for the first {FREE_EMPLOYEE_LIMIT} employees. After that, graduated
            per-seat pricing — drag the slider to see your bill.
          </p>
        </div>

        {/* Two tier summary */}
        <div className="mx-auto mb-8 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          <div
            className="rounded-2xl border p-6"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              Free
            </div>
            <div className="mb-3 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                Rp 0
              </span>
              <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>forever</span>
            </div>
            <ul className="space-y-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {features.free.map(f => (
                <li key={f} className="flex items-start gap-2"><PriceCheck /><span>{f}</span></li>
              ))}
            </ul>
          </div>

          <div
            className="rounded-2xl border p-6"
            style={{
              borderColor: 'var(--color-primary)',
              backgroundColor: 'var(--color-bg-secondary)',
              boxShadow: '0 0 0 1px var(--color-primary)',
            }}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
              Pro · from {formatIdr(proStartingMonthly)}/mo
            </div>
            <div className="mb-3 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
                Rp 80k → 30k
              </span>
              <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>per seat</span>
            </div>
            <ul className="space-y-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {features.pro.map(f => (
                <li key={f} className="flex items-start gap-2"><PriceCheck /><span>{f}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {/* Calculator */}
        <div className="mx-auto max-w-3xl">
          <PricingCalculator />
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Start free →
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-bg)',
            }}
          >
            See full comparison
          </Link>
        </div>
      </div>
    </section>
  )
}

function PriceCheck() {
  return (
    <svg
      width="14"
      height="14"
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

// ─── Testimonials ───────────────────────────────────────

type Testimonial = { id: string; name: string; role: string; company: string; quote: string }

const TESTIMONIALS: Testimonial[] = [
  { id: 'sari-wijaya',     name: 'Sari Wijaya',     role: 'COO',                 company: 'Nusa Coffee Co.', quote: "We replaced four different tools with Flodok. Onboarding a new hire used to take us a full week — now it's under a day." },
  { id: 'rian-pratama',    name: 'Rian Pratama',    role: 'Head of People',      company: 'Lumio Studio',    quote: "The fact that it's in Bahasa, supports WITA, and is priced in Rupiah is the only reason my team actually uses it." },
  { id: 'dewi-kusuma',     name: 'Dewi Kusuma',     role: 'Operations Lead',     company: 'Pasar Lokal',     quote: "Our SOPs used to live in a Google Drive nobody opened. My warehouse team checks Flodok on their phones before every shift now." },
  { id: 'ahmad-surya',     name: 'Ahmad Surya',     role: 'Founder',             company: 'Halo Studio',     quote: "Setup took 20 minutes. We had contracts going out the same afternoon. I was bracing for a six-week implementation." },
  { id: 'maya-indrawati',  name: 'Maya Indrawati',  role: 'HR Director',         company: 'Tanaman.co',      quote: "The public employee portal sold me. No accounts, no IT tickets — staff just open the link and everything is there." },
  { id: 'reza-maulana',    name: 'Reza Maulana',    role: 'CTO',                 company: 'Sentana',         quote: "Engineers actually keep our deploy SOP up to date now because suggesting an edit is one tap from the portal." },
  { id: 'putri-lestari',   name: 'Putri Lestari',   role: 'Customer Success',    company: 'Beautify ID',     quote: "Every CS rep handles refunds the same way. Our customer satisfaction stopped depending on which agent you got." },
  { id: 'budi-santoso',    name: 'Budi Santoso',    role: 'Operations Manager',  company: 'BERAS PRIMA',     quote: "Cycle counts went from 'whoever was free' to a documented procedure. Our shrinkage dropped by half in one quarter." },
  { id: 'citra-permata',   name: 'Citra Permata',   role: 'Founder',             company: 'Mitra Niaga',     quote: "I onboarded our 30th employee last week without any of the chaos that came with the 10th. Flodok carried that." },
  { id: 'eko-wijaya',      name: 'Eko Wijaya',      role: 'General Manager',     company: 'KOPI ◆ NUSA',     quote: "The credits-as-allowance system is the cleverest performance tool I've used. Staff care about it because it's real money." },
  { id: 'sinta-dewi',      name: 'Sinta Dewi',      role: 'Co-founder',          company: 'JogjaTech',       quote: "Bahasa-first contracts that look professional, with the merge fields filling themselves in. Our legal team finally relaxed." },
  { id: 'hendra-kusumo',   name: 'Hendra Kusumo',   role: 'Director',            company: 'Pasar Lokal',     quote: "We rolled this out across three offices in a week. Same SOPs, same contracts, same standard — finally." },
]

function Testimonials() {
  const half = Math.ceil(TESTIMONIALS.length / 2)
  const rowA = TESTIMONIALS.slice(0, half)
  const rowB = TESTIMONIALS.slice(half)

  return (
    <section
      id="testimonials"
      className="border-y py-24"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div className="mb-14 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            Loved by operators
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            From Jakarta to Makassar to Medan.
          </h2>
        </div>
      </div>

      <div
        className="group/marquee space-y-4"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
        }}
      >
        <TestimonialMarqueeRow quotes={rowA} duration={70} reverse={false} />
        <TestimonialMarqueeRow quotes={rowB} duration={85} reverse={true} />
      </div>
    </section>
  )
}

function TestimonialMarqueeRow({
  quotes, duration, reverse,
}: {
  quotes: Testimonial[]
  duration: number
  reverse: boolean
}) {
  // Duplicate so the loop is seamless — at translate -50% the second copy
  // sits exactly where the first started.
  const loop = [...quotes, ...quotes]
  const animation = `marquee ${duration}s linear infinite${reverse ? ' reverse' : ''}`
  return (
    <div className="overflow-hidden">
      <div
        className="flex w-max gap-4 group-hover/marquee:[animation-play-state:paused]"
        style={{ animation }}
      >
        {loop.map((q, i) => (
          <TestimonialCard key={`${q.id}-${i}`} quote={q} />
        ))}
      </div>
    </div>
  )
}

function TestimonialCard({ quote }: { quote: Testimonial }) {
  return (
    <div
      className="flex w-[340px] shrink-0 flex-col rounded-2xl border p-6 sm:w-[380px]"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: getAvatarGradient(quote.id), color: 'var(--color-text)' }}
        >
          {getInitials(quote.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{quote.name}</div>
          <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {quote.role} · {quote.company}
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-0.5">
        {[0, 1, 2, 3, 4].map(i => (
          <svg
            key={i}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: 'var(--color-warning)' }}
          >
            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
          </svg>
        ))}
      </div>

      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        "{quote.quote}"
      </p>
    </div>
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
      a: "Yes. Paste from Google Docs, Notion, or Word — Flodok preserves formatting, lists, tables, and links. For larger migrations, our team will handle the import for you on Pro as a paid add-on.",
    },
    {
      q: 'How does pricing work?',
      a: "Free forever for up to 2 employees (1 SOP and 1 contract per employee). Beyond that, Pro uses graduated per-seat pricing: Rp 80.000 each for seats 1–15, Rp 50.000 each for seats 16–40, and Rp 30.000 each for seats 41+, with a 3-employee minimum. AI features and integrations are bundled in Pro under fair use. All plans month-to-month, annual saves 20%.",
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

// ─── CTA Section + footer + giant wordmark ──────────────
// Gradient backdrop runs full-width and continues behind the footer; the
// final flourish is a huge "Flodok" wordmark sliced in half at the very
// bottom — only the upper half visible.

function CTASection() {
  return (
    <section
      className="relative isolate overflow-hidden"
      style={{
        // All-blue palette, kept calm and centered. Stack order matters —
        // the topmost layer here is the soft top fade that gives breathing
        // room above the blobs (no hard color line at the section seam).
        backgroundImage:
          // Top fade — keeps the first ~18% nearly black so the section
          // blends into whatever sits above it, then becomes transparent.
          'linear-gradient(180deg, #04070d 0%, rgba(4,7,13,0.6) 12%, transparent 22%),' +
          // Brand blue glow, slightly off-centre, the dominant shape.
          'radial-gradient(ellipse 60% 55% at 38% 48%, rgba(59, 130, 246, 0.42) 0%, transparent 65%),' +
          // Deeper blue (blue-700), right side, lower — adds depth on the
          // opposite axis without competing for attention.
          'radial-gradient(ellipse 55% 50% at 78% 68%, rgba(29, 78, 216, 0.38) 0%, transparent 65%),' +
          // Soft sky-blue accent, bottom-left, subtle.
          'radial-gradient(ellipse 50% 45% at 18% 80%, rgba(14, 165, 233, 0.28) 0%, transparent 70%),' +
          // Faint glow seating the giant wordmark at the bottom.
          'radial-gradient(ellipse 90% 30% at 50% 108%, rgba(96, 165, 250, 0.18) 0%, transparent 70%),' +
          // Base — slight mid-section lift, otherwise near-black throughout.
          'linear-gradient(180deg, #04070d 0%, #060b18 55%, #04070d 100%)',
        color: '#ffffff',
      }}
    >
      {/* Subtle grain so the gradient doesn't band on flat displays */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* CTA copy */}
      <div className="relative px-6 pb-20 pt-28 text-center md:pb-24 md:pt-32">
        <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
          Run your team like the world's best.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-base md:text-lg" style={{ color: 'rgba(255,255,255,0.75)' }}>
          Free for up to 2 employees. Five minutes to set up. No card. No call.
        </p>

        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
          >
            Start free →
          </Link>
          <a
            href="mailto:hello@flodok.com"
            className="inline-flex items-center justify-center rounded-lg border px-6 py-3 text-sm font-semibold transition-colors"
            style={{
              borderColor: 'rgba(255,255,255,0.3)',
              color: '#ffffff',
            }}
          >
            Talk to sales
          </a>
        </div>
      </div>

      {/* Footer rendered transparently so the gradient bleeds through */}
      <div className="relative">
        <SiteFooter transparent />
      </div>

      {/* Giant cut-off wordmark — top half only, sitting flush with the
          bottom edge. translate-y-1/2 hides the lower half; overflow-hidden
          on the section clips the rest. */}
      <div aria-hidden className="relative pt-8">
        <div
          className="select-none whitespace-nowrap text-center font-semibold leading-[0.8] tracking-tighter"
          style={{
            fontSize: 'clamp(120px, 28vw, 480px)',
            color: 'rgba(255,255,255,0.08)',
            transform: 'translateY(38%)',
          }}
        >
          Flodok
        </div>
      </div>
    </section>
  )
}

