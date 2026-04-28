import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { SOPEditor } from '../../components/Editor'
import { Avatar } from '../../components/Avatar'
import { DiffPanel } from '../../components/DiffPanel'
import { useLang } from '../../contexts/LanguageContext'
import { writeSnapshot } from '../../lib/snapshotApi'
import type { User, PendingUpdate, Employee, Sop } from '../../types/aliases'

type Change = { section?: string; summary?: string; content_markdown?: string; change_type?: string }
type ProposedChanges = { changes?: Change[] }

type EnrichedUpdate = PendingUpdate & {
  employee?: Employee | null
  currentSop?: Sop | null
  mergedContent: string
}

type ResolvedDiffData = {
  oldContent: string
  newContent: string
}

/** Build the full SOP content to show in the editor */
function buildMergedContent(sop: Sop | null | undefined, changes: Change[]): string {
  const existing = sop?.content_markdown || ''

  // If the change is a full revision, use it directly
  const revision = changes.find(c => c.change_type === 'revision')
  if (revision?.content_markdown) {
    return revision.content_markdown
  }

  // Legacy: append new content to existing SOP
  const newContent = changes
    .map(c => {
      const section = c.section ? `## ${c.section}\n\n` : ''
      return `${section}${c.content_markdown || ''}`
    })
    .join('\n\n')

  if (!existing) return newContent
  if (!newContent) return existing
  return `${existing}\n\n${newContent}`
}

function getChangeSummaries(update: PendingUpdate): string[] {
  const changes = (update.proposed_changes as ProposedChanges).changes || []
  return changes
    .map(c => c.summary)
    .filter((s): s is string => !!s)
}

const ROUTER_URL = 'https://flodok-router.thorne-davis.workers.dev'

