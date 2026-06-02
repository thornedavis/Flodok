import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { CompensationOverview } from '../../components/employee/CompensationOverview'
import { InfoTooltip } from '../../components/InfoTooltip'
import { EmployeeActivityLog } from '../../components/employee/EmployeeActivityLog'
import { AchievementsSection } from '../../components/employee/AchievementsSection'
import { MonthStrip } from '../../components/portal/MonthStrip'
import { getAvatarGradient } from '../../lib/avatar'
import { currentPeriodMonth } from '../../lib/credits'
import type { User, Employee, Contract } from '../../types/aliases'

// Boxed external-link affordance for the top-right link out to the full employee
// profile — same glyph as the "open contract" icon on the pay rows, so the card
// uses one consistent "opens elsewhere" symbol.
function ProfileLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

// Dedicated per-employee Performance page (recognition cockpit). Reached from
// the Performance roster. Reuses the rich compensation module (ring + credit/
// bonus actions + modals), the recognition activity log, and the badges
// section — the single home for everything performance-related about one
// person. Pay facts (the contractual numbers) live on the employee's
// Compensation tab instead.

export function PerformanceDetail({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { id: employeeId } = useParams<{ id: string }>()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  // Lifetime experience, computed in the load effect (avoids Date in render).
  const [xp, setXp] = useState(0)
  const [daysEmployed, setDaysEmployed] = useState(0)
  const [hoursPerWeek, setHoursPerWeek] = useState(0)
  // Bumped on any award/deduct so the activity log refetches alongside the ring.
  const [refreshKey, setRefreshKey] = useState(0)

  // Month navigation — a scrollable strip from the employee's start to now.
  const [baseCurrent] = useState(() => currentPeriodMonth())
  const [selectedMonth, setSelectedMonth] = useState(baseCurrent)
  const period = selectedMonth
  const isCurrent = selectedMonth === baseCurrent

  useBreadcrumbTrailing(employee?.name ?? null)

  useEffect(() => {
    if (!employeeId) return
    const id = employeeId
    let cancelled = false
    async function load() {
      setLoading(true)
      const [empRes, contractRes] = await Promise.all([
        supabase.from('employees').select('*').eq('id', id).eq('org_id', user.org_id).maybeSingle(),
        supabase
          .from('contracts')
          .select('*')
          .eq('employee_id', id)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (cancelled) return
      const emp = (empRes.data as Employee | null) ?? null
      const ctr = contractRes.data ?? null
      setEmployee(emp)
      setContract(ctr)
      // Lifetime XP = contracted hours since the employee was created.
      const days = emp?.created_at
        ? Math.max(0, Math.floor((Date.now() - new Date(emp.created_at).getTime()) / 86400000))
        : 0
      const hpw = (ctr?.hours_per_day ?? 0) * (ctr?.days_per_week ?? 0)
      setDaysEmployed(days)
      setHoursPerWeek(hpw)
      setXp(Math.floor((days / 7) * hpw))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, user.org_id])

  if (loading) {
    return <div className="py-8 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
  }
  if (!employee || !employeeId) {
    return <div className="py-8 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.notFoundTitle}</div>
  }

  function bump() { setRefreshKey(k => k + 1) }

  const earliestMonth = (employee.created_at ?? baseCurrent).slice(0, 7) + '-01'

  return (
    <div className="pb-20">
      {/* Month selector spans the full width — everything below reflects the
          selected month. */}
      <div className="mb-6">
        <MonthStrip
          selectedMonth={selectedMonth}
          earliestMonth={earliestMonth}
          currentMonth={baseCurrent}
          onSelect={setSelectedMonth}
          lang={lang}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column (1/3): employee identity (name + XP), payout total +
            stacked stat cards (base wage, allowance, credits ±, bonus +). */}
        <div className="space-y-6 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="h-16 w-16 shrink-0 overflow-hidden rounded-full"
                style={{ background: employee.photo_url ? 'transparent' : getAvatarGradient(employee.id) }}
              >
                {employee.photo_url && <img src={employee.photo_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{employee.name}</h1>
                <div className="mt-1.5">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.portalXp}
                    </span>
                    <span className="ml-1.5 text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                      {xp.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}
                    </span>
                    <InfoTooltip
                      iconBg="var(--color-bg)"
                      text={hoursPerWeek > 0 || daysEmployed > 0
                        ? t.portalExperienceBreakdown(daysEmployed, Math.round(hoursPerWeek))
                        : t.portalNoContractYet}
                    />
                  </span>
                </div>
              </div>
            </div>
            <Link
              to={`/dashboard/employees/${employee.id}/edit`}
              title={t.performanceViewFullProfile}
              aria-label={t.performanceViewFullProfile}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <ProfileLinkIcon />
            </Link>
          </div>

          <CompensationOverview
            user={user}
            employeeId={employeeId}
            contract={contract}
            photoUrl={employee.photo_url}
            period={period}
            readOnly={!isCurrent}
            hideContractHeader
            hideRing
            stacked
            refreshKey={refreshKey}
            onChange={bump}
          />
        </div>

        {/* Right column (2/3): badges and the activity log. */}
        <div className="space-y-8 lg:col-span-2">
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
            <AchievementsSection user={user} employeeId={employeeId} />
          </div>

          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
            <EmployeeActivityLog
            user={user}
            employeeId={employeeId}
            refreshKey={refreshKey}
            period={period}
            editable={isCurrent}
            onChanged={bump}
          />
          </div>
        </div>
      </div>
    </div>
  )
}
