import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { Wordmark } from './Brand'

// ─── Layout ─────────────────────────────────────────────

export function PublicSiteLayout() {
  useTheme()
  const location = useLocation()

  // Scroll to top on route change; honour hash anchors when present.
  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname, location.hash])

  // Landing page renders its own gradient-backed footer inside the CTA flow,
  // so we skip the standard one here to avoid double rendering.
  const ownsFooter = location.pathname === '/'

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <SiteNav />
      <Outlet />
      {!ownsFooter && <SiteFooter />}
    </div>
  )
}

// ─── Nav ────────────────────────────────────────────────

function SiteNav() {
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
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link to="/" aria-label="Flodok — home" className="flex items-center">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex" style={{ color: 'var(--color-text-secondary)' }}>
          <Link to="/#features" className="transition-colors hover:opacity-70">Features</Link>
          <Link to="/#how-it-works" className="transition-colors hover:opacity-70">How it works</Link>
          <Link to="/pricing" className="transition-colors hover:opacity-70">Pricing</Link>
          <Link to="/about" className="transition-colors hover:opacity-70">About</Link>
          <Link to="/contact" className="transition-colors hover:opacity-70">Contact</Link>
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

// ─── Footer ─────────────────────────────────────────────

export function SiteFooter({ transparent = false }: { transparent?: boolean } = {}) {
  return (
    <footer
      className={transparent ? 'px-6 py-14' : 'border-t px-6 py-14'}
      style={transparent
        ? { color: 'var(--color-text)' }
        : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Link to="/" aria-label="Flodok — home" className="inline-flex items-center">
              <Wordmark height={24} />
            </Link>
            <p className="mt-3 max-w-xs text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              The operations OS for Indonesia's best teams. Made in Jakarta.
            </p>

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
              ['Features', '/#features'],
              ['Pricing', '/pricing'],
              ['How it works', '/#how-it-works'],
              ['Security', '/security'],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ['About', '/about'],
              ['Customers', '/#testimonials'],
              ['Contact', '/contact'],
              ['Help Center', '/help'],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ['Privacy', '/privacy'],
              ['Terms', '/terms'],
              ['DPA', '/dpa'],
              ['Security', '/security'],
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
            {href.startsWith('/') ? (
              <Link
                to={href}
                className="text-sm transition-colors hover:opacity-70"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {label}
              </Link>
            ) : (
              <a
                href={href}
                className="text-sm transition-colors hover:opacity-70"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── LegalPage helper (Terms / Privacy / DPA) ───────────

export interface LegalSection {
  id: string
  label: string
  /** Heading shown above the body content. Defaults to `label`. */
  heading?: string
  body: React.ReactNode
}

export function LegalPage({
  title,
  intro,
  lastUpdated,
  sections,
}: {
  title: string
  intro?: React.ReactNode
  lastUpdated: string
  sections: LegalSection[]
}) {
  return (
    <main className="px-6 py-16 md:py-20">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Legal
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight md:text-5xl"
            style={{ color: 'var(--color-text)' }}
          >
            {title}
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Last updated: {lastUpdated}
          </p>
          {intro && (
            <div className="legal-prose mt-6 max-w-3xl">{intro}</div>
          )}
        </header>

        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Sticky table of contents */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              On this page
            </p>
            <ul className="space-y-1.5 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="transition-colors hover:opacity-70"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* Body */}
          <article className="legal-prose max-w-3xl">
            {sections.map((s) => (
              <section key={s.id}>
                <h2 id={s.id}>{s.heading ?? s.label}</h2>
                {s.body}
              </section>
            ))}

            <hr className="my-10" style={{ borderColor: 'var(--color-border)' }} />
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Questions about this document? Email{' '}
              <a href="mailto:legal@flodok.com">legal@flodok.com</a>.
            </p>
          </article>
        </div>
      </div>
    </main>
  )
}
