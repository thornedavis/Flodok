// Loads the data for client-side inbox derivation. Used by both the
// /dashboard/inbox page and the topbar NotificationBell so they stay
// perfectly in sync. Refetched on `refreshKey` change.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { WORKFORCE_STAGES } from '../lib/lifecycle'
import { deriveInboxItems } from '../lib/inbox'
import type { InboxItem } from '../lib/inbox'

export function useInboxItems(orgId: string, userId: string, refreshKey = 0) {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [c, s, e, pu, ptk, cs, ss, d, f, ur, sc] = await Promise.all([
        supabase.from('contracts').select('*').eq('org_id', orgId),
        supabase.from('sops').select('*').eq('org_id', orgId),
        supabase.from('employees').select('*').eq('org_id', orgId).in('lifecycle_stage', [...WORKFORCE_STAGES]),
        supabase.from('pending_updates').select('*').eq('org_id', orgId).eq('status', 'pending'),
        supabase.from('pending_tasks').select('*').eq('org_id', orgId).eq('status', 'pending'),
        supabase.from('contract_signatures').select('*'),
        supabase.from('sop_signatures').select('*'),
        supabase.from('inbox_dismissals').select('*').eq('user_id', userId),
        supabase.from('form_submissions').select('*').eq('org_id', orgId),
        supabase.from('users').select('role').eq('id', userId).single(),
        supabase.from('employees').select('*').eq('org_id', orgId).eq('lifecycle_stage', 'signed'),
      ])
      if (cancelled) return
      setItems(deriveInboxItems({
        contracts: c.data || [],
        sops: s.data || [],
        employees: e.data || [],
        pendingUpdates: pu.data || [],
        pendingTasks: ptk.data || [],
        contractSignatures: cs.data || [],
        sopSignatures: ss.data || [],
        dismissals: d.data || [],
        forms: f.data || [],
        signedCandidates: sc.data || [],
        viewerUserId: userId,
        viewerIsOwner: ur.data?.role === 'owner',
      }))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [orgId, userId, refreshKey])

  return { items, loading }
}
