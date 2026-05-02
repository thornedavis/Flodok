import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useLang } from '../../../../contexts/LanguageContext'
import { SectionPanel } from '../../SectionPanel'
import { Modal } from '../../../Modal'
import { PhoneInput, isValidPhone, describePhoneError } from '../../../PhoneInput'
import type { Translations } from '../../../../lib/translations'
import type { EmployeeEmergencyContact, EmployeeFamilyMember, Organization } from '../../../../types/aliases'

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const RELATIONSHIP_VALUES = [
  'spouse', 'child', 'parent', 'sibling', 'grandparent', 'grandchild', 'in_law', 'friend', 'other',
] as const

function relationshipLabel(t: Translations, value: string): string {
  switch (value) {
    case 'spouse': return t.famRelSpouse
    case 'child': return t.famRelChild
    case 'parent': return t.famRelParent
    case 'sibling': return t.famRelSibling
    case 'grandparent': return t.famRelGrandparent
    case 'grandchild': return t.famRelGrandchild
    case 'in_law': return t.famRelInLaw
    case 'friend': return t.ecRelFriend
    default: return t.famRelOther
  }
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

interface EmergencyContactsPanelProps {
  employeeId: string
  orgId: string
  org: Organization | null
  canWrite: boolean
  writeDisabledTitle?: string
}

export function EmergencyContactsPanel({
  employeeId,
  orgId,
  org,
  canWrite,
  writeDisabledTitle,
}: EmergencyContactsPanelProps) {
  const { t } = useLang()
  const [contacts, setContacts] = useState<EmployeeEmergencyContact[]>([])
  const [familyEC, setFamilyEC] = useState<EmployeeFamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editingContact, setEditingContact] = useState<EmployeeEmergencyContact | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const [contactsResult, familyResult] = await Promise.all([
      supabase
        .from('employee_emergency_contacts')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: true }),
      supabase
        .from('employee_family_members')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('is_emergency_contact', true)
        .order('created_at', { ascending: true }),
    ])
    setContacts(contactsResult.data || [])
    setFamilyEC(familyResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [employeeId])

  function openAdd() {
    setEditingContact(null)
    setModalOpen(true)
  }

  function openEdit(c: EmployeeEmergencyContact) {
    setEditingContact(c)
    setModalOpen(true)
  }

  async function handleDelete(c: EmployeeEmergencyContact) {
    if (!confirm(t.ecDeleteConfirm(c.name))) return
    await supabase.from('employee_emergency_contacts').delete().eq('id', c.id)
    load()
  }

  const totalCount = contacts.length + familyEC.length

  return (
    <>
      <SectionPanel
        title={t.empSubEmergencyContact}
        headerExtra={
          <button
            type="button"
            onClick={openAdd}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.ecAddButton}
          </button>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
        ) : totalCount === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.ecEmpty}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.ecEmptyHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="px-2 py-2 text-left font-medium">{t.ecColNo}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ecColName}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ecColRelationship}</th>
                  <th className="px-2 py-2 text-left font-medium">{t.ecColPhone}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{i + 1}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{c.name}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{relationshipLabel(t, c.relationship)}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{c.phone}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          disabled={!canWrite}
                          title={!canWrite ? writeDisabledTitle : t.edit}
                          className="rounded p-1.5 transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
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
                {familyEC.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 pb-1 pt-4 text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.ecFromFamily}
                    </td>
                  </tr>
                )}
                {familyEC.map((m, i) => (
                  <tr key={m.id} className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{contacts.length + i + 1}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{m.full_name}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text)' }}>{relationshipLabel(t, m.relationship)}</td>
                    <td className="px-2 py-3" style={{ color: 'var(--color-text-tertiary)' }}>—</td>
                    <td className="px-2 py-3 text-right">
                      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.empSubFamily}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {familyEC.length > 0 && (
              <p className="mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.ecFromFamilyHint}</p>
            )}
          </div>
        )}
      </SectionPanel>

      {modalOpen && (
        <EmergencyContactFormModal
          orgId={orgId}
          org={org}
          employeeId={employeeId}
          initial={editingContact}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
    </>
  )
}

interface FormProps {
  orgId: string
  org: Organization | null
  employeeId: string
  initial: EmployeeEmergencyContact | null
  onClose: () => void
  onSaved: () => void
}

function EmergencyContactFormModal({ orgId, org, employeeId, initial, onClose, onSaved }: FormProps) {
  const { t } = useLang()
  const isEdit = initial !== null

  const [name, setName] = useState(initial?.name || '')
  const [relationship, setRelationship] = useState(initial?.relationship || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim().length > 0 && relationship.length > 0 && phone.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError('')

    if (!isValidPhone(phone)) {
      setError(describePhoneError(phone, t))
      return
    }

    setSaving(true)
    const payload = {
      org_id: orgId,
      employee_id: employeeId,
      name: name.trim(),
      relationship,
      phone,
    }
    const { error: upsertError } = isEdit && initial
      ? await supabase.from('employee_emergency_contacts').update(payload).eq('id', initial.id)
      : await supabase.from('employee_emergency_contacts').insert(payload)
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
    <Modal open={true} onClose={onClose} title={isEdit ? t.ecEditTitle : t.ecAddTitle} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        <div>
          <Label required>{t.ecFieldName}</Label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
        </div>

        <div>
          <Label required>{t.ecFieldRelationship}</Label>
          <select value={relationship} onChange={e => setRelationship(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle}>
            <option value="">{t.famSelectRelationship}</option>
            {RELATIONSHIP_VALUES.map(v => <option key={v} value={v}>{relationshipLabel(t, v)}</option>)}
          </select>
        </div>

        <div>
          <Label required>{t.ecFieldPhone}</Label>
          <PhoneInput value={phone} onChange={setPhone} defaultCountryCode={org?.default_country_code} />
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
