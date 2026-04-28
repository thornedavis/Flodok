import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { Modal } from '../Modal'
import { InfoTooltip } from '../InfoTooltip'
import { currentPeriodMonth, formatIdr, allowanceGradientColor, creditToIdr } from '../../lib/credits'
import { CompensationRing, ShieldPath, WalletPath, CoinPath, GiftPath } from '../portal/CompensationRing'
import { StatRow } from '../portal/StatRow'
import type { Contract, User } from '../../types/aliases'

function ShieldIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function WalletIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
}
function CreditsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h6"/></svg>
}
function BonusIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
}
function MinusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    )
  }
  if (direction === 'down') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
  divisor,
  refreshKey = 0,
  onChange,
}: {
  user: User
  employeeId: string
  contract: Contract | null
  photoUrl: string | null
  divisor: number
  refreshKey?: number
  onChange?: () => void
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [creditNet, setCreditNet] = useState(0)
  const [creditFrozen, setCreditFrozen] = useState(false)
  const [bonusSum, setBonusSum] = useState(0)
  const [maxBonusIdr, setMaxBonusIdr] = useState<number | null>(null)
  const [maxCreditPerAward, setMaxCreditPerAward] = useState<number | null>(null)

  const [creditAction, setCreditAction] = useState<'award' | 'deduct' | null>(null)
  const [bonusModalOpen, setBonusModalOpen] = useState(false)

  const period = currentPeriodMonth()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [creditRes, bonusRes, orgRes] = await Promise.all([
        supabase
          .from('credit_adjustments')
          .select('amount, paid_out_at')
          .eq('employee_id', employeeId)
          .eq('period_month', period),
        supabase
          .from('bonus_adjustments')
          .select('amount_idr')
          .eq('employee_id', employeeId)
          .eq('period_month', period),
        supabase
          .from('organizations')
          .select('max_bonus_idr, max_credit_per_award')
          .eq('id', user.org_id)
          .single(),
      ])
      if (cancelled) return
      const cRows = creditRes.data || []
      const cNet = cRows.reduce((s, r) => s + (r.amount || 0), 0)
      const frozen = cRows.some(r => r.paid_out_at != null)
      const bSum = (bonusRes.data || []).reduce((s, r) => s + (r.amount_idr || 0), 0)
      setCreditNet(cNet)
      setCreditFrozen(frozen)
      setBonusSum(bSum)
      setMaxBonusIdr(orgRes.data?.max_bonus_idr ?? null)
      setMaxCreditPerAward(orgRes.data?.max_credit_per_award ?? null)
    }
    load()
    return () => { cancelled = true }
  }, [employeeId, period, refreshKey])

  const baseWage = contract?.base_wage_idr ?? 0
  const baselineAllowance = contract?.allowance_idr ?? 0
  const creditIdr = divisor > 0 && baselineAllowance > 0
    ? Math.round((creditNet * baselineAllowance) / divisor)
    : 0
  const allowanceShrink = Math.min(baselineAllowance, Math.max(0, -creditIdr))
  const effectiveAllowance = Math.max(0, baselineAllowance - allowanceShrink)
  const projectedCreditsIdr = Math.max(0, creditIdr)
  const allowancePct = baselineAllowance > 0
    ? Math.round((effectiveAllowance / baselineAllowance) * 100)
    : 0
  const hasContract = !!contract && baseWage > 0
  const allowanceColor = allowanceGradientColor(allowancePct / 100)
  const creditsColor = creditFrozen
    ? 'var(--color-text-tertiary)'
    : creditNet < 0
      ? 'var(--color-danger)'
      : '#3b82f6'
  const bonusColor = '#a855f7'

  const ringSegments = [
    { key: 'base', valueIdr: baseWage, color: 'var(--color-text-secondary)', icon: <ShieldPath /> },
    {
      key: 'allowance',
      valueIdr: effectiveAllowance,
      baselineIdr: baselineAllowance,
      color: allowanceColor,
      icon: <WalletPath />,
    },
    { key: 'credits', valueIdr: projectedCreditsIdr, color: creditsColor, icon: <CoinPath /> },
    { key: 'bonus', valueIdr: bonusSum, color: bonusColor, icon: <GiftPath /> },
  ]

  const total = baseWage + effectiveAllowance + projectedCreditsIdr + bonusSum
  const baseline = baseWage + baselineAllowance
  const delta = total - baseline

  const trendColor = delta > 0
    ? 'var(--color-success, #16a34a)'
    : delta < 0
      ? 'var(--color-danger)'
      : 'var(--color-text-tertiary)'

  const canAdjust = isAdmin && hasContract
  const canAdjustCredits = canAdjust && !creditFrozen

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotTitle}
        </h2>
        {contract && (
          <Link
            to={`/dashboard/contracts/${contract.id}/edit`}
            className="text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {t.contractSnapshotEdit} →
          </Link>
        )}
      </div>

      {!hasContract ? (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotNoActive}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[260px_1fr] md:items-center">
          <div className="flex justify-center md:justify-start">
            <CompensationRing
              segments={ringSegments}
              photoUrl={photoUrl}
              employeeId={employeeId}
              size={260}
            />
          </div>

          <div>
            <p className="flex items-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.portalMonthlyPayout}
              <InfoTooltip text={t.portalMonthlyPayoutInfo} />
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
              {formatIdr(total, lang)}
            </p>
            <div
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: trendColor }}
            >
              <TrendIcon direction={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'} />
              {delta === 0
                ? t.portalSteady
                : <>{delta > 0 ? '+' : ''}{formatIdr(delta, lang)} {t.portalVsBaseline}</>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatRow
                icon={<ShieldIcon />}
                label={t.portalBaseWage}
                info={t.portalBaseWageInfo}
                value={formatIdr(baseWage, lang)}
                accent="var(--color-text-secondary)"
              />
              <StatRow
                icon={<WalletIcon />}
                label={t.portalAllowance}
                info={t.portalAllowanceInfo}
                value={formatIdr(effectiveAllowance, lang)}
                accent={allowanceColor}
                actions={canAdjust && contract ? (
                  <Link
                    to={`/dashboard/contracts/${contract.id}/edit`}
                    className="text-xs"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {t.adjust} →
                  </Link>
                ) : undefined}
              />
              <StatRow
                icon={<CreditsIcon />}
                label={t.portalCredits}
                info={t.portalCreditsInfo}
                value={creditNet}
                accent={creditsColor}
                actions={canAdjustCredits ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCreditAction('award')}
                      aria-label={t.awardCredits}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: 'var(--color-success, #16a34a)' }}
                    >
                      <PlusIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreditAction('deduct')}
                      aria-label={t.deductCredits}
                      className="flex h-7 w-7 items-center justify-center rounded-md border"
                      style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    >
                      <MinusIcon />
                    </button>
                  </>
                ) : undefined}
              />
              <StatRow
                icon={<BonusIcon />}
                label={t.portalBonus}
                info={t.portalBonusInfo}
                value={formatIdr(bonusSum, lang)}
                accent={bonusColor}
                actions={canAdjust ? (
                  <button
                    type="button"
                    onClick={() => setBonusModalOpen(true)}
                    aria-label={t.bonusAward}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white"
                    style={{ backgroundColor: 'var(--color-success, #16a34a)' }}
                  >
                    <PlusIcon />
                  </button>
                ) : undefined}
              />
            </div>
          </div>
        </div>
      )}

      {creditAction && (
        <CreditActionModal
          mode={creditAction}
          user={user}
          employeeId={employeeId}
          allowanceIdr={baselineAllowance}
          divisor={divisor}
          creditNet={creditNet}
          maxPerAward={maxCreditPerAward}
          onClose={() => setCreditAction(null)}
          onDone={() => { setCreditAction(null); onChange?.() }}
        />
      )}

      {bonusModalOpen && (
        <BonusAwardModal
          user={user}
          employeeId={employeeId}
          period={period}
          maxBonusIdr={maxBonusIdr}
          onClose={() => setBonusModalOpen(false)}
          onDone={() => { setBonusModalOpen(false); onChange?.() }}
        />
      )}
    </section>
  )
}

