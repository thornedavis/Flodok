import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { formatIdr, formatIdrDigits } from '../../lib/credits'
import { monthLong } from '../Metrics'
import { Modal } from '../Modal'
import { listEmployeeTasks, type Task } from '../../lib/tasks'
import { SearchSelect } from '../SearchSelect'
import type { User } from '../../types/aliases'

// Matches the local inputStyle used across the employee modals.
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

// Local calendar day as YYYY-MM-DD, to compare against a task's (tz-naive) due_date.
function localTodayIso(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Float the mode-relevant tasks to the top: open/overdue first when penalising,
// most-recently-completed first when rewarding. Every task stays selectable.
function sortTasksForMode(rows: Task[], mode: 'reward' | 'penalise', todayIso: string): Task[] {
  const rank = (task: Task): number => {
    const done = task.status === 'done'
    if (mode === 'penalise') {
      if (done) return 2
      return task.due_date && task.due_date < todayIso ? 0 : 1
    }
    return done ? 0 : 1
  }
  return [...rows].sort((a, b) => {
    const diff = rank(a) - rank(b)
    if (diff !== 0) return diff
    if (mode === 'reward' && a.status === 'done' && b.status === 'done') {
      return (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
    }
    return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
  })
}

/**
 * Reward / Penalise a month's pay for one employee — a single signed row in
 * `pay_adjustments`. Shared by the Performance roster and the per-employee
 * compensation card. Optionally links the adjustment to the task that motivated
 * it: picking a task pre-fills (and structurally links) the reason, so a written
 * note becomes optional.
 */
export function PayAdjustmentModal({
  mode,
  user,
  employeeId,
  employeeName,
  period,
  maxIdr,
  resultingPay,
  onClose,
  onDone,
}: {
  mode: 'reward' | 'penalise'
  user: User
  employeeId: string
  /** Appended to the title when shown from the roster (omit on the single-employee card). */
  employeeName?: string
  period: string
  maxIdr: number | null
  /** When provided, the amount hint previews the resulting monthly pay instead of the cap. */
  resultingPay?: { baseWage: number; allowance: number; currentNet: number }
  onClose: () => void
  onDone: () => void
}) {
  const { t, lang } = useLang()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  // The last auto-filled reason, so re-picking updates it but manual edits stick.
  const [autoReason, setAutoReason] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const todayIso = useMemo(() => localTodayIso(), [])

  // employeeId/mode are fixed for the modal's lifetime, so tasksLoading starts
  // true and we only clear it here — no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false
    listEmployeeTasks(employeeId)
      .then(rows => { if (!cancelled) setTasks(sortTasksForMode(rows, mode, todayIso)) })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setTasksLoading(false) })
    return () => { cancelled = true }
  }, [employeeId, mode, todayIso])

  const parsed = Number(amount)
  const isValidAmount = Number.isFinite(parsed) && parsed > 0
  const signed = mode === 'reward' ? Math.round(parsed) : -Math.round(parsed)
  const resultingPayValue = resultingPay
    ? Math.max(0, resultingPay.baseWage + resultingPay.allowance + resultingPay.currentNet + (isValidAmount ? signed : 0))
    : null

  function handlePickTask(newId: string | null) {
    setTaskId(newId)
    const task = newId ? tasks.find(x => x.id === newId) : undefined
    const derived = task
      ? (mode === 'reward' ? t.taskLinkReasonReward(task.title) : t.taskLinkReasonPenalise(task.title))
      : ''
    // Only overwrite the reason if it's still empty or the previous auto value.
    setReason(prev => (prev.trim() === '' || prev === autoReason) ? derived : prev)
    setAutoReason(derived)
  }

  function taskStatusLabel(status: string): string {
    const m: Record<string, string> = {
      todo: t.tasksStatusTodo,
      in_progress: t.tasksStatusInProgress,
      blocked: t.tasksStatusBlocked,
      done: t.tasksStatusDone,
    }
    return m[status] ?? status
  }

  // Meta shown after the title in each row, e.g. "Blocked · overdue Jul 4".
  function taskMeta(task: Task): string {
    const parts = [taskStatusLabel(task.status)]
    if (task.due_date) {
      const d = new Date(`${task.due_date}T00:00:00`).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })
      const overdue = task.status !== 'done' && task.due_date < todayIso
      parts.push(overdue ? `${t.taskLinkOverdue} ${d}` : t.taskLinkDue(d))
    }
    return parts.join(' · ')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAmount) { setError(t.validationAmountPositive); return }
    if (maxIdr != null && parsed > maxIdr) {
      setError(t.capExceededBonus(formatIdr(maxIdr, lang)))
      return
    }
    // A linked task carries the reason (auto-filled from its title), so a typed
    // note is optional; without a task the 20-char note rule still applies. When
    // a task is linked we fall back to the derived reason for empty/too-short
    // input so we never trip the DB's 3-char floor.
    const typed = reason.trim()
    let finalReason: string
    if (taskId) {
      finalReason = typed.length >= 3 ? typed : autoReason.trim()
    } else {
      if (typed.length < 20) { setError(t.validationReasonMinLength); return }
      finalReason = typed
    }
    if (finalReason.length < 3) { setError(t.validationReasonMinLength); return }
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('pay_adjustments').insert({
      org_id: user.org_id,
      employee_id: employeeId,
      period_month: period,
      amount_idr: signed,
      reason: finalReason,
      awarded_by: user.id,
      task_id: taskId,
    })
    setSubmitting(false)
    if (insertError) {
      setError(/frozen/i.test(insertError.message) ? t.adjustmentFrozenError(monthLong(period, lang)) : insertError.message)
      return
    }
    onDone()
  }

  const actionLabel = mode === 'reward' ? t.compensationReward : t.compensationPenalise

  return (
    <Modal open onClose={onClose} title={employeeName ? `${actionLabel} — ${employeeName}` : actionLabel}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.bonusAmountLabel}</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatIdrDigits(amount)}
              onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              style={inputStyle}
              autoFocus
            />
          </div>
          {resultingPay ? (
            isValidAmount && (
              <p className="mt-1 text-xs" style={{ color: mode === 'penalise' && resultingPayValue === 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
                {t.adjustmentResultingPay(formatIdr(resultingPayValue ?? 0, lang))}
              </p>
            )
          ) : (
            maxIdr != null && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{`max ${formatIdr(maxIdr, lang)}`}</p>
            )
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.taskLinkLabel}</label>
          {tasksLoading ? (
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>...</p>
          ) : tasks.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.taskLinkNoTasks}</p>
          ) : (
            <>
              <SearchSelect
                value={taskId}
                onChange={handlePickTask}
                items={tasks}
                getKey={task => task.id}
                getSearchText={task => `${task.title} · ${taskMeta(task)}`}
                getSelectedLabel={task => task.title}
                renderOption={task => (
                  <>
                    <span>{task.title}</span>
                    <span className="ml-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>· {taskMeta(task)}</span>
                  </>
                )}
                placeholder={t.taskLinkSearchPlaceholder}
                emptyLabel={t.taskLinkNone}
                noMatchLabel={t.taskLinkNoMatch}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.taskLinkHelp}</p>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.reasonLabel}</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.reasonHelp}</p>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: mode === 'reward' ? 'var(--color-success, #16a34a)' : 'var(--color-danger)' }}
          >
            {submitting ? '...' : actionLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
