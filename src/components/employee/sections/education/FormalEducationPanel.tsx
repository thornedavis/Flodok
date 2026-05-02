import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel } from '../../SectionPanel'
import { Modal } from '../../../Modal'
import {
  inputStyle, FormLabel, PencilIcon, TrashIcon, Empty, Loading,
  DEGREE_VALUES, degreeLabel, YearSelect,
} from './shared'
import type { EmployeeFormalEducation } from '../../../../types/aliases'

interface FormalEducationPanelProps {
  employeeId: string
  orgId: string
  canWrite: boolean
  writeDisabledTitle?: string
}

export function FormalEducationPanel({ employeeId, orgId, canWrite, writeDisabledTitle }: FormalEducationPanelProps) {
  const { t } = useLang()
  const [rows, setRows] = useState<EmployeeFormalEducation[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EmployeeFormalEducation | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employee_formal_education')
      .select('*')
      .eq('employee_id', employeeId)
      .order('end_year', { ascending: false, nullsFirst: false })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [employeeId])

  async function handleDelete(r: EmployeeFormalEducation) {
    if (!confirm(t.feDeleteConfirm(r.institution))) return
    await supabase.from('employee_formal_education').delete().eq('id', r.id)
    load()
  }

  return (
    <>
      <SectionPanel
        title={t.eduSubFormal}
        headerExtra={
          <button
            type="button"
            onClick={() => { setEditing(null); setModalOpen(true) }}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.feAddButton}
          </button>
        }
      >
        {loading ? <Loading /> : rows.length === 0 ? (
          <Empty title={t.feEmpty} hint={t.feEmptyHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="px-2 py-2 text-left font-medium">{t.feColInstitution}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.feColDegree}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.feColField}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.feColPeriod}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.feColGrade}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.feColActivities}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.feColCertificate}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const period = r.start_year || r.end_year
                    ? `${r.start_year ?? '?'} – ${r.end_year ?? '?'}`
                    : null
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.institution}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{degreeLabel(t, r.degree)}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.field_of_study ?? <Dash />}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{period ?? <Dash />}</td>
                      <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{r.grade ?? <Dash />}</td>
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
        <FormalEducationModal
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

function Dash() {
  return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
}

function FormalEducationModal({ orgId, employeeId, initial, onClose, onSaved }: {
  orgId: string
  employeeId: string
  initial: EmployeeFormalEducation | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLang()
  const isEdit = initial !== null
  const currentYear = new Date().getFullYear()

  const [degree, setDegree] = useState(initial?.degree || '')
  const [institution, setInstitution] = useState(initial?.institution || '')
  const [fieldOfStudy, setFieldOfStudy] = useState(initial?.field_of_study || '')
  const [grade, setGrade] = useState(initial?.grade || '')
  const [startYear, setStartYear] = useState<number | null>(initial?.start_year ?? null)
  const [endYear, setEndYear] = useState<number | null>(initial?.end_year ?? null)
  const [activities, setActivities] = useState(initial?.activities || '')
  const [hasCertificate, setHasCertificate] = useState(initial?.has_certificate ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = degree && institution.trim() && startYear !== null && endYear !== null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSaving(true)
    const payload = {
      org_id: orgId,
      employee_id: employeeId,
      degree,
      institution: institution.trim(),
      field_of_study: fieldOfStudy.trim() || null,
      grade: grade.trim() || null,
      start_year: startYear,
      end_year: endYear,
      activities: activities.trim() || null,
      has_certificate: hasCertificate,
    }
    const { error: err } = isEdit && initial
      ? await supabase.from('employee_formal_education').update(payload).eq('id', initial.id)
      : await supabase.from('employee_formal_education').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <Modal open={true} onClose={onClose} title={isEdit ? t.feEditTitle : t.feAddTitle} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <FormLabel required>{t.feFieldDegree}</FormLabel>
          <select value={degree} onChange={e => setDegree(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
            <option value="">{t.feSelectDegree}</option>
            {DEGREE_VALUES.map(v => <option key={v} value={v}>{degreeLabel(t, v)}</option>)}
          </select>
        </div>

        <div>
          <FormLabel required>{t.feFieldInstitution}</FormLabel>
          <input type="text" value={institution} onChange={e => setInstitution(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FormLabel>{t.feFieldField}</FormLabel>
            <input type="text" value={fieldOfStudy} onChange={e => setFieldOfStudy(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <FormLabel>{t.feFieldGrade}</FormLabel>
            <input type="text" value={grade} onChange={e => setGrade(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <FormLabel required>{t.feFieldStartYear}</FormLabel>
            <YearSelect value={startYear} onChange={setStartYear} minYear={currentYear - 80} maxYear={currentYear + 5} placeholder={t.feSelectYear} />
          </div>
          <div>
            <FormLabel required>{t.feFieldEndYear}</FormLabel>
            <YearSelect value={endYear} onChange={setEndYear} minYear={currentYear - 80} maxYear={currentYear + 10} placeholder={t.feSelectYear} />
          </div>
        </div>

        <div>
          <FormLabel>{t.feFieldActivities}</FormLabel>
          <textarea value={activities} onChange={e => setActivities(e.target.value)} rows={3} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={hasCertificate} onChange={e => setHasCertificate(e.target.checked)} className="h-4 w-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
          {t.feFieldHasCertificate}
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