export function Pending({ user }: { user: User }) {
  const { t } = useLang()
  const [updates, setUpdates] = useState<EnrichedUpdate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [pollResult, setPollResult] = useState<string | null>(null)
  // Track edited full-SOP content per update ID
  const [editedContent, setEditedContent] = useState<Record<string, string>>({})
  // Pending section filters
  const [pendingFilterEmployee, setPendingFilterEmployee] = useState<string>('')
  const [pendingSort, setPendingSort] = useState<'newest' | 'oldest'>('newest')
  // Resolved section state
  const [expandedResolvedId, setExpandedResolvedId] = useState<string | null>(null)
  const [resolvedDiffs, setResolvedDiffs] = useState<Record<string, ResolvedDiffData>>({})
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null)
  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  // Pagination
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [updatesResult, empResult] = await Promise.all([
      supabase.from('pending_updates').select('*').eq('org_id', user.org_id).order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
    ])

    const empMap = new Map((empResult.data || []).map(e => [e.id, e]))
    setEmployees(empResult.data || [])

    // Fetch SOPs for all matched employees in pending updates
    const pendingUpdates = (updatesResult.data || []).filter(u => u.status === 'pending')
    const employeeIds = [...new Set(pendingUpdates.map(u => u.employee_id).filter((id): id is string => !!id))]

    let sopMap = new Map<string, Sop>()
    if (employeeIds.length > 0) {
      const { data: sops } = await supabase
        .from('sops')
        .select('*')
        .in('employee_id', employeeIds)

      sopMap = new Map((sops || []).filter(s => s.employee_id !== null).map(s => [s.employee_id as string, s]))
    }

    setUpdates((updatesResult.data || []).map(u => {
      const employee = u.employee_id ? empMap.get(u.employee_id) : null
      const currentSop = u.employee_id ? sopMap.get(u.employee_id) : null
      const changes = (u.proposed_changes as ProposedChanges).changes || []
      return {
        ...u,
        employee: employee || null,
        currentSop: currentSop || null,
        mergedContent: buildMergedContent(currentSop, changes),
      }
    }))
    setEditedContent({})
    setLoading(false)
  }

  const handleContentChange = useCallback((updateId: string, newContent: string) => {
    setEditedContent(prev => ({ ...prev, [updateId]: newContent }))
  }, [])

  function getFinalContent(update: EnrichedUpdate): string {
    return update.id in editedContent ? editedContent[update.id] : update.mergedContent
  }

  async function handleApprove(update: EnrichedUpdate) {
    if (!update.employee_id) {
      alert(t.assignEmpFirst)
      return
    }

    const sop = update.currentSop
    if (!sop) { alert(t.noSopFound); return }

    const finalContent = getFinalContent(update)
    const changeSummary = `Meeting update: ${update.source_meeting || 'external source'}`

    // Funnel through the snapshot helper so the version row gets the same
    // resolved_markdown / translation_status columns as edits made through
    // SOPEdit. Previously this path inserted only content_markdown, leaving
    // the snapshot bilingually empty even when ID got translated later.
    let result
    try {
      result = await writeSnapshot({
        table: 'sops',
        doc_id: sop.id,
        new_content_en: finalContent,
        change_summary: changeSummary,
        changed_by: user.id,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to apply update')
      return
    }

    await supabase.from('pending_updates').update({
      status: 'approved',
      reviewed_by: user.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', update.id)

    if (sop.employee_id) {
      await supabase.from('feed_events').insert({
        org_id: user.org_id,
        employee_id: sop.employee_id,
        event_type: 'sop_updated',
        title: sop.title,
        description: `Version ${result.version_number} — ${changeSummary}`,
        metadata: { sop_id: sop.id, version: result.version_number },
      })
    }

    loadData()
  }

  async function handleReject(update: PendingUpdate) {
    await supabase.from('pending_updates').update({
      status: 'rejected',
      reviewed_by: user.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', update.id)
    loadData()
  }

  async function handleAssign(updateId: string, employeeId: string) {
    await supabase.from('pending_updates').update({ employee_id: employeeId }).eq('id', updateId)
    loadData()
  }

  async function loadResolvedDiff(update: EnrichedUpdate) {
    if (resolvedDiffs[update.id]) return // Already loaded
    setLoadingDiff(update.id)

    try {
      const changes = (update.proposed_changes as ProposedChanges).changes || []
      const newContent = buildMergedContent(null, changes)

      // For approved items, find the version created by this update
      // For rejected items, show proposed vs current SOP
      let oldContent = ''

      if (update.employee_id) {
        const { data: sop } = await supabase
          .from('sops')
          .select('id, content_markdown')
          .eq('employee_id', update.employee_id)
          .single()

        if (sop) {
          if (update.status === 'approved') {
            // Find the version just before the approved change
            const { data: versions } = await supabase
              .from('sop_versions')
              .select('content_markdown, version_number')
              .eq('sop_id', sop.id)
              .order('version_number', { ascending: false })
              .limit(10)

            // Find the version created around the resolved_at time
            const resolvedTime = update.resolved_at ? new Date(update.resolved_at).getTime() : 0
            const { data: matchingVersions } = await supabase
              .from('sop_versions')
              .select('content_markdown, version_number, created_at')
              .eq('sop_id', sop.id)
              .order('version_number', { ascending: false })

            if (matchingVersions && matchingVersions.length >= 2) {
              // The most recent version matching the update is the "after"
              // The one before it is the "before"
              const afterIdx = matchingVersions.findIndex(v => {
                const vTime = new Date(v.created_at).getTime()
                return Math.abs(vTime - resolvedTime) < 60000 // within 1 minute
              })
              if (afterIdx >= 0 && afterIdx + 1 < matchingVersions.length) {
                oldContent = matchingVersions[afterIdx + 1].content_markdown
                setResolvedDiffs(prev => ({
                  ...prev,
                  [update.id]: {
                    oldContent,
                    newContent: matchingVersions[afterIdx].content_markdown,
                  },
                }))
                setLoadingDiff(null)
                return
              }
            }

            // Fallback: use second-to-last version as "before"
            if (versions && versions.length >= 2) {
              oldContent = versions[1].content_markdown
            }
          } else {
            // Rejected — show current SOP as "old", proposed as "new"
            oldContent = sop.content_markdown
          }
        }
      }

      setResolvedDiffs(prev => ({
        ...prev,
        [update.id]: { oldContent, newContent },
      }))
    } catch {
      setResolvedDiffs(prev => ({
        ...prev,
        [update.id]: { oldContent: '', newContent: '' },
      }))
    }
    setLoadingDiff(null)
  }

  function handleExpandResolved(update: EnrichedUpdate) {
    const isExpanding = expandedResolvedId !== update.id
    setExpandedResolvedId(isExpanding ? update.id : null)
    if (isExpanding) {
      loadResolvedDiff(update)
    }
  }

  // Filter and paginate resolved items
  const resolved = updates.filter(u => u.status !== 'pending')

  const filteredResolved = useMemo(() => {
    let items = resolved

    if (filterEmployee) {
      items = items.filter(u => u.employee_id === filterEmployee)
    }
    if (filterStatus) {
      items = items.filter(u => u.status === filterStatus)
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom).getTime()
      items = items.filter(u => new Date(u.created_at).getTime() >= from)
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo).getTime() + 86400000 // end of day
      items = items.filter(u => new Date(u.created_at).getTime() <= to)
    }

    return items
  }, [resolved, filterEmployee, filterStatus, filterDateFrom, filterDateTo])

  const totalPages = Math.max(1, Math.ceil(filteredResolved.length / pageSize))
  const paginatedResolved = filteredResolved.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [filterEmployee, filterStatus, filterDateFrom, filterDateTo, pageSize])

  async function handleCheckForUpdates() {
    setPolling(true)
    setPollResult(null)
    try {
      // Get an active API key for this org
      const { data: keys } = await supabase
        .from('api_keys')
        .select('key_hash')
        .eq('org_id', user.org_id)
        .limit(1)

      if (!keys?.length) {
        setPollResult(t.noApiKeyFound)
        setPolling(false)
        return
      }

      const res = await fetch(`${ROUTER_URL}/poll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys[0].key_hash}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json() as { status: string; found?: number; processed?: number }
      if (data.processed && data.processed > 0) {
        setPollResult(t.foundTranscripts(data.processed))
        // Reload after a delay to let processing complete
        setTimeout(() => { loadData(); setPollResult(null) }, 5000)
      } else {
        setPollResult(t.noNewTranscripts)
        setTimeout(() => setPollResult(null), 3000)
      }
    } catch (err) {
      setPollResult(t.failedToCheck)
      setTimeout(() => setPollResult(null), 3000)
    }
    setPolling(false)
  }

  // Filter and sort pending items (hooks must be before early returns)
  const allPending = updates.filter(u => u.status === 'pending')
  const pendingOnly = useMemo(() => {
    let items = allPending
    if (pendingFilterEmployee) {
      items = items.filter(u => u.employee_id === pendingFilterEmployee)
    }
    if (pendingSort === 'oldest') {
      items = [...items].reverse()
    }
    return items
  }, [allPending, pendingFilterEmployee, pendingSort])

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const statusColors: Record<string, string> = {
    pending: 'var(--color-warning)',
    approved: 'var(--color-success)',
    rejected: 'var(--color-danger)',
    auto_applied: 'var(--color-primary)',
  }

  const statusLabels: Record<string, string> = {
    approved: t.approvedLabel,
    rejected: t.rejectedLabel,
    auto_applied: t.autoAppliedLabel,
  }

  return (
    <div>
      {/* Pending Updates Section */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.pendingUpdatesTitle}</h2>
        <div className="flex items-center gap-3">
          {pollResult && (
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{pollResult}</span>
          )}
          <button
            onClick={handleCheckForUpdates}
            disabled={polling}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: polling ? 'var(--color-text-tertiary)' : 'var(--color-text)',
              backgroundColor: 'var(--color-bg-elevated)',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={polling ? 'animate-spin' : ''}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {polling ? t.checking : t.checkForUpdates}
          </button>
        </div>
      </div>

      {/* Pending filters — only show when there are items */}
      {allPending.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={pendingFilterEmployee}
            onChange={e => setPendingFilterEmployee(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          >
            <option value="">{t.allEmployeesOption}</option>
            {employees
              .filter(e => allPending.some(u => u.employee_id === e.id))
              .map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
          </select>

          <select
            value={pendingSort}
            onChange={e => setPendingSort(e.target.value as 'newest' | 'oldest')}
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
          >
            <option value="newest">{t.newestFirst}</option>
            <option value="oldest">{t.oldestFirst}</option>
          </select>

          {pendingFilterEmployee && (
            <button
              onClick={() => setPendingFilterEmployee('')}
              className="text-xs underline"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t.clearFilter}
            </button>
          )}

          <span className="ml-auto text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.itemCount(pendingOnly.length)}
          </span>
        </div>
      )}

      {pendingOnly.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {allPending.length === 0
            ? t.noPendingUpdates
            : t.noItemsMatchFilter}
        </p>
      ) : (
        <div className="space-y-3">
          {pendingOnly.map(update => {
            const summaries = getChangeSummaries(update)
            const isExpanded = expandedId === update.id
            return (
              <div
                key={update.id}
                className="rounded-xl border"
                style={{ borderColor: isExpanded ? 'var(--color-primary)' : 'var(--color-border)' }}
              >
                {/* Clickable header — always visible */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : update.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={update.employee?.name || '?'}
                      id={update.employee?.id || update.id}
                      photoUrl={update.employee?.photo_url}
                      size="md"
                    />
                    <div>
                      <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                        {update.employee ? t.defaultSopTitle(update.employee.name) : t.unmatchedEmployee}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        <span>{new Date(update.created_at).toLocaleString()}</span>
                        {update.source_meeting && (
                          <>
                            <span style={{ color: 'var(--color-border)' }}>|</span>
                            <span>{update.source_meeting}</span>
                          </>
                        )}
                      </div>
                      {summaries.length > 0 && !isExpanded && (
                        <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          {summaries[0]}{summaries.length > 1 && ` (+${summaries.length - 1} more)`}
                        </div>
                      )}
                    </div>
                  </div>

                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 transition-transform"
                    style={{
                      color: 'var(--color-text-tertiary)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'var(--color-border)' }}>
                    {/* Assign employee if unmatched */}
                    {!update.employee_id && (
                      <div className="mb-4">
                        <select
                          onChange={e => handleAssign(update.id, e.target.value)}
                          defaultValue=""
                          className="rounded-lg border px-2 py-1 text-xs"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                        >
                          <option value="" disabled>{t.assignEmployeePrompt}</option>
                          {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* AI summary of what changed */}
                    {summaries.length > 0 && (
                      <div className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {summaries.map((s, i) => (
                          <span key={i}>{i > 0 && ' · '}{s}</span>
                        ))}
                      </div>
                    )}

                    {/* Diff panel — shows what changed between current and proposed */}
                    <div className="mb-4">
                      <DiffPanel
                        oldContent={update.currentSop?.content_markdown || ''}
                        newContent={update.mergedContent}
                      />
                    </div>

                    {/* Full SOP editor — editable final version */}
                    <div className="mb-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.finalVersionEditable}
                    </div>
                    <div className="mb-4">
                      <SOPEditor
                        key={update.id}
                        content={getFinalContent(update)}
                        onChange={(val) => handleContentChange(update.id, val)}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(update)}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                        style={{ backgroundColor: 'var(--color-success)' }}
                      >
                        {t.approve}
                      </button>
                      <button
                        onClick={() => handleReject(update)}
                        className="rounded-lg px-4 py-2 text-sm font-medium"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        {t.reject}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.resolvedTitle}</h2>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{t.allEmployeesOption}</option>
              {employees
                .filter(e => resolved.some(u => u.employee_id === e.id))
                .map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
            </select>

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{t.allStatuses}</option>
              <option value="approved">{t.approvedLabel}</option>
              <option value="rejected">{t.rejectedLabel}</option>
              <option value="auto_applied">{t.autoAppliedLabel}</option>
            </select>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                placeholder={t.fromDate}
              />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.toDate}</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                placeholder={t.toDateLabel}
              />
            </div>

            {(filterEmployee || filterStatus || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterEmployee(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo('') }}
                className="text-xs underline"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t.clearFilters}
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.resultCount(filteredResolved.length)}
              </span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="rounded-lg border px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              >
                <option value={10}>{t.perPage(10)}</option>
                <option value={20}>{t.perPage(20)}</option>
                <option value={50}>{t.perPage(50)}</option>
              </select>
            </div>
          </div>

          {/* Resolved items list */}
          <div className="space-y-2">
            {paginatedResolved.map(update => {
              const summaries = getChangeSummaries(update)
              const isExpanded = expandedResolvedId === update.id
              const diffData = resolvedDiffs[update.id]

              return (
                <div
                  key={update.id}
                  className="rounded-xl border"
                  style={{ borderColor: isExpanded ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => handleExpandResolved(update)}
                    className="flex w-full items-center justify-between px-5 py-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={update.employee?.name || '?'}
                        id={update.employee?.id || update.id}
                        photoUrl={update.employee?.photo_url}
                        size="sm"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                            {update.employee?.name || update.employee_identifier}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {new Date(update.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {summaries.length > 0 && (
                          <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {summaries[0]}{summaries.length > 1 && ` (+${summaries.length - 1} more)`}
                          </div>
                        )}
                        {update.source_meeting && (
                          <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                            {update.source_meeting}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium" style={{ color: statusColors[update.status] }}>
                        {statusLabels[update.status] || update.status}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 transition-transform"
                        style={{
                          color: 'var(--color-text-tertiary)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'var(--color-border)' }}>
                      {/* Change summaries */}
                      {summaries.length > 0 && (
                        <div className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          {summaries.map((s, i) => (
                            <span key={i}>{i > 0 && ' · '}{s}</span>
                          ))}
                        </div>
                      )}

                      {/* Resolved metadata */}
                      {update.resolved_at && (
                        <div className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                          {update.status === 'approved' ? t.approvedOn : update.status === 'rejected' ? t.rejectedOn : t.resolvedOn}{' '}
                          {new Date(update.resolved_at).toLocaleString()}
                        </div>
                      )}

                      {/* Diff panel */}
                      {loadingDiff === update.id ? (
                        <div className="py-4 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                          {t.loadingDiff}
                        </div>
                      ) : diffData ? (
                        <DiffPanel
                          oldContent={diffData.oldContent}
                          newContent={diffData.newContent}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{
                  borderColor: 'var(--color-border)',
                  color: currentPage === 1 ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                  backgroundColor: 'var(--color-bg-elevated)',
                }}
              >
                {t.previous}
              </button>
              <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {t.pageOfPages(currentPage, totalPages)}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border px-3 py-1.5 text-xs"
                style={{
                  borderColor: 'var(--color-border)',
                  color: currentPage === totalPages ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                  backgroundColor: 'var(--color-bg-elevated)',
                }}
              >
                {t.next}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
