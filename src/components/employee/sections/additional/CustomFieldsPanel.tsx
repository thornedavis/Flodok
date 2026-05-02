import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel } from '../../SectionPanel'
import { Modal } from '../../../Modal'
import type { EmployeeCustomField } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

interface CustomFieldsPanelProps {
  employeeId: string
  orgId: string
  canWrite: boolean
  writeDisabledTitle?: string
}

export function CustomFieldsPanel({ employeeId, orgId, canWrite, writeDisabledTitle }: CustomFieldsPanelProps) {
  const { t } = useLang()
  const [rows, setRows] = useState<EmployeeCustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EmployeeCustomField | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employee_custom_fields')
      .select('*')
      .eq('employee_id', employeeId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [employeeId])

  async function handleDelete(r: EmployeeCustomField) {
    if (!confirm(t.cfDeleteConfirm(r.label))) return
    await supabase.from('employee_custom_fields').delete().eq('id', r.id)
    load()
  }

  return (
    <>
      <SectionPanel
        title={t.cfTitle}
        subtitle={t.cfHint}
        headerExtra={
          <button
            type="button"
            onClick={() => { setEditing(null); setModalOpen(true) }}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.cfAddButton}
          </button>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.cfEmpty}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.cfEmptyHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="px-2 py-2 text-left font-medium">{t.cfColLabel}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.cfColValue}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                    <td className="px-2 py-3 font-medium" style={{ color: 'var(--color-text-secondary)', width: '30%' }}>{r.label}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>
                      {r.value
                        ? <span style={{ whiteSpace: 'pre-wrap' }}>{r.value}</span>
                        : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
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
        <CustomFieldModal
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

function CustomFieldModal({ orgId, employeeId, initial, onClose, onSaved }: {
  orgId: string
  employeeId: string
  initial: EmployeeCustomField | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useLang()
  const isEdit = initial !== null

  const [label, setLabel] = useState(initial?.label || '')
  const [value, setValue] = useState(initial?.value || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = label.trim().length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSaving(true)
    const payload = {
      org_id: orgId,
      employee_id: employeeId,
      label: label.trim(),
      value: value.trim() || null,
    }
    const { error: err } = isEdit && initial
      ? await supabase.from('employee_custom_fields').update(payload).eq('id', initial.id)
      : await supabase.from('employee_custom_fields').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  function FormLabel({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
    return (
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
        {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
      </label>
    )
  }

  return (
    <Modal open={true} onClose={onClose} title={isEdit ? t.cfModalEditTitle : t.cfModalAddTitle} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <FormLabel required>{t.cfFieldLabel}</FormLabel>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={t.cfPlaceholderLabel} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <FormLabel>{t.cfFieldValue}</FormLabel>
          <textarea value={value} onChange={e => setValue(e.target.value)} placeholder={t.cfPlaceholderValue} rows={2} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
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
