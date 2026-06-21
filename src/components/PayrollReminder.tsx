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

  useEffect(() => {
    if (!isAdmin) return
    const p = prevMonth(currentPeriodMonth())
    supabase.rpc('preview_payroll', { p_period: p }).then(({ data }) => {
      const open = (data as { counts?: { open?: number } } | null)?.counts?.open ?? 0
      setOpenCount(open)
      setPeriod(p)
    })
  }, [isAdmin])

  if (!isAdmin || openCount === 0 || !period) return null

  const monthName = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    month: 'long', year: 'numeric',
  }).format(new Date(period + 'T00:00:00'))

  return (
    <Link
      to="/dashboard/payroll"
      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-warning) 40%, var(--color-border))',
        backgroundColor: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-sm" style={{ color: 'var(--color-text)' }}>{t.payrollReminderText(monthName, openCount)}</span>
      </div>
      <span className="shrink-0 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>{t.payrollReminderCta} →</span>
    </Link>
  )
}
