import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { User, Sop, Employee } from '../../types/database'

export function SOPs({ user }: { user: User }) {
  const [sops, setSOPs] = useState<(Sop & { employee: Employee | null })[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [sopResult, empResult] = await Promise.all([
        supabase.from('sops').select('*').eq('org_id', user.org_id).order('updated_at', { ascending: false }),
        supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
      ])

      const empMap = new Map((empResult.data || []).map(e => [e.id, e]))
      setEmployees(empResult.data || [])
      setSOPs((sopResult.data || []).map(s => ({ ...s, employee: empMap.get(s.employee_id) || null })))
      setLoading(false)
    }
    load()
  }, [user.org_id])

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const filtered = filter
    ? sops.filter(s => s.employee_id === filter)
    : sops

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>SOPs</h1>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <option value="">All employees</option>
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          No SOPs found. Add employees to get started.
        </p>
      ) : (
        <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
          {filtered.map(sop => (
            <div key={sop.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <Link
                  to={`/dashboard/sops/${sop.id}/edit`}
                  className="font-medium hover:underline"
                  style={{ color: 'var(--color-text)' }}
                >
                  {sop.title}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {sop.employee && <span>{sop.employee.name}</span>}
                  <span>&middot;</span>
                  <span style={{ color: statusColors[sop.status] }}>{sop.status}</span>
                  <span>&middot;</span>
                  <span>v{sop.current_version}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/dashboard/sops/${sop.id}/history`}
                  className="rounded-md px-2.5 py-1 text-xs border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  History
                </Link>
                <Link
                  to={`/dashboard/sops/${sop.id}/edit`}
                  className="rounded-md px-2.5 py-1 text-xs border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
