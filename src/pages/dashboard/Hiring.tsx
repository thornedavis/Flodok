// Hiring section. The page hosts two parallel surfaces toggled at the top:
//
//   1. Requests — the pre-pipeline approval workflow (the original Hiring
//      page contents).  Three sub-tabs (My / Approvals / All).
//   2. Job descriptions — the structured role document HR maintains.
//      One filter row (All / Drafts / Published / Archived).
//
// The two surfaces share nothing structurally but live on the same route
// so they can be navigated as a single "Hiring" area in the sidebar.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useRole } from '../../hooks/useRole'
import { pendingApprover, statusTone, type RequestStatus } from '../../lib/hiringRequests'
import { jdStatusTone, type JobDescriptionStatus } from '../../lib/jobDescriptions'
import type { Translations } from '../../lib/translations'
import type { User, HiringRequest, JobDescription, CompanyDepartment } from '../../types/aliases'

type HiringTab = 'my' | 'approvals' | 'all'
type SectionView = 'requests' | 'jds'
type JdFilter = 'all' | 'draft' | 'published' | 'archived'

// What this user can see, derived from role + linked employee. Determines
// which tabs render and what shows on the page.
interface ViewerCapability {
  canSeeAll: boolean      // owner / admin / hr
  isOwner: boolean
  canApprove: boolean     // owner OR linked-employee is a dept manager
  managedDepartmentIds: Set<string>
}

const REQUEST_COLUMNS = '*, department:company_departments!hiring_requests_department_id_fkey(id, name), requester:users!hiring_requests_hiring_manager_id_fkey(id, name)'

type RequestRow = HiringRequest & {
  department: Pick<CompanyDepartment, 'id' | 'name'> | null
  requester: { id: string; name: string | null } | null
}

export function Hiring({ user }: { user: User }) {
  const { t } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const view: SectionView = searchParams.get('view') === 'jds' ? 'jds' : 'requests'

  function setView(next: SectionView) {
    const params = new URLSearchParams(searchParams)
    if (next === 'requests') params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <SectionToggle
          active={view === 'requests'}
          onClick={() => setView('requests')}
          label={t.hiringSectionToggleRequests}
        />
        <SectionToggle
          active={view === 'jds'}
          onClick={() => setView('jds')}
          label={t.hiringSectionToggleJobDescriptions}
        />
      </div>

      {view === 'requests' ? <RequestsView user={user} /> : <JobDescriptionsView user={user} />}
    </div>
  )
}

// ─── Requests view ──────────────────────────────────────────────────────

