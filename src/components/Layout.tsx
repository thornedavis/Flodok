import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useLang } from '../contexts/LanguageContext'
import { getAvatarGradient } from '../lib/avatar'
import type { User } from '../types/database'

type NavKey = 'navOverview' | 'navEmployees' | 'navSops' | 'navContracts' | 'navPending' | 'navSettings'

const navItems: { path: string; labelKey: NavKey; exact?: boolean }[] = [
  { path: '/dashboard', labelKey: 'navOverview', exact: true },
  { path: '/dashboard/employees', labelKey: 'navEmployees' },
  { path: '/dashboard/sops', labelKey: 'navSops' },
  { path: '/dashboard/contracts', labelKey: 'navContracts' },
  { path: '/dashboard/pending', labelKey: 'navPending' },
  { path: '/dashboard/settings', labelKey: 'navSettings' },
]

export function DashboardLayout({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { theme, toggle } = useTheme()
  const { lang, toggle: toggleLang, t } = useLang()
  const location = useLocation()

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <nav
        className="no-print sticky top-0 z-50 border-b backdrop-blur-sm"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/dashboard" className="text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            Flodok
          </Link>

          <div className="flex items-center gap-1">
            {navItems.map(item => {
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                  }}
                >
                  {t[item.labelKey]}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
              title={lang === 'en' ? t.switchToId : t.switchToEn}
              aria-label={lang === 'en' ? t.switchToId : t.switchToEn}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 8 6 6"/>
                <path d="m4 14 6-6 2-3"/>
                <path d="M2 5h12"/>
                <path d="M7 2h1"/>
                <path d="m22 22-5-10-5 10"/>
                <path d="M14 18h6"/>
              </svg>
              <span className="hidden text-xs font-semibold sm:inline">
                {lang === 'en' ? 'EN' : 'ID'}
              </span>
            </button>
            <button
              onClick={toggle}
              className="rounded-md p-1.5 transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              )}
            </button>
            <UserMenu user={user} onSignOut={onSignOut} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function PublicLayout() {
  useTheme() // ensure theme class is applied

  return <Outlet />
}

function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const { t } = useLang()
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
    <div ref={menuRef} className="relative">
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
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
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

          {/* Menu items */}
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
