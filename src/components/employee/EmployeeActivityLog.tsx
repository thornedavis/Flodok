import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { formatIdr } from '../../lib/credits'
import type { User } from '../../types/aliases'

type Entry = {
  id: string
  created_at: string
  amount_idr: number
  reason: string
  paid_out_at: string | null
  awarded_by_name: string | null
  task_id: string | null
  linkedTask?: { title: string; status: string } | null
}

const LIMIT = 30
const sectionHeadingStyle: React.CSSProperties = { color: 'var(--color-text-tertiary)' }

export function EmployeeActivityLog({ user, employeeId, refreshKey = 0, period, editable = false, onChanged }: {
  user: User
  employeeId: string
  refreshKey?: number
  period?: string
  /** The selected period is the current, open month (deletions allowed). */
  editable?: boolean
  /** Called after a successful delete so the parent can refresh the payout. */
  onChanged?: () => void
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      let q = supabase
        .from('pay_adjustments')
        .select('id, created_at, amount_idr, reason, paid_out_at, task_id, awardedBy:users!pay_adjustments_awarded_by_fkey(name)')
        .eq('employee_id', employeeId)
      // When a period is given, scope the log to that month; otherwise show the
      // most recent activity across all periods.
      if (period) q = q.eq('period_month', period)
      const { data } = await q.order('created_at', { ascending: false }).limit(LIMIT)
      if (cancelled) return
      let rows = (data ?? []).map((r): Entry => {
        const awarder = r.awardedBy as { name: string } | { name: string }[] | null
        const name = Array.isArray(awarder) ? awarder[0]?.name ?? null : awarder?.name ?? null
        return {
          id: r.id,
          created_at: r.created_at,
          amount_idr: r.amount_idr,
          reason: r.reason,
          paid_out_at: r.paid_out_at,
          awarded_by_name: name,
          task_id: r.task_id,
          linkedTask: null,
        }
      })
      // Resolve linked-task titles in one round-trip. RLS scopes tasks to the org
      // and drops trashed rows, so a since-deleted task simply loses its chip —
      // the reason text (auto-filled from the task) still carries the context.
      const taskIds = [...new Set(rows.map(r => r.task_id).filter((id): id is string => !!id))]
      if (taskIds.length > 0) {
        const { data: taskRows } = await supabase.from('tasks').select('id, title, status').in('id', taskIds)
        if (cancelled) return
        const byId = new Map((taskRows ?? []).map(tk => [tk.id, { title: tk.title, status: tk.status }]))
        rows = rows.map(r => (r.task_id ? { ...r, linkedTask: byId.get(r.task_id) ?? null } : r))
      }
      setEntries(rows)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, refreshKey, period])

  async function handleDelete(id: string) {
    if (!window.confirm(t.adjustmentDeleteConfirm)) return
    setDeletingId(id)
    const { error } = await supabase.from('pay_adjustments').delete().eq('id', id)
    setDeletingId(null)
    if (error) { alert(error.message); return }
    setEntries(prev => prev.filter(e => e.id !== id))
    onChanged?.()
  }

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
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {entries.map(e => {
            const positive = e.amount_idr > 0
            const kindLabel = positive ? t.compensationReward : t.compensationPenalise
            const amountStr = `${positive ? '+' : '−'}${formatIdr(Math.abs(e.amount_idr), lang)}`
            const canDelete = isAdmin && editable && !e.paid_out_at
            return (
              <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ color: 'var(--color-text)' }}>{e.reason}</p>
                  {e.linkedTask && (
                    <span
                      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-xs"
                      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
                      title={t.taskLinkChipLabel}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                        <rect x="9" y="3" width="6" height="4" rx="1" />
                      </svg>
                      <span className="truncate">{e.linkedTask.title}</span>
                    </span>
                  )}
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {kindLabel} · {new Date(e.created_at).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}
                    {e.awarded_by_name && <> · {t.awardedBy} {e.awarded_by_name}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: positive ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-diff-remove)',
                      color: positive ? 'var(--color-success, #16a34a)' : 'var(--color-danger)',
                    }}
                  >
                    {amountStr}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      disabled={deletingId === e.id}
                      aria-label={t.delete}
                      title={t.delete}
                      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:opacity-40"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
