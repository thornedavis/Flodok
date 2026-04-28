import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Modal } from '../Modal'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import type { AchievementDefinition, AchievementUnlock, Contract, Employee, User } from '../../types/aliases'
import { displayBadgeIcon } from '../../lib/badgeIcon'

const sectionHeadingStyle: React.CSSProperties = { color: 'var(--color-text-tertiary)' }
const fieldLabelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' }
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

type UnlockRow = AchievementUnlock & { definition: AchievementDefinition | null }

export function AchievementsSection({
  user,
  employeeId,
  employee,
  activeContract,
}: {
  user: User
  employeeId: string
  employee: Employee | null
  activeContract: Contract | null
}) {
  const { t, lang } = useLang()
  const { isAdmin } = useRole(user)
  const [definitions, setDefinitions] = useState<AchievementDefinition[]>([])
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [defsRes, unlocksRes] = await Promise.all([
      supabase
        .from('achievement_definitions')
        .select('*')
        .eq('org_id', user.org_id)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('achievement_unlocks')
        .select('*')
        .eq('employee_id', employeeId)
        .order('unlocked_at', { ascending: false }),
    ])
    const defs = defsRes.data || []
    setDefinitions(defs)
    const rows = (unlocksRes.data || []).map(u => ({
      ...u,
      definition: defs.find(d => d.id === u.achievement_id) || null,
    }))
    setUnlocks(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [employeeId, user.org_id])

  const unlockedIds = new Set(unlocks.map(u => u.achievement_id))
  const availableManual = definitions.filter(d => d.trigger_type === 'manual' && !unlockedIds.has(d.id))

  const daysEmployed = employee?.created_at
    ? Math.max(0, Math.floor((Date.now() - new Date(employee.created_at).getTime()) / 86400000))
    : 0
  const hoursPerWeek = (activeContract?.hours_per_day ?? 0) * (activeContract?.days_per_week ?? 0)
  const lifetimeXp = Math.floor((daysEmployed / 7) * hoursPerWeek)

  function openModal() {
    setModalOpen(true)
    setSelectedId(availableManual[0]?.id || '')
    setReason('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) { setError(t.validationPickAchievement); return }
    setSubmitting(true)
    setError('')
    const { error: insertError } = await supabase.from('achievement_unlocks').insert({
      employee_id: employeeId,
      achievement_id: selectedId,
      awarded_by: user.id,
      reason: reason.trim() || null,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setModalOpen(false)
    await load()
  }

  return (
    <section>
      <div
        className="mb-6 rounded-xl border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={sectionHeadingStyle}>
              {t.portalExperience}
            </p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
              {t.portalExperienceXp(lifetimeXp)}
            </p>
          </div>
          <span className="text-2xl">⚡</span>
        </div>
        {hoursPerWeek > 0 || daysEmployed > 0 ? (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.portalExperienceBreakdown(daysEmployed, Math.round(hoursPerWeek))}
          </p>
        ) : (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.portalNoContractYet}
          </p>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={sectionHeadingStyle}>
          {t.achievementsSection}
        </h2>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/settings?tab=achievements"
              className="text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {t.manageAchievements}
            </Link>
            {availableManual.length > 0 && (
              <button
                type="button"
                onClick={openModal}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {t.awardAchievement}
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>...</p>
      ) : unlocks.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noAchievementsYet}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {unlocks.map(row => (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}
              title={row.definition?.description || row.reason || undefined}
            >
              <span className="text-lg">{displayBadgeIcon(row.definition?.icon, '🏅')}</span>
              <span style={{ color: 'var(--color-text)' }}>{row.definition?.name || '—'}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.unlockedOn} {new Date(row.unlocked_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US')}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t.awardAchievement}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={fieldLabelStyle}>{t.pickAchievement}</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              autoFocus
            >
              {availableManual.map(d => (
                <option key={d.id} value={d.id}>{d.icon ? `${d.icon} ` : ''}{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={fieldLabelStyle}>{t.achievementReasonLabel}</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
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
              {submitting ? '...' : t.submitAward}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
