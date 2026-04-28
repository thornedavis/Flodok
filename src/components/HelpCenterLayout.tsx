import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import {
  allTopics,
  sections,
  sectionBySlug,
} from '../pages/help/data'
import type { IconKey } from '../pages/help/data'

// ─── Layout ─────────────────────────────────────────────

export function HelpCenterLayout() {
  useTheme()
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0 })
  }, [location.pathname, location.hash])

  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <HelpSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <HelpHeader />

        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── Header (brand + breadcrumb + search) ───────────────

function HelpHeader() {
  const { theme, toggle } = useTheme()
  const crumbs = useBreadcrumbs()

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b px-4 md:px-10"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 90%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
        {/* Breadcrumb */}
        <nav className="flex min-w-0 items-center gap-2 text-sm">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <span key={i} className="flex min-w-0 items-center gap-2">
                {i > 0 && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
                {crumb.href && !isLast ? (
                  <Link
                    to={crumb.href}
                    className="truncate transition-colors hover:opacity-70"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="truncate font-medium"
                    style={{
                      color: isLast ? 'var(--color-text)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="hidden md:block">
          <HelpSearch />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="rounded-md p-1.5 transition-colors hover:opacity-70"
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
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium sm:inline-block"
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
    </header>
  )
}

// ─── Search (client-side filter) ────────────────────────

function HelpSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allTopics
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [query])

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
          width: '320px',
        }}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search docs…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => query && setOpen(true)}
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: 'var(--color-text)' }}
        />
      </div>

      {open && matches.length > 0 && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border shadow-lg"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          {matches.map((m) => (
            <button
              key={m.slug}
              type="button"
              onClick={() => {
                navigate(`/help/docs/${m.slug}`)
                setOpen(false)
                setQuery('')
              }}
              className="block w-full border-b px-4 py-2.5 text-left transition-colors last:border-b-0"
              style={{
                borderColor: 'var(--color-border)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = 'transparent')
              }
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {m.title}
              </div>
              <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {m.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ────────────────────────────────────────────

function HelpSidebar() {
  const location = useLocation()
  const params = useParams<{ slug?: string }>()
  const currentSlug = params.slug
  const currentSection = currentSlug ? sectionBySlug[currentSlug]?.id : null

  const [docsOpen, setDocsOpen] = useState(true)
  const [openSection, setOpenSection] = useState<string | null>(currentSection)

  useEffect(() => {
    if (currentSection) setOpenSection(currentSection)
  }, [currentSection])

  const isContact = location.pathname === '/help/contact'
  const isFaq = location.pathname.startsWith('/help/faq')
  const isDocs = location.pathname.startsWith('/help/docs') || location.pathname === '/help'

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r md:sticky md:top-0 md:flex md:h-screen"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center px-5">
        <Link
          to="/"
          className="text-lg font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          Flodok
        </Link>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {/* Contact support — pinned top */}
          <li>
            <SidebarLink
              to="/help/contact"
              active={isContact}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              }
              label="Contact support"
            />
          </li>
        </ul>

        <p
          className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Help
        </p>

      <ul className="space-y-1">
        {/* Documentation expandable */}
        <li>
          <SidebarToggleRow
            label="Documentation"
            active={isDocs && !currentSlug}
            open={docsOpen}
            onToggle={() => setDocsOpen((o) => !o)}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            }
          />

          {docsOpen && (
            <ul className="mt-1 space-y-0.5">
              {sections.map((section) => {
                const isOpen = openSection === section.id
                const containsCurrent = section.topics.some((t) => t.slug === currentSlug)
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => setOpenSection(isOpen ? null : section.id)}
                      className="flex w-full items-center justify-between rounded-md py-1.5 pl-9 pr-3 text-sm transition-colors"
                      style={{
                        color:
                          isOpen || containsCurrent
                            ? 'var(--color-text)'
                            : 'var(--color-text-secondary)',
                        fontWeight: isOpen || containsCurrent ? 500 : 400,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          'var(--color-bg-secondary)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'transparent')
                      }
                    >
                      <span>{section.title}</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-transform"
                        style={{
                          color: 'var(--color-text-tertiary)',
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                        }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>

                    {isOpen && (
                      <ul className="mt-0.5 space-y-0.5">
                        {section.topics.map((topic) => {
                          const active = currentSlug === topic.slug
                          return (
                            <li key={topic.slug}>
                              <Link
                                to={`/help/docs/${topic.slug}`}
                                className="block rounded-md py-1.5 pl-12 pr-3 text-sm transition-colors"
                                style={{
                                  color: active
                                    ? 'var(--color-text)'
                                    : 'var(--color-text-secondary)',
                                  backgroundColor: active
                                    ? 'var(--color-bg-tertiary)'
                                    : 'transparent',
                                  fontWeight: active ? 600 : 400,
                                }}
                                onMouseEnter={(e) => {
                                  if (!active)
                                    e.currentTarget.style.backgroundColor =
                                      'var(--color-bg-secondary)'
                                }}
                                onMouseLeave={(e) => {
                                  if (!active)
                                    e.currentTarget.style.backgroundColor =
                                      'transparent'
                                }}
                              >
                                {topic.title}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </li>

        {/* FAQ link */}
        <li>
          <SidebarLink
            to="/help/faq"
            active={isFaq}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            label="FAQ"
          />
        </li>
      </ul>
      </nav>
    </aside>
  )
}

function SidebarLink({
  to,
  active,
  icon,
  label,
}: {
  to: string
  active: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      style={{
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active)
          e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <span style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
        {icon}
      </span>
      {label}
    </Link>
  )
}

function SidebarToggleRow({
  label,
  active,
  open,
  onToggle,
  icon,
}: {
  label: string
  active: boolean
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      style={{
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active)
          e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform"
        style={{
          color: 'var(--color-text-tertiary)',
          transform: open ? 'rotate(90deg)' : 'none',
        }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}

// ─── Breadcrumb derivation ──────────────────────────────

interface Crumb {
  label: string
  href?: string
}

function useBreadcrumbs(): Crumb[] {
  const location = useLocation()
  const params = useParams<{ slug?: string }>()
  const path = location.pathname

  const root: Crumb = { label: 'Help Center', href: '/help' }

  if (path === '/help/contact') {
    return [root, { label: 'Contact Support' }]
  }
  if (path === '/help/faq') {
    return [root, { label: 'FAQ' }]
  }
  if (path === '/help' || path === '/help/docs') {
    return [root, { label: 'Documentation' }]
  }
  if (path.startsWith('/help/docs/') && params.slug) {
    const topic = allTopics.find((t) => t.slug === params.slug)
    if (topic) {
      return [
        root,
        { label: 'Documentation', href: '/help/docs' },
        { label: topic.title },
      ]
    }
  }
  return [root]
}

// ─── Icon resolver (used by index/cards) ────────────────

export function HelpIcon({ name }: { name: IconKey }) {
  const stroke = 'currentColor'
  const props = { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'book': return (<svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>)
    case 'card': return (<svg {...props}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>)
    case 'users': return (<svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>)
    case 'mail': return (<svg {...props}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>)
    case 'file': return (<svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>)
    case 'history': return (<svg {...props}><path d="M3 3v5h5" /><path d="M3.05 13a9 9 0 1 0 .49-3" /><path d="M12 7v5l3 3" /></svg>)
    case 'upload': return (<svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>)
    case 'pen': return (<svg {...props}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>)
    case 'shield': return (<svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>)
    case 'star': return (<svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>)
    case 'globe': return (<svg {...props}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>)
    case 'plug': return (<svg {...props}><path d="M9 2v6" /><path d="M15 2v6" /><path d="M5 10h14v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5z" /><path d="M12 19v3" /></svg>)
    case 'settings': return (<svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>)
    case 'clock': return (<svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>)
    case 'language': return (<svg {...props}><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></svg>)
    case 'lock': return (<svg {...props}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>)
    case 'receipt': return (<svg {...props}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /></svg>)
    case 'wallet': return (<svg {...props}><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><circle cx="17" cy="14" r="1.5" /></svg>)
    case 'eye': return (<svg {...props}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>)
    case 'sparkles': return (<svg {...props}><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" /><path d="m5.6 18.4 2.1-2.1" /><path d="m16.3 7.7 2.1-2.1" /></svg>)
    case 'workflow': return (<svg {...props}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M6 9v6a3 3 0 0 0 3 3h6" /></svg>)
  }
}
