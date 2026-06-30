// Client for the owner-claim Edge Function (supabase/functions/owner-claim).
// Used by the onboarding welcome step (on-behalf setup) and the "owner not
// confirmed" banner. All real work + the inviteUserByEmail send happen
// server-side under the service role; this just forwards the authed action.

import { supabase } from './supabase'

export type OwnerClaimBody =
  | { action: 'create' | 'change-email'; owner_email: string; owner_name?: string | null }
  | { action: 'resend' }
  | { action: 'revoke' }

export async function ownerClaim(body: OwnerClaimBody): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/owner-claim`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
}
