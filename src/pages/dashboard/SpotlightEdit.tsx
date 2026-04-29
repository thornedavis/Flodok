import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DepartmentsMultiSelect } from '../../components/DepartmentsMultiSelect'
import { DateTimePicker } from '../../components/DateTimePicker'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts } from '../../lib/employee'
import { useOutletContext } from 'react-router-dom'
import type { DashboardOutletContext } from '../../components/Layout'
import type { Translations } from '../../lib/translations'
import type {
  User, Employee, SpotlightPost,
  SpotlightPriority, SpotlightDisplayMode, SpotlightVisibilityScope, SpotlightStatus,
  SpotlightPostedAsKind,
} from '../../types/aliases'

type FormState = {
  title: string
  what_happened: string
  what_to_do_instead: string
  posted_as_kind: SpotlightPostedAsKind
  priority: SpotlightPriority
  display_mode: SpotlightDisplayMode
  requires_acknowledgement: boolean
  visibility_scope: SpotlightVisibilityScope
  target_departments: string[]
  target_employee_ids: string[]
  effective_from: string  // datetime-local format ("YYYY-MM-DDTHH:MM"), "" if unset
  pinned: boolean
  status: SpotlightStatus
  image_url: string
}

const DEFAULT_FORM: FormState = {
  title: '',
  what_happened: '',
  what_to_do_instead: '',
  posted_as_kind: 'self',
  priority: 'fyi',
  display_mode: 'bell_only',
  requires_acknowledgement: false,
  visibility_scope: 'org_wide',
  target_departments: [],
  target_employee_ids: [],
  effective_from: '',
  pinned: false,
  status: 'draft',
  image_url: '',
}

