import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DepartmentsMultiSelect } from '../../components/DepartmentsMultiSelect'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts } from '../../lib/employee'
import type {
  User, Employee, SpotlightPost,
  SpotlightPriority, SpotlightDisplayMode, SpotlightVisibilityScope, SpotlightStatus,
} from '../../types/aliases'

type FormState = {
  title: string
  what_happened: string
  what_to_do_instead: string
  who_applies_note: string
  posted_as: string
  priority: SpotlightPriority
  display_mode: SpotlightDisplayMode
  requires_acknowledgement: boolean
  visibility_scope: SpotlightVisibilityScope
  target_departments: string[]
  target_employee_ids: string[]
  effective_from: string  // <input type="datetime-local"> value
  effective_until: string
  pinned: boolean
  status: SpotlightStatus
}

const DEFAULT_FORM: FormState = {
  title: '',
  what_happened: '',
  what_to_do_instead: '',
  who_applies_note: '',
  posted_as: '',
  priority: 'fyi',
  display_mode: 'bell_only',
  requires_acknowledgement: false,
  visibility_scope: 'org_wide',
  target_departments: [],
  target_employee_ids: [],
  effective_from: '',
  effective_until: '',
  pinned: false,
  status: 'draft',
}

export function SpotlightEdit({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isNew = !id

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  // Lazy-init: captures mount-time as datetime-local string so we can compare
  // form.effective_from to "now" during render without an impure Date.now()
  // call. Stale by the form's lifetime, which is fine for UX bucket switching.
  const [mountedAtLocal] = useState(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const empPromise = supabase.from('employees').select('*').eq('org_id', user.org_id).eq('status', 'active').order('name')
      if (isNew) {
        const { data: emps } = await empPromise
        if (cancelled) return
        setEmployees(emps || [])
        return
      }
      const [{ data: post }, { data: emps }] = await Promise.all([
        supabase.from('spotlight_posts').select('*').eq('id', id!).single(),
        empPromise,
      ])
      if (cancelled) return
      setEmployees(emps || [])
      if (post) setForm(rowToForm(post))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id, isNew, user.org_id])

  const departments = useMemo(() => {
    return [...new Set(employees.flatMap(getEmployeeDepts))].sort()
  }, [employees])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function validate(): string | null {
    if (!form.title.trim()) return t.spotlightTitleRequired
    if (!form.what_happened.trim()) return t.spotlightWhatHappenedRequired
    if (!form.what_to_do_instead.trim()) return t.spotlightWhatToDoRequired
    if (form.visibility_scope === 'departments' && form.target_departments.length === 0) {
      return t.spotlightDeptsRequired
    }
    if (form.visibility_scope === 'specific_employees' && form.target_employee_ids.length === 0) {
      return t.spotlightEmployeesRequired
    }
    return null
  }

  async function save(targetStatus: SpotlightStatus): Promise<string | null> {
    const err = validate()
    if (err) { alert(err); return null }
    setSaving(true)

    const payload = {
      ...formToRow(form, targetStatus),
      org_id: user.org_id,
      created_by: user.id,
    }

    if (isNew) {
      const { data, error } = await supabase
        .from('spotlight_posts')
        .insert(payload)
        .select('id')
        .single()
      setSaving(false)
      if (error) { alert(error.message); return null }
      return data?.id ?? null
    }

    const { error } = await supabase
      .from('spotlight_posts')
      .update(payload)
      .eq('id', id!)
    setSaving(false)
    if (error) { alert(error.message); return null }
    return id!
  }

  async function handleSaveDraft() {
    const newId = await save('draft')
    if (newId) navigate('/dashboard/spotlight')
  }

  async function handleSchedule() {
    const newId = await save('scheduled')
    if (newId) navigate('/dashboard/spotlight')
  }

  async function handlePublish() {
    if (!confirm(t.spotlightPublishConfirm)) return
    const newId = await save('published')
    if (newId) navigate('/dashboard/spotlight')
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  // datetime-local strings sort lexicographically.
  const willBeScheduled = !!form.effective_from && form.effective_from > mountedAtLocal

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {isNew ? t.spotlightNewTitle : t.spotlightEditTitle}
        </h1>
      </div>

      <div className="space-y-5 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <Field label={t.spotlightFieldTitle}>
          <input
            type="text"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldWhatHappened}>
          <textarea
            value={form.what_happened}
            onChange={e => update('what_happened', e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldWhatToDo}>
          <textarea
            value={form.what_to_do_instead}
            onChange={e => update('what_to_do_instead', e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldWhoApplies}>
          <input
            type="text"
            value={form.who_applies_note}
            onChange={e => update('who_applies_note', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldPostedAs} hint={t.spotlightFieldPostedAsHelp}>
          <input
            type="text"
            value={form.posted_as}
            onChange={e => update('posted_as', e.target.value)}
            placeholder={user.name}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.spotlightFieldPriority}>
            <select
              value={form.priority}
              onChange={e => update('priority', e.target.value as SpotlightPriority)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="critical">{t.spotlightPriorityCritical}</option>
              <option value="important">{t.spotlightPriorityImportant}</option>
              <option value="fyi">{t.spotlightPriorityFyi}</option>
            </select>
          </Field>
          <Field label={t.spotlightFieldDisplayMode}>
            <select
              value={form.display_mode}
              onChange={e => update('display_mode', e.target.value as SpotlightDisplayMode)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="modal">{t.spotlightDisplayModal}</option>
              <option value="banner">{t.spotlightDisplayBanner}</option>
              <option value="bell_only">{t.spotlightDisplayBellOnly}</option>
            </select>
          </Field>
        </div>

        <CheckboxField
          label={t.spotlightFieldRequiresAck}
          hint={t.spotlightFieldRequiresAckHelp}
          checked={form.requires_acknowledgement}
          onChange={v => update('requires_acknowledgement', v)}
        />

        <Field label={t.spotlightFieldVisibility}>
          <div className="space-y-2">
            <Radio
              checked={form.visibility_scope === 'org_wide'}
              onChange={() => update('visibility_scope', 'org_wide')}
              label={t.spotlightVisibilityOrgWide}
            />
            <Radio
              checked={form.visibility_scope === 'departments'}
              onChange={() => update('visibility_scope', 'departments')}
              label={t.spotlightVisibilityDepartments}
            />
            {form.visibility_scope === 'departments' && (
              <div className="ml-6">
                <DepartmentsMultiSelect
                  value={form.target_departments}
                  onChange={v => update('target_departments', v)}
                  availableDepartments={departments}
                />
              </div>
            )}
            <Radio
              checked={form.visibility_scope === 'specific_employees'}
              onChange={() => update('visibility_scope', 'specific_employees')}
              label={t.spotlightVisibilitySpecific}
            />
            {form.visibility_scope === 'specific_employees' && (
              <div className="ml-6">
                <EmployeeMultiSelect
                  employees={employees}
                  value={form.target_employee_ids}
                  onChange={v => update('target_employee_ids', v)}
                  placeholder={t.spotlightSelectEmployeesPlaceholder}
                />
              </div>
            )}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.spotlightFieldEffectiveFrom}>
            <input
              type="datetime-local"
              value={form.effective_from}
              onChange={e => update('effective_from', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
          <Field label={t.spotlightFieldEffectiveUntil}>
            <input
              type="datetime-local"
              value={form.effective_until}
              onChange={e => update('effective_until', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </Field>
        </div>

        <CheckboxField
          label={t.spotlightFieldPinned}
          checked={form.pinned}
          onChange={v => update('pinned', v)}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/dashboard/spotlight')}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', opacity: saving ? 0.6 : 1 }}
        >
          {t.spotlightSaveDraft}
        </button>
        {willBeScheduled && (
          <button
            onClick={handleSchedule}
            disabled={saving}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', opacity: saving ? 0.6 : 1 }}
          >
            {t.spotlightSchedule}
          </button>
        )}
        <button
          onClick={handlePublish}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)', opacity: saving ? 0.6 : 1 }}
        >
          {t.spotlightPublish}
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────

function rowToForm(p: SpotlightPost): FormState {
  return {
    title: p.title,
    what_happened: p.what_happened,
    what_to_do_instead: p.what_to_do_instead,
    who_applies_note: p.who_applies_note ?? '',
    posted_as: p.posted_as ?? '',
    priority: p.priority as SpotlightPriority,
    display_mode: p.display_mode as SpotlightDisplayMode,
    requires_acknowledgement: p.requires_acknowledgement,
    visibility_scope: p.visibility_scope as SpotlightVisibilityScope,
    target_departments: p.target_departments ?? [],
    target_employee_ids: p.target_employee_ids ?? [],
    effective_from: isoToLocalInput(p.effective_from),
    effective_until: isoToLocalInput(p.effective_until),
    pinned: p.pinned,
    status: p.status as SpotlightStatus,
  }
}

function formToRow(f: FormState, targetStatus: SpotlightStatus) {
  return {
    title: f.title.trim(),
    what_happened: f.what_happened.trim(),
    what_to_do_instead: f.what_to_do_instead.trim(),
    who_applies_note: f.who_applies_note.trim() || null,
    posted_as: f.posted_as.trim() || null,
    priority: f.priority,
    display_mode: f.display_mode,
    requires_acknowledgement: f.requires_acknowledgement,
    visibility_scope: f.visibility_scope,
    target_departments: f.visibility_scope === 'departments' ? f.target_departments : [],
    target_employee_ids: f.visibility_scope === 'specific_employees' ? f.target_employee_ids : [],
    effective_from: localInputToIso(f.effective_from),
    effective_until: localInputToIso(f.effective_until),
    pinned: f.pinned,
    status: targetStatus,
  }
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

// ─── Tiny UI primitives ─────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
    </div>
  )
}

function CheckboxField({ label, hint, checked, onChange }: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
        {hint && <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
      </div>
    </label>
  )
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
      <input type="radio" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

function EmployeeMultiSelect({ employees, value, onChange, placeholder }: {
  employees: Employee[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [search, setSearch] = useState('')
  const selectedSet = new Set(value)
  const filtered = employees.filter(e => {
    if (selectedSet.has(e.id)) return false
    if (!search.trim()) return true
    return e.name.toLowerCase().includes(search.toLowerCase().trim())
  })

  const selected = employees.filter(e => selectedSet.has(e.id))

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map(e => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                color: 'var(--color-primary)',
              }}
            >
              {e.name}
              <button
                type="button"
                onClick={() => onChange(value.filter(id => id !== e.id))}
                aria-label={`Remove ${e.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      />
      {search.trim() && filtered.length > 0 && (
        <div
          className="mt-1 max-h-40 overflow-y-auto rounded-lg border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          {filtered.slice(0, 20).map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => { onChange([...value, e.id]); setSearch('') }}
              className="block w-full px-3 py-2 text-left text-sm"
              style={{ color: 'var(--color-text)' }}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
