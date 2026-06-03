import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { useBilling } from '../../contexts/BillingContext'
import { Modal } from '../Modal'
import { InfoTooltip } from '../InfoTooltip'
import { currentPeriodMonth, formatIdr, formatIdrDigits } from '../../lib/credits'
import { documentEditPath } from '../../lib/documentTypes'
import { CompensationRing, ShieldPath, WalletPath, CoinPath } from '../portal/CompensationRing'
import { StatRow } from '../portal/StatRow'
import type { Contract, User } from '../../types/aliases'

function ShieldIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function WalletIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
}
function AdjustmentsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h6"/></svg>
}
// External-link glyph — these rows open the contract editor to change baseline
// pay. Same "open" glyph as the card's top-right profile button.
function OpenContractIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    )
  }
  if (direction === 'down') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

export function CompensationOverview({
  user,
  employeeId,
  contract,
  photoUrl,
  refreshKey = 0,
  onChange,
  period: periodProp,
  readOnly = false,
  hideContractHeader = false,
  stacked = false,
  hideRing = false,
}: {
  user: User
  employeeId: string
  contract: Contract | null
  photoUrl: string | null
  refreshKey?: number
  onChange?: () => void
  /** Period month (YYYY-MM-01). Defaults to the current period. */
  period?: string
  /** Hide the reward/penalty actions (e.g. when viewing a past month). */
  readOnly?: boolean
  /** Hide the "Contract" heading + "Edit contract" link. */
  hideContractHeader?: boolean
  /** Stack the ring on top of single-column stat cards (for a narrow column). */
  stacked?: boolean
  /** Hide the payout ring entirely (just the payout total + stat cards). */
  hideRing?: boolean
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const { canWrite } = useBilling()
  const [adjustmentNet, setAdjustmentNet] = useState(0)
  const [frozen, setFrozen] = useState(false)
  const [maxAdjustmentIdr, setMaxAdjustmentIdr] = useState<number | null>(null)
  // Frozen snapshot for a closed period (base/allowance/payout captured at close,
  // migration 144); null for the current/open period, which is computed live.
  const [settlement, setSettlement] = useState<{ base_idr: number; allowance_idr: number; adjustment_net_idr: number; payout_idr: number } | null>(null)

  const [payAction, setPayAction] = useState<'reward' | 'penalise' | null>(null)

  const period = periodProp ?? currentPeriodMonth()

  useEffect(() => {
    let cancelled = false
    async function load() {
      type SettlementRpc = (fn: 'admin_pay_settlement', args: { p_employee_id: string; p_period_month: string }) => Promise<{ data: { base_idr: number; allowance_idr: number; adjustment_net_idr: number; payout_idr: number } | null }>
      const [adjRes, orgRes, setlRes] = await Promise.all([
        supabase
          .from('pay_adjustments')
          .select('amount_idr, paid_out_at')
          .eq('employee_id', employeeId)
          .eq('period_month', period),
        supabase
          .from('organizations')
          .select('max_bonus_idr')
          .eq('id', user.org_id)
          .single(),
        (supabase.rpc as unknown as SettlementRpc)('admin_pay_settlement', { p_employee_id: employeeId, p_period_month: period }),
      ])
      if (cancelled) return
      const rows = adjRes.data || []
      setAdjustmentNet(rows.reduce((s, r) => s + (r.amount_idr || 0), 0))
      setFrozen(rows.some(r => r.paid_out_at != null))
      setMaxAdjustmentIdr(orgRes.data?.max_bonus_idr ?? null)
      setSettlement(setlRes.data ?? null)
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, period, refreshKey, user.org_id])

  // For a settled (closed) period, show the frozen snapshot rather than
  // recomputing from the current contract — so past months don't move.
  const settled = settlement != null
  const baseWage = settled ? settlement.base_idr : (contract?.base_wage_idr ?? 0)
  const allowance = settled ? settlement.allowance_idr : (contract?.allowance_idr ?? 0)
  const hasContract = settled ? true : (!!contract && baseWage > 0)
  const baseline = baseWage + allowance
  const total = settled ? settlement.payout_idr : Math.max(0, baseline + adjustmentNet)
  const delta = total - baseline

  const adjustmentColor = adjustmentNet > 0
    ? 'var(--color-success, #16a34a)'
    : adjustmentNet < 0
      ? 'var(--color-danger)'
      : 'var(--color-text-tertiary)'

  const trendColor = delta > 0
    ? 'var(--color-success, #16a34a)'
    : delta < 0
      ? 'var(--color-danger)'
      : 'var(--color-text-tertiary)'

  const ringSegments = [
    { key: 'base', valueIdr: baseWage, color: 'var(--color-text-secondary)', icon: <ShieldPath /> },
    { key: 'allowance', valueIdr: allowance, color: '#16a34a', icon: <WalletPath /> },
    { key: 'adjustment', valueIdr: Math.max(0, adjustmentNet), color: '#3b82f6', icon: <CoinPath /> },
  ]

  const canAdjust = isAdmin && hasContract && !readOnly && !frozen && !settled

  const netLabel = `${adjustmentNet > 0 ? '+' : adjustmentNet < 0 ? '−' : ''}${formatIdr(Math.abs(adjustmentNet), lang)}`

  // Base wage + allowance are both contract-defined, so each row gets a subtle
  // icon shortcut into the contract editor — admins only, and only when a
  // contract exists. Shared by both StatRows below.
  const adjustAction = isAdmin && contract ? (
    <Link
      to={documentEditPath('contract', contract.id)}
      title={t.adjust}
      aria-label={t.adjust}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      <OpenContractIcon />
    </Link>
  ) : undefined

  return (
    <section>
      {!hideContractHeader && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.contractSnapshotTitle}
          </h2>
          {contract && (
            <Link to={documentEditPath('contract', contract.id)} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t.contractSnapshotEdit} →
            </Link>
          )}
        </div>
      )}

      {!hasContract ? (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotNoActive}
        </div>
      ) : (
        <div className={stacked ? 'flex flex-col gap-6' : 'grid gap-6 md:grid-cols-[260px_1fr] md:items-center'}>
          {!hideRing && (
            <div className={stacked ? 'flex justify-center' : 'flex justify-center md:justify-start'}>
              <CompensationRing segments={ringSegments} photoUrl={photoUrl} employeeId={employeeId} size={260} />
            </div>
          )}

          <div className={stacked ? 'w-full' : ''}>
            <p className="flex items-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.portalMonthlyPayout}
              <InfoTooltip text={t.portalMonthlyPayoutInfo} />
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
              {formatIdr(total, lang)}
            </p>
            <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: trendColor }}>
              <TrendIcon direction={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'} />
              {delta === 0
                ? t.portalSteady
                : <>{delta > 0 ? '+' : '−'}{formatIdr(Math.abs(delta), lang)} {t.portalVsBaseline}</>}
            </div>

            {canAdjust && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayAction('reward')}
                  disabled={!canWrite}
                  title={!canWrite ? t.dunningWriteBlocked : undefined}
                  className="rounded-lg py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-success, #16a34a)' }}
                >
                  {t.compensationReward}
                </button>
                <button
                  type="button"
                  onClick={() => setPayAction('penalise')}
                  disabled={!canWrite}
                  title={!canWrite ? t.dunningWriteBlocked : undefined}
                  className="rounded-lg py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-danger)' }}
                >
                  {t.compensationPenalise}
                </button>
              </div>
            )}

            <div className={stacked ? 'mt-4 [&>*:first-child]:border-t-0' : 'mt-4 grid grid-cols-2 gap-2'}>
              <StatRow
                flat={stacked}
                icon={<ShieldIcon />}
                label={t.portalBaseWage}
                info={t.portalBaseWageInfo}
                value={formatIdr(baseWage, lang)}
                accent="var(--color-text-secondary)"
                actions={adjustAction}
              />
              <StatRow
                flat={stacked}
                icon={<WalletIcon />}
                label={t.portalAllowance}
                info={t.portalAllowanceInfo}
                value={formatIdr(allowance, lang)}
                accent="var(--color-text-secondary)"
                actions={adjustAction}
              />
              <StatRow
                flat={stacked}
                icon={<AdjustmentsIcon />}
                label={t.portalAdjustments}
                info={t.portalAdjustmentsInfo}
                value={<span style={{ color: adjustmentColor }}>{netLabel}</span>}
                accent="#3b82f6"
              />
            </div>
          </div>
        </div>
      )}

      {payAction && (
        <PayAdjustmentModal
          mode={payAction}
          user={user}
          employeeId={employeeId}
          period={period}
          baseWage={baseWage}
          allowance={allowance}
          currentNet={adjustmentNet}
          maxIdr={maxAdjustmentIdr}
          onClose={() => setPayAction(null)}
          onDone={() => { setPayAction(null); onChange?.() }}
        />
      )}
    </section>
  )
}

