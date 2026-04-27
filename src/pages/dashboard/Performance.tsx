import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { Modal } from '../../components/Modal'
import { getAvatarGradient } from '../../lib/avatar'
import { creditToIdr, formatIdr } from '../../lib/credits'
import type { User, AchievementDefinition } from '../../types/database'

type RosterRow = {
  employee_id: string
  name: string
  photo_url: string | null
  departments: string[]
  credits_net: number
  credits_frozen: boolean
  achievements_count: number
  top_achievements: Array<{ name: string; icon: string | null; unlocked_at: string }>
  allowance_idr: number
}

type Roster = {
  period_month: string
  credits_divisor: number
  rows: RosterRow[]
}

type Tab = 'credits' | 'achievements'
type CreditAction = 'award' | 'deduct'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

export function Performance({ user }: { user: User }) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [roster, setRoster] = useState<Roster | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('credits')
  const [search, setSearch] = useState('')
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([])

  // Action state
  const [creditAction, setCreditAction] = useState<{ row: RosterRow; mode: CreditAction } | null>(null)
  const [badgeAction, setBadgeAction] = useState<RosterRow | null>(null)

  async function loadRoster() {
    setLoading(true)
    const { data } = await supabase.rpc('admin_rewards_roster')
    setRoster((data as unknown as Roster) ?? null)
    setLoading(false)
  }

  async function loadDefinitions() {
    const { data } = await supabase
      .from('achievement_definitions')
      .select('*')
      .eq('org_id', user.org_id)
      .eq('is_active', true)
      .order('name')
    setDefinitions(data || [])
  }

  useEffect(() => { loadRoster(); loadDefinitions() }, [user.org_id])

  const filtered = useMemo(() => {
    if (!roster) return []
    const q = search.trim().toLowerCase()
    if (!q) return roster.rows
    return roster.rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.departments.some(d => d.toLowerCase().includes(q))
    )
  }, [roster, search])

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.adminOnlyHint}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl pb-20">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.performanceTitle}</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.performanceSubtitle}</p>
      </header>

      {/* Tab toggle — mobile-friendly pill group */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 bg-opacity-90 px-4 pb-2 pt-2 backdrop-blur" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="mb-3 flex rounded-lg p-0.5" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          {(['credits', 'achievements'] as Tab[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: tab === k ? 'var(--color-bg)' : 'transparent',
                color: tab === k ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                boxShadow: tab === k ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {k === 'credits' ? t.performanceTabCredits : t.performanceTabAchievements}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.performanceSearchPlaceholder}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={inputStyle}
        />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          {roster && roster.rows.length === 0 ? t.performanceEmptyNoMembers : t.performanceEmptyNoMatch}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(row => (
            <li
              key={row.employee_id}
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
                  style={{ background: row.photo_url ? 'transparent' : getAvatarGradient(row.employee_id) }}
                >
                  {row.photo_url && <img src={row.photo_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{row.name}</p>
                  <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {row.departments[0] || '—'}
                    {tab === 'credits' && (
                      <>
                        {' · '}
                        <span style={{ color: row.credits_net > 0 ? 'var(--color-success, #16a34a)' : row.credits_net < 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
                          {t.performanceRowCreditsThisMonth(row.credits_net)}
                        </span>
                        {row.credits_frozen && (
                          <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}>
                            {t.performanceFrozenTag}
                          </span>
                        )}
                      </>
                    )}
                    {tab === 'achievements' && row.achievements_count > 0 && ` · ${t.performanceRowBadges(row.achievements_count)}`}
                  </p>
                  {tab === 'achievements' && row.top_achievements.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.top_achievements.map((b, i) => (
                        <span key={i} className="text-base" title={b.name}>{b.icon || '🏅'}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {tab === 'credits' && !row.credits_frozen && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCreditAction({ row, mode: 'award' })}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: 'var(--color-success, #16a34a)' }}
                        aria-label={t.performanceAwardAction}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreditAction({ row, mode: 'deduct' })}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
                        aria-label={t.performanceDeductAction}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                    </>
                  )}
                  {tab === 'achievements' && (
                    <button
                      type="button"
                      onClick={() => setBadgeAction(row)}
                      className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      🏅
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creditAction && roster && (
        <CreditActionModal
          action={creditAction}
          divisor={roster.credits_divisor}
          user={user}
          onClose={() => setCreditAction(null)}
          onDone={() => { setCreditAction(null); loadRoster() }}
          t={t}
          lang={lang}
        />
      )}

      {badgeAction && (
        <BadgeActionModal
          row={badgeAction}
          definitions={definitions}
          user={user}
          onClose={() => setBadgeAction(null)}
          onDone={() => { setBadgeAction(null); loadRoster() }}
          t={t}
        />
      )}
    </div>
  )
}

// ─── Credit Award/Deduct modal ─────────────────────────────

function CreditActionModal({
  action,
  divisor,
  user,
  onClose,
  onDone,
  t,
  lang,
}: {
  action: { row: RosterRow; mode: CreditAction }
  divisor: number
  user: User
  onClose: () => void
  onDone: () => void
  t: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
}) {
  const { row, mode } = action
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const parsed = Number(amount)
  const isValidAmount = Number.isFinite(parsed) && parsed > 0

  const rate = row.allowance_idr > 0 && divisor > 0
    ? Math.round(row.allowance_idr / divisor)
    : 0
  const previewIdr = isValidAmount && row.allowance_idr > 0
    ? creditToIdr(parsed, row.allowance_idr, divisor)
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAmount) { setError(t.validationAmountPositive); return }
    if (reason.trim().length < 20) { setError(t.validationReasonMinLength); return }
    setSubmitting(true)
    setError('')
    const n = Math.round(parsed)

    if (mode === 'award') {
      const { error: insertError } = await supabase.from('credit_adjustments').insert({
        org_id: user.org_id,
        employee_id: row.employee_id,
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
      target_employee_id: row.employee_id,
      deduction_credits: n,
      reason: reason.trim(),
    })
    setSubmitting(false)
    if (rpcError) { setError(rpcError.message); return }
    onDone()
  }

  // Preview of what a deduction will do, same logic as employee-edit CreditsSection.
  const hasAllowance = row.allowance_idr > 0
  let preview: { msg: string; tone: 'neutral' | 'warning' | 'danger' } | null = null
  if (mode === 'deduct' && isValidAmount) {
    const deduction = Math.round(parsed)
    const creditsPortion = Math.min(Math.max(row.credits_net, 0), deduction)
    const overflowCredits = deduction - creditsPortion
    const overflowIdr = overflowCredits > 0 && hasAllowance
      ? Math.round((overflowCredits * row.allowance_idr) / divisor)
      : 0
    if (overflowCredits === 0) {
      preview = { msg: t.deductPreviewFullyFromCredits(deduction), tone: 'neutral' }
    } else if (!hasAllowance) {
      preview = { msg: t.deductPreviewNoContract, tone: 'danger' }
    } else if (creditsPortion === 0) {
      preview = { msg: t.deductPreviewAllFromAllowance(overflowIdr), tone: 'warning' }
    } else {
      preview = { msg: t.deductPreviewSplit(creditsPortion, overflowIdr), tone: 'warning' }
    }
  }

  const title = `${mode === 'award' ? t.awardCreditsTitle : t.deductCreditsTitle} — ${row.name}`

  return (
    <Modal open onClose={onClose} title={title}>
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
            style={{ backgroundColor: mode === 'award' ? 'var(--color-success, #16a34a)' : 'var(--color-danger)' }}
          >
            {submitting ? '...' : mode === 'award' ? t.submitAward : t.submitDeduct}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Achievement modal ───────────────────────────────────

function BadgeActionModal({
  row,
  definitions,
  user,
  onClose,
  onDone,
  t,
}: {
  row: RosterRow
  definitions: AchievementDefinition[]
  user: User
  onClose: () => void
  onDone: () => void
  t: ReturnType<typeof useLang>['t']
}) {
  const manual = definitions.filter(d => d.trigger_type === 'manual')
  const [selectedId, setSelectedId] = useState(manual[0]?.id || '')
  const [reason, setReason] = useState('')
  const todayIso = new Date().toISOString().slice(0, 10)
  const minBackdateIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [unlockedDate, setUnlockedDate] = useState(todayIso)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const REASON_MAX = 200

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) { setError(t.validationPickAchievement); return }
    const trimmed = reason.trim()
    if (!trimmed) { setError(t.validationReasonRequired); return }
    if (trimmed.length > REASON_MAX) { setError(t.validationReasonTooLong); return }
    setSubmitting(true)
    setError('')
    // Backdate: if user picked a non-today date, send midday on that date in
    // local time so timezone shifts don't push it into the previous day.
    let unlockedAt: string | undefined
    if (unlockedDate && unlockedDate !== todayIso) {
      unlockedAt = new Date(`${unlockedDate}T12:00:00`).toISOString()
    }
    const payload: {
      employee_id: string
      achievement_id: string
      awarded_by: string
      reason: string
      unlocked_at?: string
    } = {
      employee_id: row.employee_id,
      achievement_id: selectedId,
      awarded_by: user.id,
      reason: trimmed,
    }
    if (unlockedAt) payload.unlocked_at = unlockedAt
    const { error: insertError } = await supabase.from('achievement_unlocks').insert(payload)
    setSubmitting(false)
    if (insertError) { setError(insertError.message); return }
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={`${t.awardAchievement} — ${row.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.pickAchievement}</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
            autoFocus
          >
            {manual.map(d => (
              <option key={d.id} value={d.id}>{d.icon ? `${d.icon} ` : ''}{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{t.achievementReasonLabel}</span>
            <span className="text-xs" style={{ color: reason.length > REASON_MAX ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
              {reason.length}/{REASON_MAX}
            </span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value.slice(0, REASON_MAX + 50))}
            rows={2}
            required
            placeholder={t.achievementReasonPlaceholder}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.achievementUnlockDate}</label>
          <input
            type="date"
            value={unlockedDate}
            min={minBackdateIso}
            max={todayIso}
            onChange={e => setUnlockedDate(e.target.value || todayIso)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.achievementUnlockDateHint}</p>
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
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {submitting ? '...' : t.submitAward}
          </button>
        </div>
      </form>
    </Modal>
  )
}
