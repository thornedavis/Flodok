import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAvatarGradient, getInitials } from '../../lib/avatar'
import { InteractiveDemo } from '../../components/landing/InteractiveDemo'
import { MobilePortalMock } from '../../components/landing/MobilePortalMock'
import { SiteFooter } from '../../components/PublicSiteLayout'
import { PricingCalculator } from '../../components/PricingCalculator'
import { FREE_EMPLOYEE_LIMIT, PRO_MIN_SEATS, calculateProMonthlyIdr, formatIdr } from '../../lib/pricing'
import { ensureSignatureFontsLoaded } from '../../lib/signatureFonts'
import { CompensationRing, ShieldPath, WalletPath, CoinPath, GiftPath } from '../../components/portal/CompensationRing'
import heroImageUrl from '../../assets/flodok-hero-illustration.webp'

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
    <section className="relative overflow-hidden pb-20 pt-2 md:pt-4">
      <div className="relative mx-auto max-w-6xl px-6">
        {/* Two-column hero: text on the left, illustration slot on the right.
            Stacks on mobile (single column) — illustration is hidden until md. */}
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
          <div className="text-left">
            {/* Social proof pill */}
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
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
              className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl"
              style={{ color: 'var(--color-text)' }}
            >
              The operations app for Indonesia's best teams.
            </h1>

            <p
              className="mt-5 text-base leading-relaxed md:text-lg"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              SOPs, contracts, performance, and your employee portal — all in one place,
              built from the ground up for how Indonesian companies actually work.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
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
          </div>

          {/* Right column: hero illustration with the soft blue radial glow
              positioned directly behind it. */}
          <div className="relative hidden md:block">
            <div
              aria-hidden
              className="hero-glow pointer-events-none absolute inset-0 -z-0 rounded-full blur-2xl"
              style={{
                background: 'radial-gradient(closest-side, var(--color-primary), transparent 75%)',
              }}
            />
            <img
              src={heroImageUrl}
              alt=""
              className="relative w-full"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>

        {/* Interactive product demo + mobile portal mock overlay */}
        <div className="relative mt-14">
          {/* Desktop demo column — left-aligned and slightly narrowed on
              lg+ so the phone mock can lean against its bottom-right
              without covering too much of the dashboard. */}
          <div className="lg:max-w-[calc(100%-80px)] xl:max-w-[calc(100%-120px)]">
            <div className="mb-3 flex items-end justify-end gap-1.5 pr-3">
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

          {/* Phone — desktop only, positioned at bottom-right, peeking
              out past the demo's bottom and right edges. */}
          <div
            className="pointer-events-auto absolute bottom-0 right-0 z-10 hidden lg:block"
            style={{ transform: 'translate(8px, 40px)' }}
          >
            <MobilePortalMock />
          </div>
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
  useEffect(() => { ensureSignatureFontsLoaded() }, [])
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
            Why Flodok
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Everything to streamline your business, finally in one place.
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--color-text-secondary)' }}>
            From SOPs to signatures to incentives — six workflows, purpose-built
            for the way Indonesia actually runs.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-2">
          <BentoCard
            title="Dynamic SOP management"
            bullets={['Full version history with diffs', 'Bahasa & English side by side', 'Section-level edits and comments']}
            visual={<SopVisual />}
          />
          <BentoCard
            title="End-to-end contracts"
            bullets={['Native e-signature for both sides', 'Templates with org-wide variables', 'Tamper-evident audit trail']}
            visual={<ContractVisual />}
          />
          <BentoCard
            title="AI meeting intelligence"
            bullets={['Fireflies integration for meeting transcripts', 'AI-drafted SOP and contract edits', 'Human-approved before anything goes live']}
            visual={<AIVisual />}
          />
          <BentoCard
            title="Performance & incentives"
            bullets={['Custom badge & achievement library', 'Payroll credits and deductions', 'Public recognition on the portal']}
            visual={<PerformanceVisual />}
          />
          <BentoCard
            title="Personalized employee portal"
            bullets={['One link, zero IT setup', 'Personalized for each employee', 'Pay, contracts, and achievements in one view']}
            visual={<PortalVisual />}
          />
          <BentoCard
            title="Team-wide announcements"
            bullets={['Critical, Important, and FYI priority levels', 'Required "I\'ve read this" acknowledgements', 'Live read and ack counts per post']}
            visual={<SpotlightVisual />}
          />
        </div>
      </div>
    </section>
  )
}

