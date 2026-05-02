import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel } from '../../SectionPanel'
import { Modal } from '../../../Modal'
import { DatePicker } from '../../../DatePicker'
import {
  inputStyle, FormLabel, PencilIcon, TrashIcon, Empty, Loading,
  formatDateShort, DURATION_TYPE_VALUES, durationTypeLabel,
} from './shared'
import type { EmployeeInformalEducation } from '../../../../types/aliases'

interface InformalEducationPanelProps {
  employeeId: string
  orgId: string
  canWrite: boolean
  writeDisabledTitle?: string
}

function Dash() {
  return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
}

export function InformalEducationPanel({ employeeId, orgId, canWrite, writeDisabledTitle }: InformalEducationPanelProps) {
  const { t } = useLang()
  const [rows, setRows] = useState<EmployeeInformalEducation[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EmployeeInformalEducation | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employee_informal_education')
      .select('*')
      .eq('employee_id', employeeId)
      .order('start_date', { ascending: false, nullsFirst: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [employeeId])

  async function handleDelete(r: EmployeeInformalEducation) {
    if (!confirm(t.ieDeleteConfirm(r.education_name))) return
    await supabase.from('employee_informal_education').delete().eq('id', r.id)
    load()
  }

  return (
    <>
      <SectionPanel
        title={t.eduSubInformal}
        headerExtra={
          <button
            type="button"
            onClick={() => { setEditing(null); setModalOpen(true) }}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.ieAddButton}
          </button>
        }
      >
        {loading ? <Loading /> : rows.length === 0 ? (
          <Empty title={t.ieEmpty} hint={t.ieEmptyHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="px-2 py-2 text-left font-medium">{t.ieColName}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ieColHeldBy}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ieColPeriod}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ieColExpiredDate}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ieColActivities}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ieColCertification}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const period = r.start_date || r.end_date
                    ? `${formatDateShort(r.start_date) ?? '?'} – ${formatDateShort(r.end_date) ?? '?'}`
                    : null
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.education_name}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.held_by ?? <Dash />}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{period ?? <Dash />}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{formatDateShort(r.expired_date) ?? <Dash />}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)', maxWidth: 220 }}>
                        {r.activities ? <span className="line-clamp-2">{r.activities}</span> : <Dash />}
                      </td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.has_certificate ? t.feCertYes : t.feCertNo}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditing(r); setModalOpen(true) }}
                            disabled={!canWrite}
                            title={!canWrite ? writeDisabledTitle : t.edit}
                            className="rounded p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            disabled={!canWrite}
                            title={!canWrite ? writeDisabledTitle : t.delete}
                            className="rounded p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ color: 'var(--color-danger)' }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      {modalOpen && (
        <InformalEducationModal
          orgId={orgId}
          employeeId={employeeId}
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </>
  )
}

function InformalEducationModal({ orgId, employeeId, initial, onClose, onSaved }: {
  orgId: string
  employeeId: string
  initial: EmployeeInformalEducation | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLang()
  const isEdit = initial !== null
  const currentYear = new Date().getFullYear()

  const [educationName, setEducationName] = useState(initial?.education_name || '')
  const [heldBy, setHeldBy] = useState(initial?.held_by || '')
  const [startDate, setStartDate] = useState(initial?.start_date || '')
  const [endDate, setEndDate] = useState(initial?.end_date || '')
  const [durationType, setDurationType] = useState(initial?.duration_type || 'day')
  const [duration, setDuration] = useState<string>(initial?.duration?.toString() ?? '1')
  const [expiredDate, setExpiredDate] = useState(initial?.expired_date || '')
  const [fee, setFee] = useState<string>(initial?.fee_idr?.toString() ?? '')
  const [activities, setActivities] = useState(initial?.activities || '')
  const [hasCertificate, setHasCertificate] = useState(initial?.has_certificate ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = educationName.trim() && startDate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSaving(true)

    const durationNum = duration ? Number(duration) : null
    const feeNum = fee ? Number(fee) : null

    const payload = {
      org_id: orgId,
      employee_id: employeeId,
      education_name: educationName.trim(),
      held_by: heldBy.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      duration_type: durationType || null,
      duration: durationNum,
      expired_date: expiredDate || null,
      fee_idr: feeNum,
      activities: activities.trim() || null,
      has_certificate: hasCertificate,
    }
    const { error: err } = isEdit && initial
      ? await supabase.from('employee_informal_education').update(payload).eq('id', initial.id)
      : await supabase.from('employee_informal_education').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={true} onClose={onClose} title={isEdit ? t.ieEditTitle : t.ieAddTitle} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <FormLabel required>{t.ieFieldName}</FormLabel>
          <input type="text" value={educationName} onChange={e => setEducationName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <FormLabel>{t.ieFieldHeldBy}</FormLabel>
          <input type="text" value={heldBy} onChange={e => setHeldBy(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FormLabel required>{t.ieFieldStartDate}</FormLabel>
            <DatePicker value={startDate} onChange={setStartDate} minYear={currentYear - 60} maxYear={currentYear + 5} />
          </div>
          <div>
            <FormLabel>{t.ieFieldEndDate}</FormLabel>
            <DatePicker value={endDate} onChange={setEndDate} minYear={currentYear - 60} maxYear={currentYear + 10} />
          </div>
          <div>
            <FormLabel>{t.ieFieldDurationType}</FormLabel>
            <select value={durationType} onChange={e => setDurationType(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              {DURATION_TYPE_VALUES.map(v => <option key={v} value={v}>{durationTypeLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <FormLabel>{t.ieFieldDuration}</FormLabel>
            <input type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <FormLabel>{t.ieFieldExpiredDate}</FormLabel>
            <DatePicker value={expiredDate} onChange={setExpiredDate} minYear={currentYear - 10} maxYear={currentYear + 30} />
          </div>
          <div>
            <FormLabel>{t.ieFieldFee}</FormLabel>
            <div className="flex items-stretch">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 px-3 text-sm" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>Rp</span>
              <input type="number" min="0" step="1" value={fee} onChange={e => setFee(e.target.value)} className="w-full rounded-r-lg border px-3 py-2 text-sm" style={inputStyle} placeholder="0" />
            </div>
          </div>
        </div>

        <div>
          <FormLabel>{t.ieFieldActivities}</FormLabel>
          <textarea value={activities} onChange={e => setActivities(e.target.value)} rows={3} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={hasCertificate} onChange={e => setHasCertificate(e.target.checked)} className="h-4 w-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
          {t.ieFieldHasCertificate}
        </label>

        <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.cancel}</button>
          <button type="submit" disabled={saving || !canSubmit} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? t.saving : t.save}
          </button>
        </div>
      </form>
    </Modal>
  )
}