function RequestsView({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const role = useRole(user)

  const [requests, setRequests] = useState<RequestRow[]>([])
  const [capability, setCapability] = useState<ViewerCapability>({
    canSeeAll: role.canManagePeople,
    isOwner: role.isOwner,
    canApprove: role.isOwner,
    managedDepartmentIds: new Set(),
  })
  const [tab, setTab] = useState<HiringTab>('my')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [user.id, user.org_id])

  async function loadAll() {
    setLoading(true)
    // Departments this user manages — drives both the Approvals tab filter
    // and the "Approvals" tab visibility (no managed depts + not owner =
    // no approvals tab at all).
    const managedDeptsPromise = user.employee_id
      ? supabase.from('company_departments').select('id').eq('manager_employee_id', user.employee_id)
      : Promise.resolve({ data: [] as { id: string }[] })

    const [requestsResult, managedDeptsResult] = await Promise.all([
      supabase.from('hiring_requests')
        .select(REQUEST_COLUMNS)
        .eq('org_id', user.org_id)
        .order('created_at', { ascending: false }),
      managedDeptsPromise,
    ])

    const managedIds = new Set((managedDeptsResult.data ?? []).map(d => d.id))
    setCapability({
      canSeeAll: role.canManagePeople,
      isOwner: role.isOwner,
      canApprove: role.isOwner || managedIds.size > 0,
      managedDepartmentIds: managedIds,
    })
    setRequests((requestsResult.data ?? []) as RequestRow[])
    setLoading(false)
  }

  // Decide which tabs are visible. The "Approvals" tab is hidden for users
  // who can't approve anything; the "All" tab is hidden for plain members.
  const visibleTabs = useMemo(() => {
    const tabs: HiringTab[] = ['my']
    if (capability.canApprove) tabs.push('approvals')
    if (capability.canSeeAll) tabs.push('all')
    return tabs
  }, [capability])

  // If the current tab becomes hidden after a capability load, fall back to
  // 'my' so we never render an unreachable tab.
  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab('my')
  }, [visibleTabs, tab])

  const tabCounts = useMemo(() => {
    const counts: Record<HiringTab, number> = { my: 0, approvals: 0, all: 0 }
    for (const r of requests) {
      if (r.hiring_manager_id === user.id) counts.my += 1
      if (capability.canSeeAll) counts.all += 1
      if (capability.canApprove && isAwaitingMyDecision(r, capability)) counts.approvals += 1
    }
    return counts
  }, [requests, capability, user.id])

  const visible = useMemo(() => {
    return requests.filter(r => {
      if (tab === 'my') return r.hiring_manager_id === user.id
      if (tab === 'approvals') return isAwaitingMyDecision(r, capability)
      return true
    })
  }, [requests, tab, capability, user.id])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.hiringRequestsTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.hiringRequestsSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/hiring/new')}
          disabled={!canWrite}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.hiringRequestsNew}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {visibleTabs.map(k => (
          <TabButton
            key={k}
            active={tab === k}
            onClick={() => setTab(k)}
            label={tabLabel(k, t)}
            count={tabCounts[k]}
          />
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
      ) : visible.length === 0 ? (
        <EmptyState message={emptyMessage(tab, t)} />
      ) : (
        <RequestsTable rows={visible} t={t} lang={lang} onRowClick={r => navigate(`/dashboard/hiring/${r.id}`)} />
      )}
    </div>
  )
}

// ─── Job Descriptions view ──────────────────────────────────────────────

const JD_LIST_COLUMNS = '*, department:company_departments!job_descriptions_department_id_fkey(id, name)'

type JdRow = JobDescription & {
  department: Pick<CompanyDepartment, 'id' | 'name'> | null
}

