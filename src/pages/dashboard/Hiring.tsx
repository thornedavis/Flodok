// Hiring section. The page hosts two parallel surfaces toggled at the top:
//
//   1. Requests — the pre-pipeline approval workflow (the original Hiring
//      page contents).  Three sub-tabs (My / Approvals / All).
//   2. Job descriptions — the structured role document HR maintains.
//      One filter row (All / Drafts / Published / Archived).
//
// The two surfaces share nothing structurally but live on the same route
// so they can be navigated as a single "Hiring" area in the sidebar.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { useBilling } from '../../contexts/BillingContext'
import { useRole } from '../../hooks/useRole'
import { FilterPill, FilterSearchInput } from '../../components/FilterControls'
import { isEditableByRequester, pendingApprover, statusTone, submitHiringRequest, type RequestStatus } from '../../lib/hiringRequests'
import { JobDescriptionsList } from './JobDescriptions'
import type { Translations } from '../../lib/translations'
import type { User, HiringRequest, CompanyDepartment } from '../../types/aliases'

type HiringTab = 'my' | 'approvals' | 'all'
type SectionView = 'requests' | 'jds'

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
  const navigate = useNavigate()
  const { canWrite } = useBilling()
  const role = useRole(user)
  const [searchParams, setSearchParams] = useSearchParams()
  const view: SectionView = searchParams.get('view') === 'jds' ? 'jds' : 'requests'

  function setView(next: SectionView) {
    const params = new URLSearchParams(searchParams)
    if (next === 'requests') params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  // Title + subtitle stay constant across tabs — the page is "Hiring"
  // regardless of whether you're looking at requests or JDs. Only the
  // primary action button changes, mirroring the Documents page pattern
  // where the New Document/SOP/Contract CTA swaps with the active type.
  const showNewJdAction = view === 'jds' && role.canManagePeople

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.hiringRequestsTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.hiringRequestsSubtitle}</p>
        </div>
        {view === 'requests' && (
          <button
            type="button"
            onClick={() => navigate('/dashboard/hiring/new')}
            disabled={!canWrite}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.hiringRequestsNew}
          </button>
        )}
        {showNewJdAction && (
          <button
            type="button"
            onClick={() => navigate('/dashboard/hiring/jds/new')}
            disabled={!canWrite}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.jdListNew}
          </button>
        )}
      </div>

      <div className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
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

      {view === 'requests' ? <RequestsView user={user} /> : <JobDescriptionsList user={user} />}
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

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

  // Decide which filter pills are visible. "Approvals" is hidden for users
  // who can't approve anything; "All" is hidden for plain members.
  const visibleTabs = useMemo(() => {
    const tabs: HiringTab[] = ['my']
    if (capability.canApprove) tabs.push('approvals')
    if (capability.canSeeAll) tabs.push('all')
    return tabs
  }, [capability])

  // If the current pill becomes hidden after a capability load, fall back to
  // 'my' so we never render an unreachable filter.
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
    const q = search.trim().toLowerCase()
    return requests.filter(r => {
      if (tab === 'my' && r.hiring_manager_id !== user.id) return false
      if (tab === 'approvals' && !isAwaitingMyDecision(r, capability)) return false
      if (!q) return true
      // Case-insensitive substring search across the columns shown in the
      // table. Keeps the implementation in lock-step with what HR sees.
      return (
        r.position_name.toLowerCase().includes(q) ||
        (r.department?.name?.toLowerCase().includes(q) ?? false) ||
        (r.requester?.name?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [requests, tab, capability, user.id, search])

  const searchActive = search.trim().length > 0

  // Inline list-action handlers. Mirrors the per-row affordances on the
  // detail page so HR doesn't have to drill into a request to take routine
  // actions. Delete + submit only show on rows the caller can act on
  // server-side; other states render fewer items in the menu.
  async function handleSubmit(r: RequestRow) {
    if (busy) return
    setBusy(true)
    try {
      await submitHiringRequest(r.id)
      await loadAll()
    } catch (e) {
      // The RPC validates required fields server-side; surface its message
      // (e.g. "Expected hiring date is required to submit") so the user
      // knows what's missing without having to open the edit page first.
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDuplicate(r: RequestRow) {
    if (busy) return
    setBusy(true)
    // Copy the data-bearing fields into a fresh draft owned by the caller.
    // Workflow + decision columns reset to defaults — the duplicate is a
    // new request, not a re-routing of the original.
    const { data, error } = await supabase
      .from('hiring_requests')
      .insert({
        org_id: user.org_id,
        hiring_manager_id: user.id,
        department_id: r.department_id,
        employment_type: r.employment_type,
        category: r.category,
        replacing_employee_id: r.replacing_employee_id,
        source_of_candidate: r.source_of_candidate,
        position_name: r.position_name,
        required_qualifications_md: r.required_qualifications_md,
        expected_hiring_date: r.expected_hiring_date,
        supporting_reason: r.supporting_reason,
        source_of_fund: r.source_of_fund,
        source_of_fund_justification: r.source_of_fund_justification,
        base_salary_min: r.base_salary_min,
        base_salary_max: r.base_salary_max,
        allowances: r.allowances,
        allowance_other: r.allowance_other,
        other_benefits: r.other_benefits,
      })
      .select('id')
      .single()
    setBusy(false)
    if (error || !data) {
      alert(error?.message ?? 'Could not duplicate request')
      return
    }
    // Drop the user into the edit form for the new draft so they can review
    // before submitting — matches what "Save as draft" on the form does.
    navigate(`/dashboard/hiring/${data.id}/edit`)
  }

  async function handleDelete(r: RequestRow) {
    if (busy) return
    if (!confirm(t.hiringRequestsDeleteDraftConfirm)) return
    setBusy(true)
    const { error } = await supabase.from('hiring_requests').delete().eq('id', r.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    await loadAll()
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {visibleTabs.map(k => (
          <FilterPill
            key={k}
            active={tab === k}
            onClick={() => setTab(k)}
            count={tabCounts[k]}
          >
            {tabLabel(k, t)}
          </FilterPill>
        ))}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t.hiringRequestsSearchPlaceholder}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</div>
      ) : visible.length === 0 ? (
        <EmptyState message={searchActive ? t.hiringRequestsNoMatches : emptyMessage(tab, t)} />
      ) : (
        <RequestsTable
          rows={visible}
          t={t}
          lang={lang}
          currentUserId={user.id}
          canWrite={canWrite}
          busy={busy}
          onRowClick={r => navigate(`/dashboard/hiring/${r.id}`)}
          onView={r => navigate(`/dashboard/hiring/${r.id}`)}
          onEdit={r => navigate(`/dashboard/hiring/${r.id}/edit`)}
          onSubmit={handleSubmit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border py-12 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
      {message}
    </div>
  )
}

function RequestsTable({ rows, t, lang, currentUserId, canWrite, busy, onRowClick, onView, onEdit, onSubmit, onDuplicate, onDelete }: {
  rows: RequestRow[]
  t: Translations
  lang: 'en' | 'id'
  currentUserId: string
  canWrite: boolean
  busy: boolean
  onRowClick: (r: RequestRow) => void
  onView: (r: RequestRow) => void
  onEdit: (r: RequestRow) => void
  onSubmit: (r: RequestRow) => void
  onDuplicate: (r: RequestRow) => void
  onDelete: (r: RequestRow) => void
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
            <th className="px-3 py-2.5 text-right" aria-label={t.hiringActionsLabel} />
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
              <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                <RequestActionsMenu
                  request={r}
                  currentUserId={currentUserId}
                  disabled={!canWrite || busy}
                  t={t}
                  onView={() => onView(r)}
                  onEdit={() => onEdit(r)}
                  onSubmit={() => onSubmit(r)}
                  onDuplicate={() => onDuplicate(r)}
                  onDelete={() => onDelete(r)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Per-row Actions menu. Available items depend on row state + caller's
// relationship to it:
//   - View          → always
//   - Edit          → requester + status='draft' (matches RLS UPDATE policy)
//   - Submit        → requester + status='draft' (server enforces required
//                      fields; we surface the RPC error as an alert)
//   - Duplicate     → anyone who can read the row (RLS already gated that)
//   - Delete        → requester + status='draft' (matches RLS DELETE policy)
// The portal-based popover mirrors what Recruitment + Employees do so the
// menu doesn't get clipped by table overflow.
function RequestActionsMenu({ request, currentUserId, disabled, t, onView, onEdit, onSubmit, onDuplicate, onDelete }: {
  request: RequestRow
  currentUserId: string
  disabled: boolean
  t: Translations
  onView: () => void
  onEdit: () => void
  onSubmit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const status = request.status as RequestStatus
  const isRequester = request.hiring_manager_id === currentUserId
  const canEditOrDelete = isRequester && isEditableByRequester(status) && status === 'draft'
  const canSubmit = isRequester && status === 'draft'

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleClose() { setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)', backgroundColor: 'var(--color-bg)' }}
      >
        <span>{t.hiringActionsLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ top: `${pos.top}px`, right: `${pos.right}px`, borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <MenuItem onClick={() => { setOpen(false); onView() }}>{t.hiringRequestsActionView}</MenuItem>
          <MenuItem onClick={() => { setOpen(false); onDuplicate() }}>{t.duplicate}</MenuItem>
          {canEditOrDelete && (
            <MenuItem onClick={() => { setOpen(false); onEdit() }}>{t.hiringRequestsActionEditDraft}</MenuItem>
          )}
          {canSubmit && (
            <MenuItem onClick={() => { setOpen(false); onSubmit() }} primary>{t.hiringRequestsActionSubmit}</MenuItem>
          )}
          {canEditOrDelete && (
            <>
              <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
              <MenuItem onClick={() => { setOpen(false); onDelete() }} danger>{t.delete}</MenuItem>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function MenuItem({ onClick, children, primary, danger }: { onClick: () => void; children: React.ReactNode; primary?: boolean; danger?: boolean }) {
  const color = danger ? 'var(--color-danger)' : primary ? 'var(--color-primary)' : 'var(--color-text)'
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-bg-tertiary)]"
      style={{ color, fontWeight: primary ? 600 : 400 }}
    >
      {children}
    </button>
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
