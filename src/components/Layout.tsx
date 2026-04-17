import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useLang } from '../contexts/LanguageContext'
import { useRole } from '../hooks/useRole'
import { getAvatarGradient } from '../lib/avatar'
import { supabase } from '../lib/supabase'
import type { Translations } from '../lib/translations'
import type { Organization, User } from '../types/database'

type NavKey = 'navOverview' | 'navEmployees' | 'navSops' | 'navContracts' | 'navPending' | 'navSettings'

interface NavItemDef {
  path: string
  labelKey: NavKey
  icon: React.ReactNode
  exact?: boolean
}

const navItems: NavItemDef[] = [
  {
    path: '/dashboard',
    labelKey: 'navOverview',
    exact: true,
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  },
  {
    path: '/dashboard/employees',
    labelKey: 'navEmployees',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    path: '/dashboard/sops',
    labelKey: 'navSops',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="9" x2="10" y2="9" /></svg>,
  },
  {
    path: '/dashboard/contracts',
    labelKey: 'navContracts',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></svg>,
  },
  {
    path: '/dashboard/pending',
    labelKey: 'navPending',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  },
  {
    path: '/dashboard/settings',
    labelKey: 'navSettings',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  },
]

export type DashboardOutletContext = {
  org: Organization | null
}

export function DashboardLayout({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [org, setOrg] = useState<Organization | null>(null)
  const location = useLocation()

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    supabase.from('organizations')
      .select('*')
      .eq('id', user.org_id)
      .single()
      .then(({ data }) => { if (data) setOrg(data) })
  }, [user.org_id])

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <Sidebar user={user} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} org={org} onSignOut={onSignOut} onOpenMenu={() => setMobileOpen(true)} />

        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mx-auto max-w-6xl">
            <Outlet context={{ org } satisfies DashboardOutletContext} />
          </div>
        </main>
      </div>
    </div>
  )
}

export function PublicLayout() {
  useTheme() // ensure theme class is applied
  return <Outlet />
}

// ─── Sidebar ────────────────────────────────────────────

function Sidebar({ user, mobileOpen, onCloseMobile }: {
  user: User
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        {/* Top: logo */}
        <div className="flex h-14 items-center px-5">
          <Link
            to="/dashboard"
            className="text-lg font-semibold tracking-tight"
            style={{ color: 'var(--color-text)' }}
          >
            Flodok
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {navItems.map(item => {
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    style={{
                      color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      backgroundColor: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
                    }}
                    onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span style={{ color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
                      {item.icon}
                    </span>
                    {t[item.labelKey]}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Invite card — admins only */}
        {isAdmin && (
          <div className="px-4 pb-4">
            <InviteCard t={t} onInvite={() => navigate('/dashboard/settings?tab=organization')} />
          </div>
        )}
      </aside>
    </>
  )
}

// ─── Invite card ────────────────────────────────────────

function InviteCard({ t, onInvite }: { t: Translations; onInvite: () => void }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      </div>
      <p className="mb-0.5 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{t.sidebarInviteTitle}</p>
      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{t.sidebarInviteDesc}</p>
      <button
        type="button"
        onClick={onInvite}
        className="w-full rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text)',
        }}
        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-border)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      >
        {t.sidebarInviteCta}
      </button>
    </div>
  )
}

// ─── Header (breadcrumbs + user avatar) ─────────────────

interface Crumb {
  label: string
  href?: string
}

function deriveBreadcrumbs(pathname: string, orgName: string, t: Translations): Crumb[] {
  const rootCrumb: Crumb = { label: orgName, href: '/dashboard' }
  const segments = pathname.split('/').filter(Boolean)
  if (pathname === '/dashboard' || segments.length <= 1) {
    return [{ label: orgName }]
  }

  const sectionMap: Record<string, { label: string; href: string }> = {
    employees: { label: t.navEmployees, href: '/dashboard/employees' },
    sops: { label: t.navSops, href: '/dashboard/sops' },
    contracts: { label: t.navContracts, href: '/dashboard/contracts' },
    pending: { label: t.navPending, href: '/dashboard/pending' },
    settings: { label: t.navSettings, href: '/dashboard/settings' },
  }
  const section = sectionMap[segments[1]]
  if (!section) return [{ label: orgName }]

  // Drill-down: /dashboard/<section>/<id>/<action>
  const action = segments[3]
  if (action === 'edit') return [rootCrumb, { label: section.label, href: section.href }, { label: t.breadcrumbEdit }]
  if (action === 'history') return [rootCrumb, { label: section.label, href: section.href }, { label: t.breadcrumbHistory }]

  return [rootCrumb, { label: section.label }]
}

