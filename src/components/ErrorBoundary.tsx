import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLang } from '../contexts/LanguageContext'
import type { Translations } from '../lib/translations'
import { Wordmark } from './Brand'

// Last line of defense against a render-time throw. React unmounts the whole
// tree when a component throws during render; without a boundary that means a
// permanent white screen with no in-app recovery. This catches the throw and
// renders a friendly "reload" fallback instead.
//
// - `fullscreen` wraps the entire app (main.tsx), above the router, so even a
//   catastrophic App/router error still shows something. Its only safe action
//   is a hard reload.
// - `inline` wraps just the dashboard <Outlet> (Layout.tsx), so a crash in one
//   page keeps the sidebar/header intact and lets the user navigate away.
//   Reset it on navigation by giving it a route-keyed React `key`.

type Variant = 'fullscreen' | 'inline'

type InnerProps = { t: Translations; variant: Variant; children: ReactNode }
type InnerState = { error: Error | null }

class ErrorBoundaryInner extends Component<InnerProps, InnerState> {
  state: InnerState = { error: null }

  static getDerivedStateFromError(error: Error): InnerState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the browser console / any attached error tracker — this throw
    // would otherwise have been swallowed by the blank screen.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const { t, variant } = this.props
    const reload = () => window.location.reload()
    const goHome = () => window.location.assign('/dashboard')

    const message = (
      <div className="max-w-sm space-y-2">
        <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          {t.errorBoundaryTitle}
        </div>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.errorBoundaryBody}
        </div>
      </div>
    )

    const detail = error.message ? (
      <div className="max-w-md text-xs" style={{ color: 'var(--color-text-tertiary)', wordBreak: 'break-word' }}>
        {error.message}
      </div>
    ) : null

    if (variant === 'fullscreen') {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center"
          style={{ backgroundColor: 'var(--color-bg)' }}
          role="alert"
        >
          <Wordmark height={28} />
          {message}
          {detail}
          <button
            onClick={reload}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.errorBoundaryReload}
          </button>
        </div>
      )
    }

    // inline — the surrounding dashboard chrome is still mounted, so offer a
    // route change (more likely to recover than reloading the crashed page).
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 px-4 text-center" role="alert">
        {message}
        {detail}
        <div className="flex items-center gap-3">
          <button
            onClick={goHome}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.errorBoundaryBack}
          </button>
          <button
            onClick={reload}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.errorBoundaryReload}
          </button>
        </div>
      </div>
    )
  }
}

// Functional wrapper so the boundary can pull translations from context. The
// class itself can't use hooks, so `t` is threaded in as a prop; the wrapper
// lives inside LanguageProvider at both call sites.
export function ErrorBoundary({ variant = 'fullscreen', children }: { variant?: Variant; children: ReactNode }) {
  const { t } = useLang()
  return (
    <ErrorBoundaryInner t={t} variant={variant}>
      {children}
    </ErrorBoundaryInner>
  )
}
