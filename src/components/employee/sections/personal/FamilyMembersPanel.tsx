import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel } from '../../SectionPanel'
import { DatePicker } from '../../../DatePicker'
import { Modal } from '../../../Modal'
import {
  GENDER_VALUES, MARITAL_VALUES, RELIGION_VALUES,
  genderLabel, maritalLabel, religionLabel,
} from './enums'
import type { Translations } from '../../../../lib/translations'
import type { EmployeeFamilyMember } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const RELATIONSHIP_VALUES = [
  'spouse', 'child', 'parent', 'sibling', 'grandparent', 'grandchild', 'in_law', 'other',
] as const
type Relationship = typeof RELATIONSHIP_VALUES[number]

function relationshipLabel(t: Translations, value: string): string {
  switch (value) {
    case 'spouse': return t.famRelSpouse
    case 'child': return t.famRelChild
    case 'parent': return t.famRelParent
    case 'sibling': return t.famRelSibling
    case 'grandparent': return t.famRelGrandparent
    case 'grandchild': return t.famRelGrandchild
    case 'in_law': return t.famRelInLaw
    default: return t.famRelOther
  }
}

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value + 'T00:00:00')
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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

interface FamilyMembersPanelProps {
  employeeId: string
  orgId: string
  canWrite: boolean
  writeDisabledTitle?: string
}

export function FamilyMembersPanel({
  employeeId,
  orgId,
  canWrite,
  writeDisabledTitle,
}: FamilyMembersPanelProps) {
  const { t } = useLang()
  const [members, setMembers] = useState<EmployeeFamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editingMember, setEditingMember] = useState<EmployeeFamilyMember | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employee_family_members')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: true })
    setMembers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [employeeId])

  function openAdd() {
    setEditingMember(null)
    setModalOpen(true)
  }

  function openEdit(m: EmployeeFamilyMember) {
    setEditingMember(m)
    setModalOpen(true)
  }

  async function handleDelete(m: EmployeeFamilyMember) {
    if (!confirm(t.famDeleteConfirm(m.full_name))) return
    await supabase.from('employee_family_members').delete().eq('id', m.id)
    load()
  }

  return (
    <>
      <SectionPanel
        title={t.empSubFamily}
        headerExtra={
          <button
            type="button"
            onClick={openAdd}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.famAddButton}
          </button>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
        ) : members.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.famEmpty}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.famEmptyHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="px-2 py-2 text-left font-medium">{t.famColNo}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColName}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColRelationship}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColBirthdate}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColIdNumber}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColMaritalStatus}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColGender}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColJob}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.famColReligion}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{i + 1}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{m.full_name}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{relationshipLabel(t, m.relationship)}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{formatDate(m.birthdate) ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{m.id_number ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{maritalLabel(t, m.marital_status) ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{genderLabel(t, m.gender) ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{m.job ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{religionLabel(t, m.religion) ?? <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          disabled={!canWrite}
                          title={!canWrite ? writeDisabledTitle : t.edit}
                          className="rounded p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m)}
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
        <FamilyMemberFormModal
          orgId={orgId}
          employeeId={employeeId}
          initial={editingMember}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </>
  )
}

interface FormProps {
  orgId: string
  employeeId: string
  initial: EmployeeFamilyMember | null
  onClose: () => void
  onSaved: () => void
}

function FamilyMemberFormModal({ orgId, employeeId, initial, onClose, onSaved }: FormProps) {
  const { t } = useLang()
  const isEdit = initial !== null

  const [fullName, setFullName] = useState(initial?.full_name || '')
  const [relationship, setRelationship] = useState<string>(initial?.relationship || '')
  const [isEmergency, setIsEmergency] = useState(initial?.is_emergency_contact || false)
  const [address, setAddress] = useState(initial?.address || '')
  const [idNumber, setIdNumber] = useState(initial?.id_number || '')
  const [gender, setGender] = useState(initial?.gender || '')
  const [birthdate, setBirthdate] = useState(initial?.birthdate || '')
  const [religion, setReligion] = useState(initial?.religion || '')
  const [maritalStatus, setMaritalStatus] = useState(initial?.marital_status || '')
  const [job, setJob] = useState(initial?.job || '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = fullName.trim().length > 0 && relationship.length > 0 && gender.length > 0 && birthdate.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSaving(true)

    const payload = {
      org_id: orgId,
      employee_id: employeeId,
      full_name: fullName.trim(),
      relationship: relationship as Relationship,
      is_emergency_contact: isEmergency,
      address: address.trim() || null,
      id_number: idNumber.trim() || null,
      gender: gender || null,
      birthdate: birthdate || null,
      religion: religion || null,
      marital_status: maritalStatus || null,
      job: job.trim() || null,
    }

    const { error: upsertError } = isEdit && initial
      ? await supabase.from('employee_family_members').update(payload).eq('id', initial.id)
      : await supabase.from('employee_family_members').insert(payload)

    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    onSaved()
  }

  function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
    return (
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
        {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
      </label>
    )
  }

  return (
    <Modal open={true} onClose={onClose} title={isEdit ? t.famEditTitle : t.famAddTitle} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <Label required>{t.famFieldFullName}</Label>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <Label required>{t.famFieldRelationship}</Label>
          <select value={relationship} onChange={e => setRelationship(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
            <option value="">{t.famSelectRelationship}</option>
            {RELATIONSHIP_VALUES.map(v => <option key={v} value={v}>{relationshipLabel(t, v)}</option>)}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={isEmergency}
            onChange={e => setIsEmergency(e.target.checked)}
            className="h-4 w-4 rounded"
            style={{ accentColor: 'var(--color-primary)' }}
          />
          {t.famFieldEmergencyContact}
        </label>

        <div>
          <Label>{t.famFieldAddress}</Label>
          <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full resize-none rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <Label>{t.famFieldIdNumber}</Label>
          <input type="text" value={idNumber} onChange={e => setIdNumber(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label required>{t.famFieldGender}</Label>
            <select value={gender} onChange={e => setGender(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.famSelectGender}</option>
              {GENDER_VALUES.map(v => <option key={v} value={v}>{genderLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <Label required>{t.famFieldBirthdate}</Label>
            <DatePicker value={birthdate} onChange={setBirthdate} maxYear={new Date().getFullYear()} minYear={new Date().getFullYear() - 110} />
          </div>
          <div>
            <Label>{t.famFieldReligion}</Label>
            <select value={religion} onChange={e => setReligion(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.famSelectReligion}</option>
              {RELIGION_VALUES.map(v => <option key={v} value={v}>{religionLabel(t, v)}</option>)}
            </select>
          </div>
          <div>
            <Label>{t.famFieldMaritalStatus}</Label>
            <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
              <option value="">{t.famSelectStatus}</option>
              {MARITAL_VALUES.map(v => <option key={v} value={v}>{maritalLabel(t, v)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Label>{t.famFieldJob}</Label>
          <input type="text" value={job} onChange={e => setJob(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      </form>
    </Modal>
  )
}
