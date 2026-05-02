// The persistent payment-failure banner. Renders at the top of every
// dashboard page when the org is in any non-active billing state. Three
// visual variants:
//   pro_grace    — soft amber, "your last payment failed, X days left"
//   pro_readonly — hard red, "writes paused, Y days until cancellation"
//   free_frozen  — hard red, "your subscription was canceled, resume to unlock"
// Click → opens Stripe customer portal directly to update-payment-method.

import { useState } from 'react'
import { useBilling } from '../contexts/BillingContext'
import { openPortal, daysUntilReadonly, daysUntilCancel } from '../lib/billing'
import { useLang } from '../contexts/LanguageContext'
import type { User } from '../types/aliases'
import { useRole } from '../hooks/useRole'

export function DunningBanner({ user }: { user: User }) {
  const { state, billing } = useBilling()
  const { t } = useLang()
  const { isAdmin } = useRole(user)
  const [busy, setBusy] = useState<'fix' | 'resume' | null>(null)

  if (state === 'pro_active' || state === 'free_legitimate') return null

  const graceDays = daysUntilReadonly(billing)
  const cancelDays = daysUntilCancel(billing)

  // Visual treatment per state.
  const variant = state === 'pro_grace' ? 'soft' : 'hard'
  const colors = variant === 'soft'
    ? { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.4)', text: '#d97706', accent: '#f59e0b' }
    : { bg: 'rgba(239, 68, 68, 0.08)',  border: 'rgba(239, 68, 68, 0.4)',  text: '#ef4444', accent: '#ef4444' }

  let title: string
  let body: string
  let ctaLabel: string
  let action: 'fix' | 'resume'

  if (state === 'pro_grace') {
    title = t.dunningGraceTitle
    body = (graceDays === 1 ? t.dunningGraceBodyOne : t.dunningGraceBody)
      .replace('{graceDays}', String(graceDays ?? 0))
      .replace('{cancelDays}', String(cancelDays ?? 0))
    ctaLabel = t.dunningUpdateCard
    action = 'fix'
  } else if (state === 'pro_readonly') {
    title = t.dunningReadonlyTitle
    body = (cancelDays === 1 ? t.dunningReadonlyBodyOne : t.dunningReadonlyBody)
      .replace('{cancelDays}', String(cancelDays ?? 0))
    ctaLabel = t.dunningUpdateCard
    action = 'fix'
  } else {
    // free_frozen
    title = t.dunningFrozenTitle
    body = t.dunningFrozenBody
    ctaLabel = t.dunningResumeCta
    action = 'resume'
  }

  async function handleClick() {
    if (action === 'fix') {
      setBusy('fix')
      try {
        const url = await openPortal({
          returnUrl: `${window.location.origin}/dashboard/settings?tab=billing`,
          flow: 'payment_method_update',
        })
        window.location.href = url
      } catch (e) {
        console.error('Open portal failed:', e)
        setBusy(null)
      }
    } else {
      // resume: send to billing tab where Upgrade modal lives
      window.location.href = '/dashboard/settings?tab=billing'
    }
  }

  return (
    <div
      className="mb-6 rounded-xl border px-4 py-3"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      role="alert"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <div className="text-sm font-semibold" style={{ color: colors.text }}>
              {title}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {body}
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleClick}
            disabled={busy !== null}
            className="shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: colors.accent }}
          >
            {busy === 'fix' ? t.billingRedirecting : ctaLabel}
          </button>
        )}
      </div>
    </div>
  )
}
