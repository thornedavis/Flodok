import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../Modal'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { currentPeriodMonth, formatIdr } from '../../lib/credits'
import type { AllowanceAdjustment, User } from '../../types/database'

const sectionHeadingStyle: React.CSSProperties = { color: 'var(--color-text-tertiary)' }
const fieldLabelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' }
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

export function AllowanceSection({
  user,
  employeeId,
  baselineIdr,
}: {
  user: User
  employeeId: string
  baselineIdr: number | null
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [adjustments, setAdjustments] = useState<AllowanceAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const period = currentPeriodMonth()

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('allowance_adjustments')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
    setAdjustments(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [employeeId])

  const periodRows = useMemo(
    () => adjustments.filter(a => a.period_month === period),
    [adjustments, period],
  )
  const running = useMemo(() => periodRows.reduce((s, r) => s + r.amount_idr, 0), [periodRows])
  const baseline = baselineIdr ?? 0
  const effective = Math.max(0, baseline + running)

  function openModal() {
    setModalOpen(true)
    setAmount('')
    setReason('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed === 0) {
      setError(t.validationAmountNonZero)
      return
    }
    if (reason.trim().length < 20) {
      setError(t.validationReasonMinLength)
      return
    }
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('allowance_adjustments').insert({
      org_id: user.org_id,
      employee_id: employeeId,
      amount_idr: Math.round(parsed),
      reason: reason.trim(),
      awarded_by: user.id,
      period_month: period,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setModalOpen(false)
    await load()
  }

  const hasBaseline = baseline > 0
  const pctRemaining = hasBaseline ? Math.round((effective / baseline) * 100) : 0

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={sectionHeadingStyle}>
          {t.allowanceSection}
        </h2>
        {isAdmin && hasBaseline && (
          <button
            type="button"
            onClick={openModal}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.applyAdjustment}
          </button>
        )}
      </div>

      {!hasBaseline && (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.noActiveContract}
        </div>
      )}

      {hasBaseline && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.allowanceEffective}</p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
              {formatIdr(effective, lang)}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {pctRemaining}% · {t.allowanceBaseline} {formatIdr(baseline, lang)}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pctRemaining}%`,
                  backgroundColor: pctRemaining >= 80 ? 'var(--color-success, #16a34a)' : pctRemaining >= 50 ? 'var(--color-warning)' : 'var(--color-danger)',
                }}
              />
            </div>
          </div>

          <div className="md:col-span-2 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            {error && (
              <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                {error}
              </div>
            )}
            {loading ? (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>...</p>
            ) : periodRows.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.creditsEmptyForEmployee}</p>
            ) : (
              <ul className="space-y-2">
                {periodRows.map(row => (
                  <li key={row.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm" style={{ color: 'var(--color-text)' }}>{row.reason}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {new Date(row.created_at).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US')}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: row.amount_idr > 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-diff-remove)',
                        color: row.amount_idr > 0 ? 'var(--color-success, #16a34a)' : 'var(--color-danger)',
                      }}
                    >
                      {row.amount_idr > 0 ? '+' : ''}{formatIdr(row.amount_idr, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t.applyAdjustment}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={fieldLabelStyle}>{t.adjustmentAmountLabel}</label>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={fieldLabelStyle}>{t.reasonLabel}</label>
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
              onClick={() => setModalOpen(false)}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {submitting ? '...' : t.submitAdjust}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
