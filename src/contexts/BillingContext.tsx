// Dashboard-wide billing state: provides one fetch of the org's billing
// row + computed dunning state, so any dashboard component can call
// useBilling() to gate writes or read the plan tier without a duplicate
// network request. Mounted by DashboardLayout once per session.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  loadOrgBilling,
  dunningState as computeDunningState,
  canWrite as computeCanWrite,
  visibleItemLimit as computeVisibleItemLimit,
  type DunningState,
  type OrgBilling,
} from '../lib/billing'

interface BillingContextValue {
  billing: OrgBilling | null
  loading: boolean
  state: DunningState
  canWrite: boolean
  visibleItemLimit: number | null
  refresh: () => Promise<void>
}

const BillingContext = createContext<BillingContextValue | null>(null)

export function BillingProvider({ orgId, children }: { orgId: string; children: React.ReactNode }) {
  const [billing, setBilling] = useState<OrgBilling | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const b = await loadOrgBilling(orgId)
      setBilling(b)
    } catch (e) {
      console.error('BillingContext: loadOrgBilling failed:', e)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { refresh() }, [refresh])

  const value = useMemo<BillingContextValue>(() => {
    const state = computeDunningState(billing)
    return {
      billing,
      loading,
      state,
      canWrite: computeCanWrite(state),
      visibleItemLimit: computeVisibleItemLimit(state, billing?.plan_tier ?? 'free'),
      refresh,
    }
  }, [billing, loading, refresh])

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext)
  if (!ctx) {
    // Components outside DashboardLayout (public pages, employee portal) call
    // this — return a permissive default so callers don't crash.
    return {
      billing: null,
      loading: false,
      state: 'free_legitimate',
      canWrite: true,
      visibleItemLimit: null,
      refresh: async () => {},
    }
  }
  return ctx
}