function JobDescriptionsView({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const role = useRole(user)

  const [rows, setRows] = useState<JdRow[]>([])
  const [filter, setFilter] = useState<JdFilter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('job_descriptions')
        .select(JD_LIST_COLUMNS)
        .eq('org_id', user.org_id)
        .order('updated_at', { ascending: false })
      if (cancelled) return
      setRows((data ?? []) as JdRow[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user.org_id])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(r => r.status === filter)
  }, [rows, filter])

  // Non-HR users only see published+archived JDs (RLS already filters
  // drafts out for them server-side, but the filter chip set should reflect
  // what's actually viewable to avoid confusing empty filters).
  const visibleFilters: JdFilter[] = role.canManagePeople
    ? ['all', 'draft', 'published', 'archived']
    : ['all', 'published', 'archived']

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.jdListTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.jdListSubtitle}</p>
        </div>
        {role.canManagePeople && (
          <button
            type="button"
            onClick={() => navigate('/dashboard/hiring/jds/new')}
            disabled={!canWrite}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.jdListNew}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {visibleFilters.map(f => (
          <TabButton
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            label={jdFilterLabel(f, t)}
            count={f === 'all' ? rows.length : rows.filter(r => r.status === f).length}
          />
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
      ) : filtered.length === 0 ? (
        <EmptyState message={t.jdListEmpty} />
      ) : (
        <JdTable rows={filtered} t={t} lang={lang} onRowClick={r => navigate(`/dashboard/hiring/jds/${r.id}/edit`)} />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isAwaitingMyDecision(r: HiringRequest, cap: ViewerCapability): boolean {
  const pending = pendingApprover(r.status as RequestStatus)
  if (pending === 'manager') return cap.managedDepartmentIds.has(r.department_id)
  if (pending === 'owner') return cap.isOwner
  return false
}

function tabLabel(tab: HiringTab, t: Translations): string {
  switch (tab) {
    case 'my': return t.hiringRequestsTabMy
    case 'approvals': return t.hiringRequestsTabApprovals
    case 'all': return t.hiringRequestsTabAll
  }
}

function emptyMessage(tab: HiringTab, t: Translations): string {
  switch (tab) {
    case 'my': return t.hiringRequestsEmptyMy
    case 'approvals': return t.hiringRequestsEmptyApprovals
    case 'all': return t.hiringRequestsEmptyAll
  }
}

function statusLabel(s: RequestStatus, t: Translations): string {
  switch (s) {
    case 'draft': return t.hiringRequestsStatusDraft
    case 'submitted': return t.hiringRequestsStatusSubmitted
    case 'manager_approved': return t.hiringRequestsStatusManagerApproved
    case 'approved': return t.hiringRequestsStatusApproved
    case 'rejected_by_manager': return t.hiringRequestsStatusRejectedByManager
    case 'rejected_by_owner': return t.hiringRequestsStatusRejectedByOwner
    case 'actioned': return t.hiringRequestsStatusActioned
  }
}

function jdFilterLabel(f: JdFilter, t: Translations): string {
  switch (f) {
    case 'all': return t.jdFilterAll
    case 'draft': return t.jdFilterDrafts
    case 'published': return t.jdFilterPublished
    case 'archived': return t.jdFilterArchived
  }
}

function jdStatusLabel(s: JobDescriptionStatus, t: Translations): string {
  switch (s) {
    case 'draft': return t.jdStatusDraft
    case 'published': return t.jdStatusPublished
    case 'archived': return t.jdStatusArchived
  }
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function SectionToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-2 text-sm font-medium transition-colors"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      {label}
      {active && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />}
    </button>
  )
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      <span>{label}</span>
      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{count}</span>
      {active && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />}
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border py-12 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
      {message}
    </div>
  )
}

function RequestsTable({ rows, t, lang, onRowClick }: {
  rows: RequestRow[]
  t: Translations
  lang: 'en' | 'id'
  onRowClick: (r: RequestRow) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-sm">
        <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsColPosition}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsColDepartment}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsColRequester}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsColCreated}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.hiringRequestsColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r)}
              className="cursor-pointer border-t hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{r.position_name}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{r.department?.name ?? '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{r.requester?.name ?? '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(r.created_at, lang)}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status as RequestStatus} t={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JdTable({ rows, t, lang, onRowClick }: {
  rows: JdRow[]
  t: Translations
  lang: 'en' | 'id'
  onRowClick: (r: JdRow) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="w-full text-sm">
        <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColTitle}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColDepartment}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColVersion}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColUpdated}</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{t.jdListColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r)}
              className="cursor-pointer border-t hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text)' }}>{r.title}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{r.department?.name ?? '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{r.doc_version || `v${r.current_version}`}</td>
              <td className="px-4 py-3" style={{ color: 'var(--color-text-tertiary)' }}>{formatDate(r.updated_at, lang)}</td>
              <td className="px-4 py-3"><JdStatusBadge status={r.status as JobDescriptionStatus} t={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JdStatusBadge({ status, t }: { status: JobDescriptionStatus; t: Translations }) {
  const tone = jdStatusTone(status)
  const palette: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
    success: { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
    muted:   { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-tertiary)' },
  }
  const { bg, fg } = palette[tone]
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>
      {jdStatusLabel(status, t)}
    </span>
  )
}

function StatusBadge({ status, t }: { status: RequestStatus; t: Translations }) {
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
      {statusLabel(status, t)}
    </span>
  )
}

function formatDate(iso: string, lang: 'en' | 'id'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}
