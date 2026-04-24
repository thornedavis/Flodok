import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../Modal'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { currentPeriodMonth, creditToIdr, formatIdr } from '../../lib/credits'
import type { CreditAdjustment, User } from '../../types/database'

const sectionHeadingStyle: React.CSSProperties = { color: 'var(--color-text-tertiary)' }
const fieldLabelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' }
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

type Mode = 'award' | 'deduct'

export function CreditsSection({
  user,
  employeeId,
  divisor,
  allowanceIdr,
}: {
  user: User
  employeeId: string
  divisor: number
  allowanceIdr: number | null
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [adjustments, setAdjustments] = useState<CreditAdjustment[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode | null>(null)
  const [amountCredits, setAmountCredits] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cashingOut, setCashingOut] = useState(false)
  const [info, setInfo] = useState('')

  const period = currentPeriodMonth()

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('credit_adjustments')
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
  const net = useMemo(() => periodRows.reduce((sum, r) => sum + r.amount, 0), [periodRows])
  const frozen = periodRows.some(r => r.paid_out_at != null)
  const canCashOut = isAdmin && !frozen && net > 0 && (allowanceIdr ?? 0) > 0

  function openModal(m: Mode) {
    setMode(m)
    setAmountCredits('')
    setReason('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return
    const parsed = Number(amountCredits)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t.validationAmountPositive)
      return
    }
    if (reason.trim().length < 20) {
      setError(t.validationReasonMinLength)
      return
    }
    setSubmitting(true)
    setError('')
    const amount = mode === 'award' ? Math.round(parsed) : -Math.round(parsed)
    const { error: insertError } = await supabase.from('credit_adjustments').insert({
      org_id: user.org_id,
      employee_id: employeeId,
      amount,
      reason: reason.trim(),
      awarded_by: user.id,
      period_month: period,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setMode(null)
    await load()
  }

  async function handleCashOut() {
    if (!canCashOut) return
    if (!window.confirm(t.cashOutConfirm)) return
    setCashingOut(true)
    setError('')
    setInfo('')
    const { data, error: rpcError } = await supabase.rpc('close_credit_period', {
      target_employee_id: employeeId,
      target_period_month: period,
    })
    setCashingOut(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (typeof data === 'number') setInfo(t.cashOutDone(data))
    await load()
  }

  const creditsIdrRate = allowanceIdr && divisor > 0
    ? Math.round(allowanceIdr / divisor)
    : 0
  const parsedAmountCredits = Number(amountCredits)
  const previewIdr = Number.isFinite(parsedAmountCredits) && allowanceIdr
    ? creditToIdr(parsedAmountCredits, allowanceIdr, divisor)
    : 0

  const hasAllowance = (allowanceIdr ?? 0) > 0

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={sectionHeadingStyle}>
          {t.creditsSection}
        </h2>
        {isAdmin && hasAllowance && !frozen && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openModal('award')}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-success, #16a34a)' }}
            >
              {t.awardCredits}
            </button>
            <button
              type="button"
              onClick={() => openModal('deduct')}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
            >
              {t.deductCredits}
            </button>
            {canCashOut && (
              <button
                type="button"
                onClick={handleCashOut}
                disabled={cashingOut}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {cashingOut ? '...' : t.cashOutPeriod}
              </button>
            )}
          </div>
        )}
      </div>

      {!hasAllowance && (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.noActiveContract}
        </div>
      )}

      {hasAllowance && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.currentPeriodBalance}</p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{net}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.netCredits}
              {' · ≈ '}
              {formatIdr(creditToIdr(net, allowanceIdr ?? 0, divisor), lang)}
            </p>
            {frozen && <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>{t.frozenPeriod}</p>}
          </div>

          <div className="md:col-span-2 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
            {info && (
              <div className="mb-3 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-success-bg, #dcfce7)', color: 'var(--color-success, #16a34a)' }}>
                {info}
              </div>
            )}
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
                        {row.paid_out_at && row.payout_idr != null && ` · ${formatIdr(row.payout_idr, lang)}`}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: row.amount > 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-diff-remove)',
                        color: row.amount > 0 ? 'var(--color-success, #16a34a)' : 'var(--color-danger)',
                      }}
                    >
                      {row.amount > 0 ? '+' : ''}{row.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'award' ? t.awardCreditsTitle : t.deductCreditsTitle}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={fieldLabelStyle}>{t.creditsAmountLabel}</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amountCredits}
              onChange={e => setAmountCredits(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              autoFocus
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.creditsAmountHelp(creditsIdrRate)}
              {amountCredits && ` · ${mode === 'deduct' ? '−' : ''}${formatIdr(previewIdr, lang)}`}
            </p>
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
              onClick={() => setMode(null)}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: mode === 'award' ? 'var(--color-success, #16a34a)' : 'var(--color-danger)' }}
            >
              {submitting ? '...' : mode === 'award' ? t.submitAward : t.submitDeduct}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
