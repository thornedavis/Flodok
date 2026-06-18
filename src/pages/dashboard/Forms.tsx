// Forms section — leave / overtime requests submitted by employees via the
// portal, routed through the Manager → Owner approval chain. A single list of
// every submission the viewer can see (RLS-scoped), with the Documents-style
// view toggle + filter panel + employee search.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useRole } from '../../hooks/useRole'
import { FilterSearchInput, FilterPanel, type FilterPanelSection } from '../../components/FilterControls'
import { Skeleton } from '../../components/Skeleton'
import { Modal } from '../../components/Modal'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { type EmpDeptShape } from '../../lib/employee'
import { LeaveForm, OvertimeForm } from '../../components/portal/RequestsTab'
import { statusTone } from '../../lib/forms/registry'
import type { Translations } from '../../lib/translations'
import type { User, FormSubmission, FormStatus, FormType, Employee } from '../../types/aliases'

const FORM_COLUMNS =
  '*, employee:employees!form_submissions_employee_id_fkey(id, name), manager:users!form_submissions_manager_user_id_fkey(id, name)'

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

type EmployeeWithDepartments = Employee & EmpDeptShape
type ViewMode = 'grid' | 'list'

const FORMS_VIEW_KEY = 'flodok:forms:view'
function loadFormsView(): ViewMode {
  if (typeof window === 'undefined') return 'list'
  return localStorage.getItem(FORMS_VIEW_KEY) === 'grid' ? 'grid' : 'list'
}

type FormRow = FormSubmission & {
  employee: { id: string; name: string | null } | null
  manager: { id: string; name: string | null } | null
}

