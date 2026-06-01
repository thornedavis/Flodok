import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { CompensationOverview } from '../../components/employee/CompensationOverview'
import { EmployeeActivityLog } from '../../components/employee/EmployeeActivityLog'
import { AchievementsSection } from '../../components/employee/AchievementsSection'
import { MonthStrip } from '../../components/portal/MonthStrip'
import { getAvatarGradient } from '../../lib/avatar'
import { currentPeriodMonth } from '../../lib/credits'
import type { User, Employee, Contract } from '../../types/aliases'

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
        {/* Left column (1/3): employee identity, payout total + stacked stat
            cards (base wage, allowance, credits ±, bonus +), then experience. */}
        <div className="space-y-6 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
          <div className="flex items-center gap-3">
            <div
              className="h-12 w-12 shrink-0 overflow-hidden rounded-full"
              style={{ background: employee.photo_url ? 'transparent' : getAvatarGradient(employee.id) }}
            >
              {employee.photo_url && <img src={employee.photo_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{employee.name}</h1>
              <Link
                to={`/dashboard/employees/${employee.id}/edit`}
                className="text-xs"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t.performanceViewFullProfile} →
              </Link>
            </div>
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

          <div className="border-t pt-6" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.portalExperience}
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
              {t.portalExperienceXp(xp)}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {hoursPerWeek > 0 || daysEmployed > 0
                ? t.portalExperienceBreakdown(daysEmployed, Math.round(hoursPerWeek))
                : t.portalNoContractYet}
            </p>
          </div>
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
