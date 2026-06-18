// Per-form-type configuration page (reached from the Forms-page type tiles).
// Lets an admin toggle which fields/options the org's form offers — the
// "configurable superset" firewall: subtract (disable leave types / work
// statuses) and require (reason), never add fields or change logic. Backed by
// organizations.forms_config jsonb.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { LEAVE_TYPES } from '../../lib/forms/leaveRequest'
import { WORK_STATUSES } from '../../lib/forms/overtimeRequest'
import type { FormsConfig } from '../../lib/forms/registry'
import type { Translations } from '../../lib/translations'
import type { User, FormType } from '../../types/aliases'

export function FormConfig({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { formType: rawType } = useParams<{ formType: string }>()
  const { isAdmin } = useRole(user)
  const formType: FormType = rawType === 'overtime_request' ? 'overtime_request' : 'leave_request'

  const [config, setConfig] = useState<FormsConfig>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const typeLabel = formType === 'leave_request' ? t.formsTypeLeave : t.formsTypeOvertime
  useBreadcrumbTrailing(typeLabel)

  useEffect(() => { load() }, [user.org_id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('organizations').select('forms_config').eq('id', user.org_id).single()
    setConfig(((data?.forms_config) ?? {}) as unknown as FormsConfig)
    setLoading(false)
  }

  async function saveConfig(next: FormsConfig) {
    if (!isAdmin) return
    setSaving(true)
    const prev = config
    setConfig(next)
    const { error } = await supabase.from('organizations').update({ forms_config: next as never }).eq('id', user.org_id)
    if (error) { setConfig(prev); alert(error.message) }
    setSaving(false)
  }

  const leaveEnabled = (k: string) => { const l = config.leave_request?.enabled_leave_types; return !l || l.includes(k) }
  function toggleLeave(k: string) {
    const base = config.leave_request?.enabled_leave_types ?? [...LEAVE_TYPES]
    const next = base.includes(k) ? base.filter(x => x !== k) : [...base, k]
    if (next.length === 0) return
    saveConfig({ ...config, leave_request: { ...config.leave_request, enabled_leave_types: next } })
  }
  const wsEnabled = (k: string) => { const l = config.overtime_request?.enabled_work_statuses; return !l || l.includes(k) }
  function toggleWs(k: string) {
    const base = config.overtime_request?.enabled_work_statuses ?? [...WORK_STATUSES]
    const next = base.includes(k) ? base.filter(x => x !== k) : [...base, k]
    if (next.length === 0) return
    saveConfig({ ...config, overtime_request: { ...config.overtime_request, enabled_work_statuses: next } })
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const disabled = saving || !isAdmin

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsConfigEyebrow}</span>
          <h1 className="mt-1 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{typeLabel}</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/forms')}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {t.formsConfigBack}
        </button>
      </div>

      {!isAdmin && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
          {t.formsConfigReadOnly}
        </div>
      )}

      {formType === 'leave_request' ? (
        <>
          <Section title={t.formsConfigLeaveTitle}>
            <div className="grid gap-2 sm:grid-cols-2">
              {LEAVE_TYPES.map(k => (
                <CheckRow key={k} label={leaveTypeLbl(k, t)} checked={leaveEnabled(k)} disabled={disabled} onChange={() => toggleLeave(k)} />
              ))}
            </div>
          </Section>
          <Section title={t.formsConfigFieldsTitle}>
            <CheckRow
              label={t.formsConfigRequireReason}
              checked={!!config.leave_request?.require_reason}
              disabled={disabled}
              onChange={() => saveConfig({ ...config, leave_request: { ...config.leave_request, require_reason: !config.leave_request?.require_reason } })}
            />
            <CheckRow
              label={t.formsConfigUseGate}
              checked={config.leave_request?.require_service_year !== false}
              disabled={disabled}
              onChange={() => saveConfig({ ...config, leave_request: { ...config.leave_request, require_service_year: config.leave_request?.require_service_year === false } })}
            />
          </Section>
        </>
      ) : (
        <Section title={t.formsConfigOvertimeTitle}>
          <div className="grid gap-2 sm:grid-cols-2">
            {WORK_STATUSES.map(k => (
              <CheckRow key={k} label={workStatusLbl(k, t)} checked={wsEnabled(k)} disabled={disabled} onChange={() => toggleWs(k)} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function CheckRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-4 w-4" style={{ accentColor: 'var(--color-primary)' }} />
      {label}
    </label>
  )
}

function leaveTypeLbl(k: string, t: Translations): string {
  switch (k) {
    case 'annual': return t.leaveTypeAnnual
    case 'unpaid': return t.leaveTypeUnpaid
    case 'national_holiday': return t.leaveTypeNationalHoliday
    case 'sick_no_note': return t.leaveTypeSickNoNote
    case 'sick_with_note': return t.leaveTypeSickWithNote
    case 'short_time': return t.leaveTypeShortTime
    case 'special': return t.leaveTypeSpecial
    default: return k
  }
}
function workStatusLbl(k: string, t: Translations): string {
  switch (k) {
    case 'permanent': return t.workStatusPermanent
    case 'contract': return t.workStatusContract
    case 'daily': return t.workStatusDaily
    case 'piecework': return t.workStatusPiecework
    default: return k
  }
}
