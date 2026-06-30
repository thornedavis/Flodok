// Team-member invites that actually email. Creates the org_invitations row and
// sends Supabase's "Invite user" email (via the project's SMTP + template),
// whose redirect carries the invite token to /invite/<token>. Mirrors the
// owner-claim edge function. The invite path in handle_new_user / handle_signup
// (migration 185) is email-bound, so only the invited address can take the
// seat. The invitee accepts by setting a password on the /invite page (the
// account already exists from inviteUserByEmail).
//
// Auth: caller must be an authenticated owner/admin of the org.
// Action (POST { action: 'create', email, role }): issue + email an invite.

import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'
import { generateKeyB64 } from '../_shared/crypto.ts'

type Admin = ReturnType<typeof getSupabaseAdmin>

const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '')
const ROLES = ['admin', 'hr', 'member']

async function authenticateUser(
  req: Request,
  admin: Admin,
): Promise<{ user_id: string; org_id: string; role: string } | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: row } = await admin.from('users').select('id, org_id, role').eq('id', data.user.id).single()
  if (!row) return null
  return { user_id: row.id, org_id: row.org_id, role: row.role }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    if (!APP_BASE_URL) return jsonResponse({ error: 'Server misconfigured: APP_BASE_URL is not set.' }, 500)

    const admin = getSupabaseAdmin()
    const user = await authenticateUser(req, admin)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
    if (user.role !== 'owner' && user.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({})) as { action?: string; email?: string; role?: string }
    if ((body.action ?? 'create') !== 'create') return jsonResponse({ error: 'Unknown action' }, 400)

    const email = (body.email ?? '').trim().toLowerCase()
    const role = body.role ?? 'member'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'A valid email is required.' }, 400)
    if (!ROLES.includes(role)) return jsonResponse({ error: 'Invalid role.' }, 400)

    // Don't double-invite a still-pending address.
    const { data: pending } = await admin
      .from('org_invitations')
      .select('id')
      .eq('org_id', user.org_id)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle()
    if (pending) return jsonResponse({ error: 'That email already has a pending invite.' }, 409)

    // Insert the invite BEFORE emailing, so the signup trigger (fired
    // synchronously by inviteUserByEmail) can resolve the token to this org.
    const token = generateKeyB64()
    const { data: invite, error: insErr } = await admin
      .from('org_invitations')
      .insert({ org_id: user.org_id, email, token, role, invited_by: user.user_id })
      .select()
      .single()
    if (insErr || !invite) return jsonResponse({ error: insErr?.message ?? 'Could not create invite' }, 400)

    // Send Supabase's "Invite user" email through the project SMTP + template.
    const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invite_token: token },
      redirectTo: `${APP_BASE_URL}/invite/${token}`,
    })
    if (sendErr) {
      // Roll the invite back so a failed send leaves no phantom pending row.
      await admin.from('org_invitations').update({ status: 'revoked' }).eq('id', invite.id)
      const msg = /already|registered|exist/i.test(sendErr.message)
        ? 'That email already has a Flodok account. Ask them to sign in, or use a different address.'
        : sendErr.message
      return jsonResponse({ error: msg }, 400)
    }

    return jsonResponse({ ok: true, invite, link: `${APP_BASE_URL}/invite/${token}` })
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500)
  }
})
