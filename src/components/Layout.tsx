import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useLang } from '../contexts/LanguageContext'
import { BreadcrumbProvider, useBreadcrumb } from '../contexts/BreadcrumbContext'
import { BillingProvider } from '../contexts/BillingContext'
import { useRole } from '../hooks/useRole'
import { getAvatarGradient } from '../lib/avatar'
import { supabase } from '../lib/supabase'
import type { Translations } from '../lib/translations'
import type { Organization, User } from '../types/aliases'
import { Wordmark, Imagemark } from './Brand'
import { DunningBanner } from './DunningBanner'
import { NotificationBell } from './NotificationBell'
import { FilterSearchInput } from './FilterControls'

type NavKey = 'navOverview' | 'navInbox' | 'navEmployees' | 'navHiring' | 'navCompany' | 'navSops' | 'navContracts' | 'navPerformance' | 'navSpotlight' | 'navPending' | 'navSettings'

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
    path: '/dashboard/inbox',
    labelKey: 'navInbox',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>,
  },
  {
    path: '/dashboard/employees',
    labelKey: 'navEmployees',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
  {
    path: '/dashboard/hiring',
    labelKey: 'navHiring',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></svg>,
  },
  {
    path: '/dashboard/company',
    labelKey: 'navCompany',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9h1" /><path d="M9 13h1" /><path d="M9 17h1" /><path d="M15 13h1" /><path d="M15 17h1" /></svg>,
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
    path: '/dashboard/performance',
    labelKey: 'navPerformance',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  },
  {
    path: '/dashboard/spotlight',
    labelKey: 'navSpotlight',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
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
    <BreadcrumbProvider>
      <BillingProvider orgId={user.org_id}>
        <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
          <Sidebar user={user} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

          <div className="flex min-w-0 flex-1 flex-col">
            <Header user={user} org={org} onSignOut={onSignOut} onOpenMenu={() => setMobileOpen(true)} />

            <main className="flex-1 px-6 py-8 md:px-10">
              <div className="mx-auto max-w-6xl">
                <DunningBanner user={user} />
                <Outlet context={{ org } satisfies DashboardOutletContext} />
              </div>
            </main>
          </div>
        </div>
      </BillingProvider>
    </BreadcrumbProvider>
  )
}

export function PublicLayout() {
  useTheme() // ensure theme class is applied
  return <Outlet />
}

// ─── Sidebar ────────────────────────────────────────────

const SIDEBAR_COLLAPSED_KEY = 'flodok:sidebarCollapsed'

