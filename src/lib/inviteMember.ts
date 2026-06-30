// Client for the invite-member Edge Function. Creates a team invite AND emails
// it (Supabase "Invite user" template), returning the invite row + the shareable
// /invite/<token> link so the UI can show it as a fallback alongside the email.

import { supabase } from './supabase'
import type { OrgInvitation } from '../types/aliases'

export async function inviteMember(
  args: { email: string; role: 'admin' | 'hr' | 'member' },
): Promise<{ invite: OrgInvitation; link: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'create', email: args.email, role: args.role }),
  })

  const json = (await res.json().catch(() => ({}))) as { invite?: OrgInvitation; link?: string; error?: string }
  if (!res.ok || !json.invite || !json.link) {
    throw new Error(json.error || `Request failed (${res.status})`)
  }
  return { invite: json.invite, link: json.link }
}