// ─── Reward / Penalise modal ─────────────────────────────

function PayAdjustmentModal({
  mode,
  user,
  employeeId,
  period,
  baseWage,
  allowance,
  currentNet,
  maxIdr,
  onClose,
  onDone,
}: {
  mode: 'reward' | 'penalise'
  user: User
  employeeId: string
  period: string
  baseWage: number
  allowance: number
  currentNet: number
  maxIdr: number | null
  onClose: () => void
  onDone: () => void
}) {
  const { t, lang } = useLang()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const parsed = Number(amount)
  const isValidAmount = Number.isFinite(parsed) && parsed > 0
  const signed = mode === 'reward' ? Math.round(parsed) : -Math.round(parsed)
  const resultingPay = isValidAmount
    ? Math.max(0, baseWage + allowance + currentNet + signed)
    : Math.max(0, baseWage + allowance + currentNet)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAmount) { setError(t.validationAmountPositive); return }
    if (maxIdr != null && parsed > maxIdr) {
      setError(t.capExceededBonus(formatIdr(maxIdr, lang)))
      return
    }
    if (reason.trim().length < 20) { setError(t.validationReasonMinLength); return }
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('pay_adjustments').insert({
      org_id: user.org_id,
      employee_id: employeeId,
      period_month: period,
      amount_idr: signed,
      reason: reason.trim(),
      awarded_by: user.id,
    })
    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={mode === 'reward' ? t.compensationReward : t.compensationPenalise}>
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
          {isValidAmount && (
            <p className="mt-1 text-xs" style={{ color: mode === 'penalise' && resultingPay === 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
              {t.adjustmentResultingPay(formatIdr(resultingPay, lang))}
            </p>
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
            {submitting ? '...' : mode === 'reward' ? t.compensationReward : t.compensationPenalise}
          </button>
        </div>
      </form>
    </Modal>
  )
}
