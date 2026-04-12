import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { User } from '../../types/database'

interface Stats {
  employeeCount: number
  activeSOPs: number
  pendingSignatures: number
  pendingUpdates: number
}

export function Overview({ user }: { user: User }) {
  const [stats, setStats] = useState<Stats>({ employeeCount: 0, activeSOPs: 0, pendingSignatures: 0, pendingUpdates: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [employees, sops, pending] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact', head: true }).eq('org_id', user.org_id),
        supabase.from('sops').select('id, current_version, employee_id').eq('org_id', user.org_id).eq('status', 'active'),
        supabase.from('pending_updates').select('id', { count: 'exact', head: true }).eq('org_id', user.org_id).eq('status', 'pending'),
      ])

      let pendingSignatures = 0
      if (sops.data && sops.data.length > 0) {
        // For each active SOP, check if the employee has signed the current version
        const { data: signatures } = await supabase.from('sop_signatures').select('sop_id, version_number')
        const signedSet = new Set((signatures || []).map(s => `${s.sop_id}-${s.version_number}`))
        pendingSignatures = sops.data.filter(s => !signedSet.has(`${s.id}-${s.current_version}`)).length
      }

      setStats({
        employeeCount: employees.count || 0,
        activeSOPs: sops.data?.length || 0,
        pendingSignatures,
        pendingUpdates: pending.count || 0,
      })
      setLoading(false)
    }
    load()
  }, [user.org_id])

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const cards = [
    { label: 'Employees', value: stats.employeeCount, link: '/dashboard/employees' },
    { label: 'Active SOPs', value: stats.activeSOPs, link: '/dashboard/sops' },
    { label: 'Awaiting Signature', value: stats.pendingSignatures, link: '/dashboard/sops' },
    { label: 'Pending Updates', value: stats.pendingUpdates, link: '/dashboard/pending' },
  ]

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map(card => (
          <Link
            key={card.label}
            to={card.link}
            className="rounded-xl border p-5 transition-colors hover:border-[var(--color-border-strong)]"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{card.label}</div>
            <div className="mt-1 text-3xl font-semibold" style={{ color: 'var(--color-text)' }}>{card.value}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
