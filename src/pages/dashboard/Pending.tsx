import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { SOPEditor } from '../../components/Editor'
import { Avatar } from '../../components/Avatar'
import { DiffPanel } from '../../components/DiffPanel'
import type { User, PendingUpdate, Employee, Sop } from '../../types/database'

type Change = { section?: string; summary?: string; content_markdown?: string; change_type?: string }
type ProposedChanges = { changes?: Change[] }

type EnrichedUpdate = PendingUpdate & {
  employee?: Employee | null
  currentSop?: Sop | null
  mergedContent: string
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

export function Pending({ user }: { user: User }) {
  const [updates, setUpdates] = useState<EnrichedUpdate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Track edited full-SOP content per update ID
  const [editedContent, setEditedContent] = useState<Record<string, string>>({})

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

      sopMap = new Map((sops || []).map(s => [s.employee_id, s]))
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
      alert('Assign an employee first before approving.')
      return
    }

    const sop = update.currentSop
    if (!sop) { alert('No SOP found for this employee.'); return }

    const finalContent = getFinalContent(update)
    const newVersion = sop.current_version + 1

    await Promise.all([
      supabase.from('sops').update({
        content_markdown: finalContent,
        current_version: newVersion,
        updated_at: new Date().toISOString(),
      }).eq('id', sop.id),
      supabase.from('sop_versions').insert({
        sop_id: sop.id,
        version_number: newVersion,
        content_markdown: finalContent,
        change_summary: `Meeting update: ${update.source_meeting || 'external source'}`,
        changed_by: 'api',
      }),
      supabase.from('pending_updates').update({
        status: 'approved',
        reviewed_by: user.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', update.id),
    ])

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

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const pendingOnly = updates.filter(u => u.status === 'pending')
  const resolved = updates.filter(u => u.status !== 'pending')

  const statusColors: Record<string, string> = {
    pending: 'var(--color-warning)',
    approved: 'var(--color-success)',
    rejected: 'var(--color-danger)',
    auto_applied: 'var(--color-primary)',
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Pending Updates</h1>

      {pendingOnly.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          No pending updates. Updates from the API will appear here.
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
                        {update.employee ? `${update.employee.name}'s SOP` : 'Unmatched employee'}
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
                          <option value="" disabled>Assign employee...</option>
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
                      Final version (editable)
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
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(update)}
                        className="rounded-lg px-4 py-2 text-sm font-medium"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        Reject
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
          <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Resolved</h2>
          <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            {resolved.map(update => {
              const summaries = getChangeSummaries(update)
              return (
                <div key={update.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={update.employee?.name || '?'}
                      id={update.employee?.id || update.id}
                      photoUrl={update.employee?.photo_url}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ color: 'var(--color-text)' }}>
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
                    </div>
                  </div>
                  <span className="text-xs font-medium" style={{ color: statusColors[update.status] }}>
                    {update.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