// ─── Bento card visuals ─────────────────────────────────
//
// Each visual mirrors a real Flodok app surface, using demo data and
// styling that matches src/components/landing/InteractiveDemo.tsx so
// they read as scaled-down screenshots of the product. Static state =
// full composition visible. On group:hover, `bento-anim-*` classes loop
// the slide-in sequence (see index.css).

// Shared demo employees — names lifted from InteractiveDemo so the bento
// cards and the hero demo feel like the same Acme Indonesia tenant.
const BENTO_EMPLOYEES = [
  { id: 'e1', name: 'Sari Wijaya',   dept: 'Operations' },
  { id: 'e3', name: 'Dewi Kusuma',   dept: 'Operations' },
  { id: 'e5', name: 'Putri Lestari', dept: 'Customer Success' },
  { id: 'e2', name: 'Rian Pratama',  dept: 'Engineering' },
] as const

function MiniAvatar({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: getAvatarGradient(id),
        color: 'var(--color-text)',
        fontSize: Math.max(8, Math.round(size * 0.36)),
      }}
    >
      {getInitials(name)}
    </div>
  )
}

function MiniDeptPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-medium"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
    >
      {children}
    </span>
  )
}

// SOP detail mini-screenshot: title + dept pill + faux body lines on the
// left, version history sidebar on the right (latest version highlighted).
// Animation: title/body fade up, then version chips cascade in from the right.
function SopVisual() {
  const versions = [
    { v: '2.3', current: true,  when: '2 hari' },
    { v: '2.0', current: false, when: '3 minggu' },
    { v: '1.1', current: false, when: '2 bulan' },
    { v: '1.0', current: false, when: '6 bulan' },
  ]
  const owner = BENTO_EMPLOYEES[0] // Sari Wijaya
  return (
    <div className="grid h-full grid-cols-[1fr_72px] gap-2 p-3">
      {/* Left: SOP doc */}
      <div className="flex flex-col gap-1.5">
        <div className="bento-anim bento-anim-up flex items-center gap-1" style={{ animationDelay: '0.1s' }}>
          <MiniDeptPill>Sales</MiniDeptPill>
          <MiniDeptPill>Onboarding</MiniDeptPill>
          <span className="ml-auto text-[7px]" style={{ color: 'var(--color-success)' }}>● Live</span>
        </div>
        <div className="bento-anim bento-anim-up text-[10px] font-semibold leading-tight" style={{ animationDelay: '0.2s', color: 'var(--color-text)' }}>
          Customer onboarding playbook
        </div>
        <div className="bento-anim bento-anim-up flex items-center gap-1" style={{ animationDelay: '0.25s' }}>
          <MiniAvatar id={owner.id} name={owner.name} size={11} />
          <span className="truncate text-[7px]" style={{ color: 'var(--color-text-tertiary)' }}>{owner.name} · 2 hari yang lalu</span>
        </div>
        {/* Faux EN/ID tabs */}
        <div className="bento-anim bento-anim-up flex items-center gap-1 border-b" style={{ animationDelay: '0.3s', borderColor: 'var(--color-border)' }}>
          <span className="-mb-px border-b-2 px-1 pb-0.5 text-[7px] font-medium" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}>EN</span>
          <span className="px-1 pb-0.5 text-[7px]" style={{ color: 'var(--color-text-tertiary)' }}>ID</span>
          <span className="ml-auto pb-0.5 text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>auto-translate</span>
        </div>
        {/* Faux body — H3 + paragraph + list */}
        <div className="flex flex-col gap-1">
          <div className="bento-anim bento-anim-up h-1.5 w-2/5 rounded-full" style={{ animationDelay: '0.35s', backgroundColor: 'var(--color-text-secondary)', opacity: 0.6 }} />
          <div className="bento-anim bento-anim-up h-1 w-full rounded-full" style={{ animationDelay: '0.4s', backgroundColor: 'var(--color-border-strong)' }} />
          <div className="bento-anim bento-anim-up h-1 w-5/6 rounded-full" style={{ animationDelay: '0.45s', backgroundColor: 'var(--color-border)' }} />
          <div className="bento-anim bento-anim-up flex items-start gap-1" style={{ animationDelay: '0.5s' }}>
            <span className="mt-0.5 inline-block h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-text-tertiary)' }} />
            <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>
          <div className="bento-anim bento-anim-up flex items-start gap-1" style={{ animationDelay: '0.55s' }}>
            <span className="mt-0.5 inline-block h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-text-tertiary)' }} />
            <div className="h-1 w-4/5 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>
          <div className="bento-anim bento-anim-up flex items-start gap-1" style={{ animationDelay: '0.6s' }}>
            <span className="mt-0.5 inline-block h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-text-tertiary)' }} />
            <div className="h-1 w-2/3 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
          </div>
        </div>
        {/* AI assist callout */}
        <div
          className="bento-anim bento-anim-fade mt-auto flex items-center gap-1 rounded border-l-2 px-1.5 py-1"
          style={{
            animationDelay: '0.75s',
            borderColor: 'var(--color-primary)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <span className="text-[8px]">✨</span>
          <span className="text-[7px]" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>AI assist</span> — suggest an edit
          </span>
        </div>
      </div>
      {/* Right: version history */}
      <div
        className="flex flex-col gap-1 rounded-md border p-1.5"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="text-[7px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>VERSIONS</div>
        {versions.map((v, i) => (
          <div
            key={v.v}
            className="bento-anim bento-anim-right flex flex-col rounded px-1 py-0.5"
            style={{
              animationDelay: `${0.2 + i * 0.12}s`,
              backgroundColor: v.current ? 'var(--color-primary)' : 'transparent',
              color: v.current ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            <div className="flex items-center justify-between text-[8px] font-mono">
              <span>v{v.v}</span>
              {v.current && <span className="text-[6px] opacity-80">now</span>}
            </div>
            <span className="text-[6px]" style={{ opacity: v.current ? 0.85 : 0.5 }}>{v.when}</span>
          </div>
        ))}
        <div className="mt-auto border-t pt-1 text-center text-[6px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          + 8 more
        </div>
      </div>
    </div>
  )
}

// Contract detail mini-screenshot: title row + faux terms + signature
// block with a Caveat-script signature and Verified pill.
// Animation: terms fade up, signature fades in, then the Verified pill.
function ContractVisual() {
  const emp = BENTO_EMPLOYEES[0] // Sari Wijaya
  const terms = [
    { label: 'Base wage',  value: 'Rp 25.000.000' },
    { label: 'Allowance',  value: 'Rp 4.000.000' },
    { label: 'Start date', value: '12 Jan 2025' },
    { label: 'Hours / day', value: '8' },
  ]
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      {/* Header */}
      <div className="bento-anim bento-anim-up flex items-center justify-between" style={{ animationDelay: '0.1s' }}>
        <div className="flex min-w-0 items-center gap-1.5">
          <MiniAvatar id={emp.id} name={emp.name} size={16} />
          <div className="min-w-0">
            <div className="truncate text-[9px] font-semibold" style={{ color: 'var(--color-text)' }}>Employment agreement</div>
            <div className="truncate text-[7px]" style={{ color: 'var(--color-text-tertiary)' }}>{emp.name} · {emp.dept}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[6px]" style={{ color: 'var(--color-success)' }}>● Active</span>
          <span className="text-[7px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>v1.0</span>
        </div>
      </div>
      {/* Terms grid 2×2 */}
      <div className="grid grid-cols-2 gap-1">
        {terms.map((t, i) => (
          <div
            key={t.label}
            className="bento-anim bento-anim-up rounded border px-1.5 py-1"
            style={{
              animationDelay: `${0.2 + i * 0.08}s`,
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div className="text-[6px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.label}</div>
            <div className="truncate text-[8px] font-medium" style={{ color: 'var(--color-text)' }}>{t.value}</div>
          </div>
        ))}
      </div>
      {/* Body lines preview */}
      <div className="bento-anim bento-anim-up flex flex-col gap-1" style={{ animationDelay: '0.5s' }}>
        <div className="h-1 w-full rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
        <div className="h-1 w-5/6 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
        <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} />
      </div>
      {/* Signature block */}
      <div
        className="mt-auto rounded-md border px-2 py-1.5"
        style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="mb-1 flex items-center justify-between text-[6px]">
          <span className="font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Signature</span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>Both parties signed</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div
              className="bento-anim bento-anim-fade truncate text-base leading-none"
              style={{ animationDelay: '0.7s', fontFamily: '"Caveat", cursive', color: 'var(--color-text)' }}
            >
              {emp.name}
            </div>
            <div className="mt-1 text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Signed · 12 Jan 2025
            </div>
          </div>
          <span
            className="bento-anim bento-anim-fade shrink-0 rounded px-1.5 py-0.5 text-[7px] font-medium"
            style={{
              animationDelay: '0.9s',
              backgroundColor: 'var(--color-diff-add)',
              color: 'var(--color-success)',
            }}
          >
            ✓ Verified
          </span>
        </div>
      </div>
    </div>
  )
}

// AI/Pending mini-screenshot: meeting waveform on the left flowing into a
// Pending update card on the right with the AI-drafted summary.
// Animation: bars pulse, pending card slides in from the right.
function AIVisual() {
  const primary = BENTO_EMPLOYEES[2] // Putri Lestari
  const secondary = BENTO_EMPLOYEES[3] // Rian Pratama
  const pending = [
    {
      emp: primary,
      kind: 'SOP' as const,
      doc: 'Refund & dispute handling',
      summary: 'Add escalation flow for high-value disputes (>Rp 5M)',
      when: '3h ago',
      featured: true,
    },
    {
      emp: secondary,
      kind: 'Contract' as const,
      doc: 'Employment agreement — Rian',
      summary: 'Bump WFH allowance to Rp 500k/month, effective Q2',
      when: '1d ago',
      featured: false,
    },
  ]
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      {/* Live transcript header */}
      <div className="bento-anim bento-anim-up flex items-center gap-1.5" style={{ animationDelay: '0.05s' }}>
        <div
          className="flex h-4 w-4 items-center justify-center rounded text-[7px]"
          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
        >
          ✨
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[8px] font-semibold" style={{ color: 'var(--color-text)' }}>Fireflies · Standup</div>
          <div className="truncate text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>Live transcript · 12 min</div>
        </div>
        <div className="flex h-6 items-end gap-0.5">
          {[10, 18, 12, 22, 14, 20].map((h, i) => (
            <div
              key={i}
              className="bento-anim bento-anim-fade w-0.5 rounded-full"
              style={{
                animationDelay: `${0.1 + i * 0.06}s`,
                height: `${h}px`,
                backgroundColor: i === 1 || i === 3 ? 'var(--color-primary)' : 'var(--color-border-strong)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Section header */}
      <div className="bento-anim bento-anim-up mt-0.5 flex items-center justify-between" style={{ animationDelay: '0.25s' }}>
        <span className="text-[6px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Pending updates</span>
        <span className="text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>3 awaiting review</span>
      </div>

      {/* Pending update cards */}
      <div className="flex flex-col gap-1">
        {pending.map((p, i) => (
          <div
            key={i}
            className="bento-anim bento-anim-right flex flex-col gap-0.5 rounded-md border p-1.5"
            style={{
              animationDelay: `${0.35 + i * 0.18}s`,
              borderColor: p.featured ? 'var(--color-primary)' : 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div className="flex items-center gap-1">
              <span
                className="rounded px-1 py-0.5 text-[6px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: p.featured ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                  color: p.featured ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                ✨ AI
              </span>
              <span
                className="rounded px-1 py-0.5 text-[6px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {p.kind}
              </span>
              <span className="truncate text-[7px] font-semibold" style={{ color: 'var(--color-text)' }}>{p.doc}</span>
            </div>
            <div className="line-clamp-1 text-[7px] leading-snug" style={{ color: 'var(--color-text-secondary)' }}>
              {p.summary}
            </div>
            <div className="flex items-center gap-1">
              <MiniAvatar id={p.emp.id} name={p.emp.name} size={10} />
              <span className="truncate text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {p.emp.name} · {p.when}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer with action buttons */}
      <div
        className="bento-anim bento-anim-fade mt-auto flex items-center justify-end gap-1"
        style={{ animationDelay: '0.85s' }}
      >
        <span
          className="rounded border px-1.5 py-0.5 text-[7px] font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          Reject
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[7px] font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Approve
        </span>
      </div>
    </div>
  )
}

// Performance leaderboard mini-screenshot: stacked employee rows with
// avatar, name, dept, "+N cr this month", and award/deduct buttons.
// Animation: rows stagger in from the left.
function PerformanceVisual() {
  const rows = [
    { ...BENTO_EMPLOYEES[0], credits: 1240, badges: 9 },
    { ...BENTO_EMPLOYEES[3], credits: 980,  badges: 7 },
    { ...BENTO_EMPLOYEES[1], credits: 870,  badges: 6 },
    { ...BENTO_EMPLOYEES[2], credits: 640,  badges: 4 },
  ]
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      {/* Title + summary */}
      <div className="bento-anim bento-anim-up flex items-baseline justify-between" style={{ animationDelay: '0.05s' }}>
        <span className="text-[8px] font-semibold" style={{ color: 'var(--color-text)' }}>Performance</span>
        <span className="text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <span style={{ color: 'var(--color-success)' }}>+3,730</span> cr this month
        </span>
      </div>
      {/* Tab toggle */}
      <div className="bento-anim bento-anim-up flex rounded p-0.5" style={{ animationDelay: '0.1s', backgroundColor: 'var(--color-bg-tertiary)' }}>
        <span
          className="flex-1 rounded px-1.5 py-0.5 text-center text-[7px] font-medium"
          style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          Credits
        </span>
        <span className="flex-1 px-1.5 py-0.5 text-center text-[7px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          Achievements
        </span>
      </div>
      {rows.map((row, i) => (
        <div
          key={row.id}
          className="bento-anim bento-anim-left flex items-center gap-1.5 rounded-md border p-1"
          style={{
            animationDelay: `${0.2 + i * 0.12}s`,
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <span className="w-2 text-center text-[6px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>{i + 1}</span>
          <MiniAvatar id={row.id} name={row.name} size={16} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[8px] font-medium leading-tight" style={{ color: 'var(--color-text)' }}>{row.name}</div>
            <div className="truncate text-[6px] leading-tight" style={{ color: 'var(--color-text-tertiary)' }}>
              {row.dept} · <span style={{ color: 'var(--color-success)' }}>+{row.credits} cr</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] leading-none text-white"
              style={{ backgroundColor: 'var(--color-success)' }}
            >
              +
            </span>
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded border text-[8px] leading-none"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
            >
              −
            </span>
          </div>
        </div>
      ))}
      <div
        className="bento-anim bento-anim-fade mt-auto flex items-center justify-between text-[6px]"
        style={{ animationDelay: '0.85s', color: 'var(--color-text-tertiary)' }}
      >
        <span>Auto-paid into allowance · 30 Nov</span>
        <span style={{ color: 'var(--color-primary)' }}>View all →</span>
      </div>
    </div>
  )
}

// Employee portal mini-screenshot: profile header with avatar + name +
// role, a compensation row (allowance + credits + bonus), and a strip of
// achievement badges. Mirrors the personalized portal each employee sees.
// Animation: profile fades in, stat tiles fade up, badges fade in last.
function PortalVisual() {
  const emp = BENTO_EMPLOYEES[2] // Putri Lestari
  // Mirrors the segments built in Portal.tsx for the compensation ring.
  // Numbers chosen to match Putri's demo profile (base 11M / allowance 1.5M)
  // and produce a visible slice for credits and bonus.
  const ringSegments = [
    { key: 'base',      valueIdr: 11_000_000, color: 'var(--color-text-secondary)', icon: <ShieldPath /> },
    { key: 'allowance', valueIdr: 1_500_000,  color: '#3b82f6',                     icon: <WalletPath /> },
    { key: 'credits',   valueIdr: 240_000,    color: '#16a34a',                     icon: <CoinPath /> },
    { key: 'bonus',     valueIdr: 250_000,    color: '#a855f7',                     icon: <GiftPath /> },
  ]
  return (
    <div className="flex h-full flex-col items-center gap-1 p-3">
      {/* Portal top bar — org name on the left, bell with badge on the right */}
      <div
        className="bento-anim bento-anim-fade flex w-full items-center justify-between border-b pb-1.5"
        style={{ animationDelay: '0.05s', borderColor: 'var(--color-border)' }}
      >
        <div className="flex min-w-0 items-center gap-1">
          <div
            className="flex h-3 w-3 shrink-0 items-center justify-center rounded text-[7px] font-bold text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            A
          </div>
          <span className="truncate text-[8px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            Acme Indonesia
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
          {/* Language toggle */}
          <span className="flex items-center gap-0.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 8 6 6" />
              <path d="m4 14 6-6 2-3" />
              <path d="M2 5h12" />
              <path d="M7 2h1" />
              <path d="m22 22-5-10-5 10" />
              <path d="M14 18h6" />
            </svg>
            <span className="text-[7px] font-semibold">EN</span>
          </span>
          {/* Theme toggle (moon — dark theme is active) */}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          {/* Notification bell */}
          <span className="relative">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span
              className="absolute -right-1 -top-1 flex h-2.5 min-w-2.5 items-center justify-center rounded-full px-0.5 text-[7px] font-bold text-white"
              style={{ backgroundColor: '#ef4444' }}
            >
              2
            </span>
          </span>
        </div>
      </div>

      {/* Compensation ring — hero of the portal home page.
          The portal-ring-anim wrapper triggers stroke-dashoffset animations
          on the SVG arcs (see index.css) so the rings draw on around the
          avatar when the card is hovered. */}
      <div className="bento-anim bento-anim-up portal-ring-anim flex flex-col items-center" style={{ animationDelay: '0.2s' }}>
        <CompensationRing
          segments={ringSegments}
          photoUrl={null}
          employeeId={emp.id}
          size={140}
        />
      </div>

      {/* Total compensation */}
      <div className="bento-anim bento-anim-fade flex flex-col items-center" style={{ animationDelay: '0.55s' }}>
        <span className="text-[7px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          Monthly take-home
        </span>
        <span className="text-[14px] font-semibold tabular-nums leading-tight" style={{ color: 'var(--color-text)' }}>
          Rp 12.990.000
        </span>
        <span className="flex items-center gap-0.5 text-[7px] font-medium" style={{ color: 'var(--color-success)' }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          +Rp 490.000 vs baseline
        </span>
      </div>
    </div>
  )
}

// Spotlight post mini-screenshot: priority + Published pills, headline,
// body lines, and the "X / Y read" counter.
// Animation: pills fade in, title/body fade up, read counter ticks in last.
function SpotlightVisual() {
  // One post at each of the three real priority levels (Critical / Important
  // / FYI), titled with demo posts from InteractiveDemo's SPOTLIGHT data.
  const posts = [
    {
      priority: 'Critical',
      color: 'var(--color-danger)',
      title: 'Updated leave policy — read by Friday',
      meta: '2 hari · 18 / 28 read',
      progress: 64,
    },
    {
      priority: 'Important',
      color: 'var(--color-warning)',
      title: 'Q1 2026 town hall recap',
      meta: '3 hari · 24 / 28 read',
      progress: 86,
    },
    {
      priority: 'FYI',
      color: 'var(--color-text-tertiary)',
      title: 'New office opening in Bandung',
      meta: '1 minggu · 28 / 28 read',
      progress: 100,
    },
  ]
  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      {/* Section header */}
      <div className="bento-anim bento-anim-up flex items-baseline justify-between" style={{ animationDelay: '0.05s' }}>
        <span className="text-[8px] font-semibold" style={{ color: 'var(--color-text)' }}>Spotlight</span>
        <span className="text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>3 active posts</span>
      </div>

      {/* Posts */}
      <div className="flex flex-col gap-1">
        {posts.map((post, i) => (
          <div
            key={post.priority}
            className="bento-anim bento-anim-left flex flex-col gap-1 rounded-md border p-1.5"
            style={{
              animationDelay: `${0.15 + i * 0.15}s`,
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div className="flex items-center gap-1">
              <span
                className="rounded px-1.5 py-0.5 text-[7px] font-semibold"
                style={{
                  backgroundColor: post.color,
                  color: post.priority === 'FYI' ? 'var(--color-bg)' : '#fff',
                }}
              >
                {post.priority}
              </span>
              <span className="truncate text-[8px] font-semibold" style={{ color: 'var(--color-text)' }}>
                {post.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-1 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                <span
                  className="h-full"
                  style={{
                    width: `${post.progress}%`,
                    backgroundColor: post.progress === 100 ? 'var(--color-success)' : post.color,
                  }}
                />
              </span>
              <span className="shrink-0 text-[6px]" style={{ color: 'var(--color-text-tertiary)' }}>{post.meta}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Acknowledgers footer */}
      <div
        className="bento-anim bento-anim-fade mt-auto flex items-center justify-between border-t pt-1.5"
        style={{ animationDelay: '0.7s', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center -space-x-1.5">
          {BENTO_EMPLOYEES.map(emp => (
            <span
              key={emp.id}
              className="rounded-full"
              style={{ boxShadow: '0 0 0 1.5px var(--color-bg)' }}
            >
              <MiniAvatar id={emp.id} name={emp.name} size={14} />
            </span>
          ))}
          <span
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[6px] font-medium"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              boxShadow: '0 0 0 1.5px var(--color-bg)',
            }}
          >
            +24
          </span>
        </div>
        <span className="text-[7px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <span style={{ color: 'var(--color-text)' }}>70</span> of 84 acknowledged
        </span>
      </div>
    </div>
  )
}

function BentoCard({
  title,
  visual,
  bullets,
  className = '',
}: {
  title: string
  visual: React.ReactNode
  bullets?: string[]
  className?: string
}) {
  return (
    <div
      className={`group flex flex-col rounded-2xl border p-6 ${className}`}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div
        className="mb-5 aspect-[4/3] overflow-hidden rounded-xl border"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        {visual}
      </div>
      <h3 className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-2">
          {bullets.map(item => (
            <li key={item} className="flex items-start gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="10" cy="10" r="8" />
                <path d="M6.5 10.5l2.5 2.5 4.5-5" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
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