export function Forms({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const role = useRole(user)

  const [rows, setRows] = useState<FormRow[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null)
  const [employees, setEmployees] = useState<EmployeeWithDepartments[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(loadFormsView)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { loadAll() }, [user.id, user.org_id])

  useEffect(() => {
    supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).is('deleted_at', null).order('name')
      .then(({ data }) => setEmployees((data ?? []) as unknown as EmployeeWithDepartments[]))
  }, [user.org_id])

  function changeView(v: ViewMode) {
    setViewMode(v)
    try { localStorage.setItem(FORMS_VIEW_KEY, v) } catch { /* ignore */ }
  }

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase
      .from('form_submissions')
      .select(FORM_COLUMNS)
      .eq('org_id', user.org_id)
      .order('created_at', { ascending: false })
    setRows((data ?? []) as FormRow[])
    setLoading(false)
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (typeFilter.length > 0 && !typeFilter.includes(r.form_type)) return false
      if (statusFilter.length > 0 && !statusFilter.includes(r.status)) return false
      if (employeeFilter && r.employee_id !== employeeFilter) return false
      if (dateFrom || dateTo) {
        const d = (r.submitted_at ?? r.created_at ?? '').slice(0, 10)
        if (dateFrom && d < dateFrom) return false
        if (dateTo && d > dateTo) return false
      }
      if (!q) return true
      return (
        (r.employee?.name?.toLowerCase().includes(q) ?? false) ||
        formTypeLabel(r.form_type as FormType, t).toLowerCase().includes(q)
      )
    })
  }, [rows, search, typeFilter, statusFilter, employeeFilter, dateFrom, dateTo, t])

  const FILTER_STATUSES: FormStatus[] = ['submitted', 'manager_approved', 'approved', 'rejected_by_manager', 'rejected_by_owner']
  const filterSections: FilterPanelSection[] = [
    {
      type: 'multiselect', key: 'type', label: t.formsColType, value: typeFilter, onChange: setTypeFilter,
      options: [
        { id: 'leave_request', label: t.formsTypeLeave, count: rows.filter(r => r.form_type === 'leave_request').length },
        { id: 'overtime_request', label: t.formsTypeOvertime, count: rows.filter(r => r.form_type === 'overtime_request').length },
      ],
    },
    {
      type: 'multiselect', key: 'status', label: t.formsColStatus, value: statusFilter, onChange: setStatusFilter,
      options: FILTER_STATUSES.map(s => ({ id: s, label: formStatusLabel(s, t), count: rows.filter(r => r.status === s).length })),
    },
    {
      type: 'daterange', key: 'date', label: t.documentsFilterDate,
      from: dateFrom, to: dateTo,
      onFromChange: setDateFrom, onToChange: setDateTo,
      fromLabel: t.documentsFilterDateFrom, toLabel: t.documentsFilterDateTo,
    },
  ]

  const anyFilterActive = search.trim().length > 0 || typeFilter.length > 0 || statusFilter.length > 0 || !!employeeFilter || !!dateFrom || !!dateTo

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.formsTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.formsSubtitle}</p>
        </div>
        {role.canManagePeople && (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.formsNewRequest}
          </button>
        )}
      </div>
      {showNew && <NewFormModal employees={employees} onClose={() => setShowNew(false)} onCreated={loadAll} />}

      <FormTypeTiles t={t} onConfigure={ty => navigate(`/dashboard/forms/config/${ty}`)} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ViewModeToggle value={viewMode} onChange={changeView} t={t} />
        <FilterPanel
          triggerLabel={t.filterButtonLabel}
          sections={filterSections}
          onReset={() => { setTypeFilter([]); setStatusFilter([]); setEmployeeFilter(null); setDateFrom(''); setDateTo('') }}
        />
        {employees.length > 0 && (
          <div className="w-full sm:w-56">
            <EmployeeSelect value={employeeFilter} onChange={setEmployeeFilter} employees={employees} emptyLabel={t.formsFilterAllEmployees} />
          </div>
        )}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput value={search} onChange={setSearch} placeholder={t.formsSearchPlaceholder} />
          </div>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState message={anyFilterActive ? t.formsNoMatches : t.formsEmptyAll} />
      ) : viewMode === 'grid' ? (
        <FormsGrid rows={visible} t={t} lang={lang} onOpen={r => navigate(`/dashboard/forms/${r.id}`)} />
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColEmployee}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColType}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColSubmitted}</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsColStatus}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/dashboard/forms/${r.id}`)}
                  className="cursor-pointer border-t hover:bg-[var(--color-bg-tertiary)]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{r.employee?.name ?? '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{formTypeLabel(r.form_type as FormType, t)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(r.submitted_at ?? r.created_at, lang)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status as FormStatus} t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Shared label + badge helpers (also used by FormDetail) ─────────────────

export function formTypeLabel(ft: FormType, t: Translations): string {
  return ft === 'leave_request' ? t.formsTypeLeave : t.formsTypeOvertime
}

export function formStatusLabel(s: FormStatus, t: Translations): string {
  switch (s) {
    case 'draft':               return t.formsStatusDraft
    case 'submitted':           return t.formsStatusSubmitted
    case 'manager_approved':    return t.formsStatusManagerApproved
    case 'approved':            return t.formsStatusApproved
    case 'rejected_by_manager': return t.formsStatusRejectedByManager
    case 'rejected_by_owner':   return t.formsStatusRejectedByOwner
  }
}

export function StatusBadge({ status, t }: { status: FormStatus; t: Translations }) {
  const tone = statusTone(status)
  const palette: Record<string, { bg: string; fg: string }> = {
    neutral:  { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
    progress: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' },
    success:  { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    danger:   { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',  fg: 'var(--color-danger)' },
  }
  const { bg, fg } = palette[tone]
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {formStatusLabel(status, t)}
    </span>
  )
}

export function formatDate(iso: string | null, lang: 'en' | 'id'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

// HR files a request on behalf of an employee. Reuses the portal submit RPCs
// (HR can read employee slug+token, same as the portal-link feature) and the
// curated portal form components.
function NewFormModal({ employees, onClose, onCreated }: { employees: EmployeeWithDepartments[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang()
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [creds, setCreds] = useState<{ slug: string; token: string } | null>(null)
  const [type, setType] = useState<'leave' | 'overtime' | null>(null)
  const [busy, setBusy] = useState(false)

  async function pickEmployee(idv: string | null) {
    setEmployeeId(idv); setType(null); setCreds(null)
    if (!idv) return
    setBusy(true)
    const { data } = await supabase.from('employees').select('slug, access_token').eq('id', idv).single()
    if (data) setCreds({ slug: data.slug, token: data.access_token })
    setBusy(false)
  }

  const done = () => { onCreated(); onClose() }

  return (
    <Modal open onClose={onClose} title={t.formsNewRequest}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.formsNewRequestIntro}</p>
        <div>
          <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsSelectEmployee}</span>
          <EmployeeSelect value={employeeId} onChange={pickEmployee} employees={employees} emptyLabel={t.formsSelectEmployeePlaceholder} />
        </div>
        {busy && <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>…</div>}
        {creds && !type && (
          <div className="grid gap-3">
            <PickCardBtn label={t.portalRequestNewLeave} sub={t.formsTypeLeave} onClick={() => setType('leave')} />
            <PickCardBtn label={t.portalRequestNewOvertime} sub={t.formsTypeOvertime} onClick={() => setType('overtime')} />
          </div>
        )}
        {creds && type === 'leave' && <LeaveForm slug={creds.slug} token={creds.token} t={t} onDone={done} onCancel={() => setType(null)} />}
        {creds && type === 'overtime' && <OvertimeForm slug={creds.slug} token={creds.token} t={t} onDone={done} onCancel={() => setType(null)} />}
      </div>
    </Modal>
  )
}

function PickCardBtn({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start rounded-xl border p-4 text-left transition-colors hover:bg-[var(--color-bg-tertiary)]" style={{ borderColor: 'var(--color-border)' }}>
      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{label}</span>
      <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</span>
    </button>
  )
}

// Documents-style band of form-type tiles. Each tile is a small mock-up of the
// form (title bar + checkbox grid / table + signature row); clicking opens the
// per-type config page.
function FormTypeTiles({ t, onConfigure }: { t: Translations; onConfigure: (ft: FormType) => void }) {
  return (
    <section className="mb-6 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.formsTypeTilesTitle}</h2>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-6">
        <FormTypeTile label={t.formsTypeLeave} kind="leave" hint={t.formsTileConfigure} onClick={() => onConfigure('leave_request')} />
        <FormTypeTile label={t.formsTypeOvertime} kind="overtime" hint={t.formsTileConfigure} onClick={() => onConfigure('overtime_request')} />
      </div>
    </section>
  )
}

function FormTypeTile({ label, kind, hint, onClick }: { label: string; kind: 'leave' | 'overtime'; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col text-left transition-all">
      <div
        className="aspect-[3/4] overflow-hidden rounded-lg border p-2.5 transition-all"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.18)' }}
        onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none' }}
      >
        <FormMockup kind={kind} />
      </div>
      <div className="mt-2 px-0.5">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</div>
      </div>
    </button>
  )
}

function FormMockup({ kind }: { kind: 'leave' | 'overtime' }) {
  const line = (w: string, key?: number) => <div key={key} className="h-1 rounded" style={{ width: w, backgroundColor: 'var(--color-bg-tertiary)' }} />
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="h-1.5 w-3/5 rounded" style={{ backgroundColor: 'var(--color-primary)', opacity: 0.85 }} />
      {kind === 'leave' ? (
        <div className="mt-0.5 grid grid-cols-2 gap-x-1.5 gap-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 shrink-0 rounded-[1px] border" style={{ borderColor: 'var(--color-text-tertiary)' }} />
              {line('100%')}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-0.5 rounded border" style={{ borderColor: 'var(--color-border)' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-0.5 px-0.5 py-0.5" style={{ borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
              {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-1 flex-1 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />)}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">{line('90%', 1)}{line('70%', 2)}</div>
      <div className="mt-auto grid grid-cols-3 gap-1">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-3 rounded border" style={{ borderColor: 'var(--color-border)' }} />)}
      </div>
    </div>
  )
}

function ViewModeToggle({ value, onChange, t }: { value: ViewMode; onChange: (v: ViewMode) => void; t: Translations }) {
  const items: Array<{ key: ViewMode; label: string; icon: React.ReactNode }> = [
    {
      key: 'list', label: t.documentsViewList,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      key: 'grid', label: t.documentsViewGrid,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
    },
  ]
  return (
    <div role="group" className="inline-flex items-center rounded-full border p-0.5" style={{ borderColor: 'var(--color-border)' }}>
      {items.map(item => {
        const active = value === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={active}
            title={item.label}
            className="flex items-center justify-center rounded-full p-1.5 transition-colors"
            style={{
              backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {item.icon}
          </button>
        )
      })}
    </div>
  )
}

function FormsGrid({ rows, t, lang, onOpen }: { rows: FormRow[]; t: Translations; lang: 'en' | 'id'; onOpen: (r: FormRow) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map(r => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r)}
          className="group flex flex-col rounded-lg border p-4 text-left transition-all"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.18)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none' }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{r.employee?.name ?? '—'}</span>
            <StatusBadge status={r.status as FormStatus} t={t} />
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{formTypeLabel(r.form_type as FormType, t)}</div>
          <div className="mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(r.submitted_at ?? r.created_at, lang)}</div>
        </button>
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border py-12 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
      {message}
    </div>
  )
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }} role="status" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t px-4 py-3.5 first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-5 w-24 rounded-full" />
        </div>
      ))}
    </div>
  )
}