function Header({ user, org, onSignOut, onOpenMenu }: {
  user: User
  org: Organization | null
  onSignOut: () => void
  onOpenMenu: () => void
}) {
  const { t, lang, toggle: toggleLang } = useLang()
  const { theme, toggle: toggleTheme } = useTheme()
  const location = useLocation()
  const crumbs = deriveBreadcrumbs(location.pathname, org?.name || 'Flodok', t)
  const isDrilldown = crumbs.length > 1

  return (
    <div
      className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 md:px-10"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 90%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="-ml-2 rounded-md p-2 transition-colors hover:opacity-70 md:hidden"
          style={{ color: 'var(--color-text-secondary)' }}
          aria-label={t.openMenu}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Back arrow for drill-down routes */}
        {isDrilldown && crumbs[0].href && (
          <Link
            to={crumbs[0].href}
            className="shrink-0 rounded-md p-1 transition-colors hover:opacity-70"
            style={{ color: 'var(--color-text-tertiary)' }}
            aria-label={crumbs[0].label}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </Link>
        )}

        {/* Breadcrumb trail */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {crumb.href && !isLast ? (
                  <Link
                    to={crumb.href}
                    className="truncate transition-colors hover:opacity-70"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className="truncate font-medium"
                    style={{ color: isLast ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
                  >
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
                )}
              </span>
            )
          })}
        </nav>
      </div>

      {/* Right: language · theme · avatar */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)' }}
          title={lang === 'en' ? t.switchToId : t.switchToEn}
          aria-label={lang === 'en' ? t.switchToId : t.switchToEn}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
          <span className="hidden text-xs font-semibold sm:inline">
            {lang === 'en' ? 'EN' : 'ID'}
          </span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-1.5 transition-colors hover:opacity-70"
          style={{ color: 'var(--color-text-secondary)' }}
          title={theme === 'light' ? t.themeDark : t.themeLight}
          aria-label={theme === 'light' ? t.themeDark : t.themeLight}
        >
          {theme === 'light' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
          )}
        </button>
        <div className="ml-2">
          <UserMenu user={user} onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  )
}

// ─── User menu ──────────────────────────────────────────

function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { t, lang, toggle: toggleLang } = useLang()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function go(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <div ref={menuRef} className="relative" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-offset-2 transition-all hover:ring-2"
        style={{
          background: user.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(user.id),
          ['--tw-ring-color' as string]: 'var(--color-border-strong)',
          ['--tw-ring-offset-color' as string]: 'var(--color-bg)',
        } as React.CSSProperties}
        aria-label={t.userMenuAria}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.photo_url && (
          <img src={user.photo_url} alt={user.name} className="h-full w-full object-cover" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {/* User info header */}
          <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
            <div
              className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
              style={{ background: user.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(user.id) }}
            >
              {user.photo_url && (
                <img src={user.photo_url} alt={user.name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {user.name}
              </div>
              <div className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {user.email}
              </div>
            </div>
          </div>

          {/* Navigation items */}
          <div className="py-1">
            <MenuItem
              onClick={() => go('/dashboard/settings?tab=account')}
              label={t.accountMenu}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            />
            <MenuItem
              onClick={() => go('/dashboard/settings?tab=billing')}
              label={t.billingMenu}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              }
            />
          </div>

          {/* Language + theme (toggle without closing) */}
          <div className="border-t py-1" style={{ borderColor: 'var(--color-border)' }}>
            <ToggleRow
              onClick={toggleLang}
              label={t.languageMenuLabel}
              value={lang === 'en' ? 'English' : 'Bahasa'}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 8 6 6" />
                  <path d="m4 14 6-6 2-3" />
                  <path d="M2 5h12" />
                  <path d="M7 2h1" />
                  <path d="m22 22-5-10-5 10" />
                  <path d="M14 18h6" />
                </svg>
              }
            />
            <ToggleRow
              onClick={toggleTheme}
              label={t.themeMenuLabel}
              value={theme === 'light' ? t.themeLight : t.themeDark}
              icon={
                theme === 'light' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                )
              }
            />
          </div>

          <div className="border-t py-1" style={{ borderColor: 'var(--color-border)' }}>
            <MenuItem
              onClick={() => { setOpen(false); onSignOut() }}
              label={t.signOut}
              danger
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, label, icon, danger }: {
  onClick: () => void
  label: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors"
      style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span className="shrink-0" style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
        {icon}
      </span>
      {label}
    </button>
  )
}

function ToggleRow({ onClick, label, value, icon }: {
  onClick: () => void
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2 text-sm transition-colors"
      style={{ color: 'var(--color-text)' }}
      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <span className="shrink-0" style={{ color: 'var(--color-text-secondary)' }}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{value}</span>
    </button>
  )
}
