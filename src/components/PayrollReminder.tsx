// Dashboard nudge: when last month's payroll still has un-run (open)
// employees, remind owners/admins to run it. Replaces the old silent
// auto-close — payroll is now explicit, so this is the "don't forget" cue.
// Renders nothing for non-admins, while loading, or once the month is run.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { useRole } from '../hooks/useRole'
import { currentPeriodMonth } from '../lib/credits'
import type { User } from '../types/aliases'

function prevMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  let yy = y
  let mm = m - 1
  if (mm < 1) { mm = 12; yy -= 1 }
  return `${yy}-${String(mm).padStart(2, '0')}-01`
}

export function PayrollReminder({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [openCount, setOpenCount] = useState(0)
  const [period, setPeriod] = useState('')
  const [dismissed, setDismissed] = useState(false)

  // Dismissal is scoped to org + period. Closing the banner hides it for the
  // rest of the month regardless of how the open count then shifts — no more
  // re-popping mid-month. A new month mints a fresh key so the nudge returns
  // once for genuinely new payroll; between times, the standing "needs payroll"
  // signal is carried by the sidebar badge/dot on the Payroll nav item.
  const storageKey = period ? `flodok:payroll-reminder-dismissed:${user.org_id}:${period}` : ''

  useEffect(() => {
    if (!isAdmin) return
    const p = prevMonth(currentPeriodMonth())
    supabase.rpc('preview_payroll', { p_period: p }).then(({ data }) => {
      const open = (data as { counts?: { open?: number } } | null)?.counts?.open ?? 0
      setOpenCount(open)
      setPeriod(p)
    })
  }, [isAdmin])

  // Respect a prior dismissal for this exact reminder; re-evaluate if the key changes.
  useEffect(() => {
    if (!storageKey) return
    try {
      setDismissed(localStorage.getItem(storageKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [storageKey])

  if (!isAdmin || openCount === 0 || !period || dismissed) return null

  function handleDismiss() {
    try {
      if (storageKey) localStorage.setItem(storageKey, '1')
    } catch {
      /* private mode / storage full — dismiss for this session anyway */
    }
    setDismissed(true)
  }

  const monthName = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    month: 'long', year: 'numeric',
  }).format(new Date(period + 'T00:00:00'))

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-warning) 40%, var(--color-border))',
        backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
      }}
    >
      <Link to="/dashboard/payroll" className="flex min-w-0 flex-1 items-center gap-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-sm" style={{ color: 'var(--color-text)' }}>{t.payrollReminderText(monthName, openCount)}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link to="/dashboard/payroll" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>{t.payrollReminderCta} →</Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t.close}
          title={t.close}
          className="rounded-md p-1 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-warning) 16%, transparent)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