export function SpotlightEdit({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const { org } = useOutletContext<DashboardOutletContext>()
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

  // Editing an already-published post: save content silently (no re-fire).
  async function handleSaveContent() {
    const newId = await save('published')
    if (newId) navigate('/dashboard/spotlight')
  }

  // Editing an already-published post: save content AND re-fire to the audience.
  async function handleSaveAndRepublish() {
    if (!confirm(t.spotlightRepublishConfirm)) return
    const ok = await save('published')
    if (!ok) return
    setSaving(true)
    const { error } = await supabase.rpc('republish_spotlight_post', { p_post_id: id! })
    setSaving(false)
    if (error) { alert(error.message); return }
    navigate('/dashboard/spotlight')
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  // datetime-local strings sort lexicographically.
  const willBeScheduled = !!form.effective_from && form.effective_from > mountedAtLocal
  // True when editing an already-published post — switches the button bar to
  // "Save (no republish)" + "Save & republish" so the manager picks whether
  // to re-fire the announcement after a content edit.
  const isEditingPublished = !isNew && form.status === 'published'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          {isNew ? t.spotlightNewTitle : t.spotlightEditTitle}
        </h1>
      </div>

      <div className="space-y-5 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <Field label={t.spotlightFieldTitle} required>
          <input
            type="text"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldWhatHappened} required>
          <textarea
            value={form.what_happened}
            onChange={e => update('what_happened', e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldWhatToDo} required hint={t.spotlightTextareaLinkHint}>
          <textarea
            value={form.what_to_do_instead}
            onChange={e => update('what_to_do_instead', e.target.value)}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          />
        </Field>

        <Field label={t.spotlightFieldImage} hint={t.spotlightFieldImageHelp}>
          <ImageField
            value={form.image_url}
            onChange={v => update('image_url', v)}
            t={t}
          />
        </Field>

        <Field label={t.spotlightFieldPostedAs}>
          <select
            value={form.posted_as_kind}
            onChange={e => update('posted_as_kind', e.target.value as SpotlightPostedAsKind)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          >
            <option value="self">{user.name}</option>
            <option value="org">{org?.display_name || org?.name || t.spotlightPostedAsOrg}</option>
          </select>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <CheckboxField
            label={t.spotlightFieldRequiresAck}
            hint={t.spotlightFieldRequiresAckHelp}
            checked={form.requires_acknowledgement}
            onChange={v => update('requires_acknowledgement', v)}
          />
          <CheckboxField
            label={t.spotlightFieldPinned}
            checked={form.pinned}
            onChange={v => update('pinned', v)}
          />
        </div>

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

        <Field label={t.spotlightFieldPublishAt} hint={t.spotlightFieldPublishAtHelp}>
          <DateTimePicker
            value={form.effective_from}
            onChange={v => update('effective_from', v)}
            placeholder={t.spotlightPublishAtPlaceholder}
          />
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/dashboard/spotlight')}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {t.cancel}
        </button>
        {isEditingPublished ? (
          <>
            <button
              onClick={handleSaveContent}
              disabled={saving}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', opacity: saving ? 0.6 : 1 }}
            >
              {t.spotlightSaveNoRepublish}
            </button>
            <button
              onClick={handleSaveAndRepublish}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-primary)', opacity: saving ? 0.6 : 1 }}
            >
              {t.spotlightSaveAndRepublish}
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
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
    posted_as_kind: (p.posted_as_kind as SpotlightPostedAsKind) ?? 'self',
    priority: p.priority as SpotlightPriority,
    display_mode: p.display_mode as SpotlightDisplayMode,
    requires_acknowledgement: p.requires_acknowledgement,
    visibility_scope: p.visibility_scope as SpotlightVisibilityScope,
    target_departments: p.target_departments ?? [],
    target_employee_ids: p.target_employee_ids ?? [],
    effective_from: isoToLocalInput(p.effective_from),
    pinned: p.pinned,
    status: p.status as SpotlightStatus,
    image_url: p.image_url ?? '',
  }
}

function formToRow(f: FormState, targetStatus: SpotlightStatus) {
  return {
    title: f.title.trim(),
    what_happened: f.what_happened.trim(),
    what_to_do_instead: f.what_to_do_instead.trim(),
    posted_as_kind: f.posted_as_kind,
    priority: f.priority,
    display_mode: f.display_mode,
    requires_acknowledgement: f.requires_acknowledgement,
    visibility_scope: f.visibility_scope,
    target_departments: f.visibility_scope === 'departments' ? f.target_departments : [],
    target_employee_ids: f.visibility_scope === 'specific_employees' ? f.target_employee_ids : [],
    effective_from: localInputToIso(f.effective_from),
    effective_until: null,
    pinned: f.pinned,
    status: targetStatus,
    image_url: f.image_url.trim() || null,
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

function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: 'var(--color-danger)' }}>*</span>}
      </label>
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

// Wide-image upload for Spotlight posts. Stores in the `spotlight` bucket
// keyed by a generated id so multiple uploads from the same form session
// don't collide. Returns the public URL via onChange.
function ImageField({ value, onChange, t }: {
  value: string
  onChange: (next: string) => void
  t: Translations
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const MAX_BYTES = 5 * 1024 * 1024

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ALLOWED.includes(file.type)) { setError(t.spotlightImageInvalidType); return }
    if (file.size > MAX_BYTES) { setError(t.spotlightImageTooLarge); return }

    setError('')
    setUploading(true)

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    // Random key per upload — avoids collisions and lets us keep the old
    // file around if the user uploads-then-cancels (cleanup is opportunistic).
    const path = `posts/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('spotlight').upload(path, file, { upsert: false })
    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('spotlight').getPublicUrl(path)
    onChange(publicUrl)
    setUploading(false)
  }

  async function handleRemove() {
    if (!value) return
    setUploading(true)
    setError('')
    // Best-effort delete — ignore failures so the form never gets stuck.
    const match = value.match(/\/spotlight\/([^?]+)/)
    if (match) await supabase.storage.from('spotlight').remove([match[1]])
    onChange('')
    setUploading(false)
  }

  return (
    <div>
      {value ? (
        <div className="space-y-2">
          <img
            src={value}
            alt=""
            className="max-h-72 w-full rounded-lg border object-cover"
            style={{ borderColor: 'var(--color-border)' }}
          />
          <div className="flex gap-2">
            <label
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {uploading ? t.uploading : t.change}
              <input type="file" accept="image/*" onChange={handleSelect} disabled={uploading} className="hidden" />
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ color: 'var(--color-danger)' }}
            >
              {t.remove}
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-6 text-center text-sm ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>{uploading ? t.uploading : t.spotlightImageUploadCta}</span>
          <input type="file" accept="image/*" onChange={handleSelect} disabled={uploading} className="hidden" />
        </label>
      )}
      {error && <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
    </div>
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
