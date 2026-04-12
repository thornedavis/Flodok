import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User, PendingUpdate, Employee } from '../../types/database'

export function Pending({ user }: { user: User }) {
  const [updates, setUpdates] = useState<(PendingUpdate & { employee?: Employee | null })[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [updatesResult, empResult] = await Promise.all([
      supabase.from('pending_updates').select('*').eq('org_id', user.org_id).order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
    ])

    const empMap = new Map((empResult.data || []).map(e => [e.id, e]))
    setEmployees(empResult.data || [])
    setUpdates((updatesResult.data || []).map(u => ({
      ...u,
      employee: u.employee_id ? empMap.get(u.employee_id) : null,
    })))
    setLoading(false)
  }

  async function handleApprove(update: PendingUpdate) {
    if (!update.employee_id) {
      alert('Assign an employee first before approving.')
      return
    }

    // Get the employee's SOP
    const { data: sop } = await supabase
      .from('sops')
      .select('*')
      .eq('employee_id', update.employee_id)
      .single()

    if (!sop) { alert('No SOP found for this employee.'); return }

    const changes = update.proposed_changes as { changes?: Array<{ content_markdown?: string; section?: string; summary?: string }> }
    const newContent = changes.changes
      ?.map(c => `## ${c.section || 'Update'}\n\n${c.content_markdown || c.summary || ''}`)
      .join('\n\n')

    const mergedContent = sop.content_markdown
      ? `${sop.content_markdown}\n\n${newContent}`
      : newContent || ''

    const newVersion = sop.current_version + 1

    await Promise.all([
      supabase.from('sops').update({
        content_markdown: mergedContent,
        current_version: newVersion,
        updated_at: new Date().toISOString(),
      }).eq('id', sop.id),
      supabase.from('sop_versions').insert({
        sop_id: sop.id,
        version_number: newVersion,
        content_markdown: mergedContent,
        change_summary: `API update from ${update.source_meeting || 'external source'}`,
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
        <div className="space-y-4">
          {pendingOnly.map(update => (
            <div
              key={update.id}
              className="rounded-xl border p-5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {update.employee?.name || 'Unmatched employee'}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    Identifier: {update.employee_identifier}
                    {update.source_meeting && ` — ${update.source_meeting}`}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(update.created_at).toLocaleString()}
                  </div>
                </div>

                {!update.employee_id && (
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
                )}
              </div>

              <pre
                className="mb-4 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"
                style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
              >
                {JSON.stringify(update.proposed_changes, null, 2)}
              </pre>

              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(update)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--color-success)' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(update)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Resolved</h2>
          <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            {resolved.map(update => (
              <div key={update.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                    {update.employee_identifier}
                  </span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(update.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-xs font-medium" style={{ color: statusColors[update.status] }}>
                  {update.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