// ─── Credit award/deduct modal ───────────────────────────

function CreditActionModal({
  mode,
  user,
  employeeId,
  allowanceIdr,
  divisor,
  creditNet,
  maxPerAward,
  onClose,
  onDone,
}: {
  mode: 'award' | 'deduct'
  user: User
  employeeId: string
  allowanceIdr: number
  divisor: number
  creditNet: number
  maxPerAward: number | null
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
  const rate = allowanceIdr > 0 && divisor > 0 ? Math.round(allowanceIdr / divisor) : 0
  const previewIdr = isValidAmount && allowanceIdr > 0
    ? creditToIdr(parsed, allowanceIdr, divisor)
    : 0

  const hasAllowance = allowanceIdr > 0
  const preview = useMemo(() => {
    if (mode !== 'deduct' || !isValidAmount) return null
    const deduction = Math.round(parsed)
    const creditsPortion = Math.min(Math.max(creditNet, 0), deduction)
    const overflowCredits = deduction - creditsPortion
    const overflowIdr = overflowCredits > 0 && hasAllowance
      ? Math.round((overflowCredits * allowanceIdr) / divisor)
      : 0
    if (overflowCredits === 0) return { msg: t.deductPreviewFullyFromCredits(deduction), tone: 'neutral' as const }
    if (!hasAllowance) return { msg: t.deductPreviewNoContract, tone: 'danger' as const }
    if (creditsPortion === 0) return { msg: t.deductPreviewAllFromAllowance(overflowIdr), tone: 'warning' as const }
    return { msg: t.deductPreviewSplit(creditsPortion, overflowIdr), tone: 'warning' as const }
  }, [mode, isValidAmount, parsed, creditNet, hasAllowance, allowanceIdr, divisor, t])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAmount) { setError(t.validationAmountPositive); return }
    if (maxPerAward != null && parsed > maxPerAward) {
      setError(t.capExceededCredits(maxPerAward))
      return
    }
    if (reason.trim().length < 20) { setError(t.validationReasonMinLength); return }
    setSubmitting(true)
    setError('')
    const n = Math.round(parsed)

    if (mode === 'award') {
      const { error: insertError } = await supabase.from('credit_adjustments').insert({
        org_id: user.org_id,
        employee_id: employeeId,
        amount: n,
        reason: reason.trim(),
        awarded_by: user.id,
      })
      setSubmitting(false)
      if (insertError) { setError(insertError.message); return }
      onDone()
      return
    }

    const { error: rpcError } = await supabase.rpc('deduct_credits_cascade', {
      target_employee_id: employeeId,
      deduction_credits: n,
      reason: reason.trim(),
    })
    setSubmitting(false)
    if (rpcError) { setError(rpcError.message); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={mode === 'award' ? t.awardCreditsTitle : t.deductCreditsTitle}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.creditsAmountLabel}</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
            autoFocus
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.creditsAmountHelp(rate)}
            {mode === 'award' && isValidAmount && ` · ${formatIdr(previewIdr, lang)}`}
          </p>
          {preview && (
            <p
              className="mt-2 text-xs"
              style={{
                color: preview.tone === 'danger'
                  ? 'var(--color-danger)'
                  : preview.tone === 'warning'
                    ? 'var(--color-warning)'
                    : 'var(--color-text-secondary)',
              }}
            >
              {preview.msg}
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
            style={{ backgroundColor: mode === 'award' ? '#3b82f6' : 'var(--color-danger)' }}
          >
            {submitting ? '...' : mode === 'award' ? t.submitAward : t.submitDeduct}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bonus award modal ──────────────────────────────────

function BonusAwardModal({
  user,
  employeeId,
  period,
  maxBonusIdr,
  onClose,
  onDone,
}: {
  user: User
  employeeId: string
  period: string
  maxBonusIdr: number | null
  onClose: () => void
  onDone: () => void
}) {
  const { t, lang } = useLang()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) { setError(t.validationAmountPositive); return }
    if (maxBonusIdr != null && parsed > maxBonusIdr) {
      setError(t.capExceededBonus(formatIdr(maxBonusIdr, lang)))
      return
    }
    if (reason.trim().length < 20) { setError(t.validationReasonMinLength); return }
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('bonus_adjustments').insert({
      org_id: user.org_id,
      employee_id: employeeId,
      amount_idr: Math.round(parsed),
      reason: reason.trim(),
      awarded_by: user.id,
      period_month: period,
    })
    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={t.bonusAwardTitle}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.bonusAmountLabel}</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
            autoFocus
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.bonusAmountHelp}</p>
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
            style={{ backgroundColor: '#3b82f6' }}
          >
            {submitting ? '...' : t.bonusSubmit}
          </button>
        </div>
      </form>
    </Modal>
  )
}
