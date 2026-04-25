import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { formatIdr } from '../../lib/credits'

type Entry = {
  id: string
  kind: 'credit' | 'bonus'
  created_at: string
  amount: number
  reason: string
  period_month: string
}

const LIMIT = 30
const sectionHeadingStyle: React.CSSProperties = { color: 'var(--color-text-tertiary)' }

export function EmployeeActivityLog({ employeeId, refreshKey = 0 }: { employeeId: string; refreshKey?: number }) {
  const { t, lang } = useLang()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [creditRes, bonusRes] = await Promise.all([
        supabase
          .from('credit_adjustments')
          .select('id, created_at, amount, reason, period_month')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
        supabase
          .from('bonus_adjustments')
          .select('id, created_at, amount_idr, reason, period_month')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
      ])
      if (cancelled) return
      const credit: Entry[] = (creditRes.data || []).map(r => ({
        id: `c-${r.id}`,
        kind: 'credit',
        created_at: r.created_at,
        amount: r.amount,
        reason: r.reason,
        period_month: r.period_month,
      }))
      const bonus: Entry[] = (bonusRes.data || []).map(r => ({
        id: `b-${r.id}`,
        kind: 'bonus',
        created_at: r.created_at,
        amount: r.amount_idr,
        reason: r.reason,
        period_month: r.period_month,
      }))
      const merged = [...credit, ...bonus]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, LIMIT)
      setEntries(merged)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, refreshKey])

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={sectionHeadingStyle}>
        {t.activityLogTitle}
      </h2>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>...</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.activityLogEmpty}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          {entries.map(e => {
            const positive = e.amount > 0
            const kindLabel = e.kind === 'bonus'
              ? t.activityKindBonus
              : t.activityKindCredits
            const amountStr = e.kind === 'credit'
              ? `${positive ? '+' : ''}${e.amount} ${t.activityKindCredits}`
              : `${positive ? '+' : ''}${formatIdr(e.amount, lang)}`
            return (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ color: 'var(--color-text)' }}>{e.reason}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {kindLabel} · {new Date(e.created_at).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: positive ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-diff-remove)',
                    color: positive ? 'var(--color-success, #16a34a)' : 'var(--color-danger)',
                  }}
                >
                  {amountStr}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
