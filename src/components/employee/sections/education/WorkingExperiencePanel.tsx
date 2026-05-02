import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel } from '../../SectionPanel'
import { Modal } from '../../../Modal'
import { DatePicker } from '../../../DatePicker'
import {
  inputStyle, FormLabel, PencilIcon, TrashIcon, Empty, Loading,
  formatMonthYear, lengthOfService,
} from './shared'
import type { EmployeeWorkingExperience } from '../../../../types/aliases'

interface WorkingExperiencePanelProps {
  employeeId: string
  orgId: string
  canWrite: boolean
  writeDisabledTitle?: string
}

function Dash() {
  return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
}

export function WorkingExperiencePanel({ employeeId, orgId, canWrite, writeDisabledTitle }: WorkingExperiencePanelProps) {
  const { t } = useLang()
  const [rows, setRows] = useState<EmployeeWorkingExperience[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EmployeeWorkingExperience | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employee_working_experience')
      .select('*')
      .eq('employee_id', employeeId)
      .order('from_date', { ascending: false, nullsFirst: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [employeeId])

  async function handleDelete(r: EmployeeWorkingExperience) {
    if (!confirm(t.weDeleteConfirm(r.company))) return
    await supabase.from('employee_working_experience').delete().eq('id', r.id)
    load()
  }

  return (
    <>
      <SectionPanel
        title={t.eduSubWorking}
        headerExtra={
          <button
            type="button"
            onClick={() => { setEditing(null); setModalOpen(true) }}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.weAddButton}
          </button>
        }
      >
        {loading ? <Loading /> : rows.length === 0 ? (
          <Empty title={t.weEmpty} hint={t.weEmptyHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="px-2 py-2 text-left font-medium">{t.weColCompany}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.weColJobPosition}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.weColFrom}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.weColTo}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.weColLengthOfService}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.company}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.job_position}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{formatMonthYear(r.from_date) ?? <Dash />}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.to_date ? formatMonthYear(r.to_date) : <span style={{ color: 'var(--color-text-tertiary)' }}>{t.wePresent}</span>}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{lengthOfService(t, r.from_date, r.to_date)}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      {modalOpen && (
        <WorkingExperienceModal
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

/** Snap a date to the first of its month — the Working experience picker is
 *  semantically month-precision, but we use the regular DatePicker which gives
 *  the user a day grid. Snapping on save keeps storage clean. */
function snapToMonth(iso: string): string {
  const m = /^(\d{4}-\d{2})-\d{2}$/.exec(iso)
  return m ? `${m[1]}-01` : iso
}

function WorkingExperienceModal({ orgId, employeeId, initial, onClose, onSaved }: {
  orgId: string
  employeeId: string
  initial: EmployeeWorkingExperience | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLang()
  const isEdit = initial !== null
  const currentYear = new Date().getFullYear()

  const [company, setCompany] = useState(initial?.company || '')
  const [jobPosition, setJobPosition] = useState(initial?.job_position || '')
  const [fromDate, setFromDate] = useState(initial?.from_date || '')
  const [toDate, setToDate] = useState(initial?.to_date || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = company.trim() && jobPosition.trim() && fromDate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSaving(true)
    const payload = {
      org_id: orgId,
      employee_id: employeeId,
      company: company.trim(),
      job_position: jobPosition.trim(),
      from_date: fromDate ? snapToMonth(fromDate) : null,
      to_date: toDate ? snapToMonth(toDate) : null,
    }
    const { error: err } = isEdit && initial
      ? await supabase.from('employee_working_experience').update(payload).eq('id', initial.id)
      : await supabase.from('employee_working_experience').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={true} onClose={onClose} title={isEdit ? t.weEditTitle : t.weAddTitle} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <FormLabel required>{t.weFieldCompany}</FormLabel>
          <input type="text" value={company} onChange={e => setCompany(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <FormLabel required>{t.weFieldJobPosition}</FormLabel>
          <input type="text" value={jobPosition} onChange={e => setJobPosition(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FormLabel required>{t.weFieldFrom}</FormLabel>
            <DatePicker value={fromDate} onChange={setFromDate} minYear={currentYear - 60} maxYear={currentYear + 1} />
          </div>
          <div>
            <FormLabel>{t.weFieldTo}</FormLabel>
            <DatePicker value={toDate} onChange={setToDate} minYear={currentYear - 60} maxYear={currentYear + 1} />
          </div>
        </div>

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