function Sidebar({ user, mobileOpen, onCloseMobile }: {
  user: User
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const location = useLocation()
  const navigate = useNavigate()
  const [userCount, setUserCount] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', user.org_id)
      .then(({ count }) => {
        if (!cancelled) setUserCount(count ?? 0)
      })
    return () => { cancelled = true }
  }, [isAdmin, user.org_id])

  // Mobile drawer always shows the full expanded layout, regardless of the
  // desktop collapsed preference — the narrow icon-only mode would be hard
  // to tap on touch.
  const isCollapsed = collapsed && !mobileOpen
  const showInviteCard = isAdmin && userCount !== null && userCount <= 2 && !isCollapsed

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
        className={`no-print fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width,transform] md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          isCollapsed ? 'w-16' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        {/* Top: logo + collapse toggle. When collapsed the imagemark
            doubles as the expand button — keeps the header to a single
            row so nav items don't shift down. */}
        <div className={`flex h-14 items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
          {isCollapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="inline-flex items-center justify-center rounded-md p-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              title={t.sidebarExpand}
              aria-label={t.sidebarExpand}
            >
              <Imagemark size={22} />
            </button>
          ) : (
            <>
              <Link
                to="/dashboard"
                aria-label="Flodok — dashboard"
                className="inline-flex items-center"
              >
                <Wordmark height={18} />
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="hidden h-6 w-6 items-center justify-center rounded-md border transition-colors hover:bg-[var(--color-bg-tertiary)] md:inline-flex"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-tertiary)',
                }}
                title={t.sidebarCollapse}
                aria-label={t.sidebarCollapse}
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </>
          )}
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
                    title={isCollapsed ? t[item.labelKey] : undefined}
                    className={`flex items-center rounded-lg py-2 text-sm font-medium transition-colors ${
                      isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                    }`}
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
                    {!isCollapsed && t[item.labelKey]}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Help link */}
        <div className="border-t px-3 pt-3" style={{ borderColor: 'var(--color-border)' }}>
          <Link
            to="/help"
            title={isCollapsed ? t.helpCenter : undefined}
            className={`flex items-center rounded-lg py-2 text-sm font-medium transition-colors ${
              isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
            }`}
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span style={{ color: 'var(--color-text-tertiary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            {!isCollapsed && t.helpCenter}
          </Link>
        </div>

        {/* Invite card — admins only, hidden once the team has 3+ members */}
        {showInviteCard && (
          <div className="px-4 pt-3">
            <InviteCard t={t} onInvite={() => navigate('/dashboard/settings?tab=organization')} />
          </div>
        )}

        {/* Version footer */}
        {!isCollapsed && (
          <p className="px-6 pb-3 pt-3 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            v{__APP_VERSION__}
          </p>
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

function deriveBreadcrumbs(pathname: string, orgName: string, t: Translations, trailing: string | null): Crumb[] {
  const rootCrumb: Crumb = { label: orgName, href: '/dashboard' }
  const segments = pathname.split('/').filter(Boolean)
  if (pathname === '/dashboard' || segments.length <= 1) {
    return [{ label: orgName }]
  }

  const sectionMap: Record<string, { label: string; href: string }> = {
    employees: { label: t.navEmployees, href: '/dashboard/employees' },
    company: { label: t.navCompany, href: '/dashboard/company' },
    sops: { label: t.navSops, href: '/dashboard/sops' },
    contracts: { label: t.navContracts, href: '/dashboard/contracts' },
    performance: { label: t.navPerformance, href: '/dashboard/performance' },
    spotlight: { label: t.navSpotlight, href: '/dashboard/spotlight' },
    pending: { label: t.navPending, href: '/dashboard/pending' },
    inbox: { label: t.navInbox, href: '/dashboard/inbox' },
    settings: { label: t.navSettings, href: '/dashboard/settings' },
  }
  const section = sectionMap[segments[1]]
  if (!section) return [{ label: orgName }]

  // Drill-down: /dashboard/<section>/<id>/<action>
  const action = segments[3]
  if (action === 'edit') return [rootCrumb, { label: section.label, href: section.href }, { label: trailing ?? t.breadcrumbEdit }]
  if (action === 'history') return [rootCrumb, { label: section.label, href: section.href }, { label: trailing ?? t.breadcrumbHistory }]

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
  const { trailing } = useBreadcrumb()
  const crumbs = deriveBreadcrumbs(location.pathname, org?.display_name || org?.name || 'Flodok', t, trailing)

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

        {/* Breadcrumb trail */}
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-3 text-sm">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <span key={i} className="flex min-w-0 items-center gap-3">
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

      {/* Right: search · language · theme · bell · avatar */}
      <div className="flex shrink-0 items-center gap-2">
        <HeaderSearch />
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
        <NotificationBell user={user} />
        <div className="ml-2">
          <UserMenu user={user} org={org} onSignOut={onSignOut} />
        </div>
      </div>
    </div>
  )
}

// Visual placeholder for a future global command palette. Uses the same
// FilterSearchInput primitive as the per-page search bars so it inherits
// the brand styling. On Enter the query is forwarded to /dashboard/employees,
// which prefills its own search box from `location.state.q`.
function HeaderSearch() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [q, setQ] = useState('')
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        const trimmed = q.trim()
        if (!trimmed) return
        navigate('/dashboard/employees', { state: { q: trimmed } })
        setQ('')
      }}
      className="hidden w-56 md:block lg:w-72"
    >
      <FilterSearchInput
        value={q}
        onChange={setQ}
        placeholder={t.headerSearchPlaceholder}
      />
    </form>
  )
}

// ─── User menu ──────────────────────────────────────────

function UserMenu({ user, org, onSignOut }: { user: User; org: Organization | null; onSignOut: () => void }) {
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

  const orgLabel = org?.display_name || org?.name || ''

  return (
    <div ref={menuRef} className="relative" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 transition-colors hover:bg-[var(--color-bg-tertiary)]"
        aria-label={t.userMenuAria}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{
            background: user.photo_url ? 'var(--color-bg-tertiary)' : getAvatarGradient(user.id),
          }}
        >
          {user.photo_url && (
            <img src={user.photo_url} alt={user.name} className="h-full w-full object-cover" />
          )}
        </span>
        {/* Name + org — hidden on narrow screens to keep the topbar compact */}
        <div className="hidden min-w-0 max-w-[12rem] flex-col items-start leading-tight md:flex">
          <span className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
            {user.name}
          </span>
          {orgLabel && (
            <span className="truncate text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {orgLabel}
            </span>
          )}
        </div>
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
