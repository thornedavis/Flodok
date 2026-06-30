// Owner-claim management — issues and corrects the email-gated owner claim that
// lets an on-behalf admin hand the owner role to the real owner without ever
// holding it themselves. See migrations 178 (table + redemption) and 179
// (signup trigger). All writes happen here under the service role; the client
// only reads the claim (RLS) and calls these actions.
//
// Auth: the caller must be an authenticated owner/admin of an OWNERLESS org.
// Transport: Supabase Auth `inviteUserByEmail` (custom SMTP) sends the owner a
// branded invite whose redirect carries the single-use token to /claim/<token>.
// The token never reaches the admin — a copy-link would let them self-redeem.
//
// Actions (POST { action, ... }):
//   create        { owner_email, owner_name? }  — issue the first claim
//   change-email  { owner_email, owner_name? }  — revoke + reissue to a new address
//   resend        {}                            — re-send the current pending claim
//   revoke        {}                            — cancel the pending claim

import { corsHeaders, jsonResponse, getSupabaseAdmin } from '../_shared/auth.ts'
import { generateKeyB64 } from '../_shared/crypto.ts'

type Admin = ReturnType<typeof getSupabaseAdmin>

// Required secret: the deployed app origin the owner's invite link redirects to
// (e.g. https://app.flodok.com). No fallback — a wrong/missing value silently
// sends owners to the wrong origin, so we fail loudly instead.
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '')

async function authenticateUser(
  req: Request,
  admin: Admin,
): Promise<{ user_id: string; org_id: string; role: string } | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null

  const { data: row } = await admin
    .from('users')
    .select('id, org_id, role')
    .eq('id', data.user.id)
    .single()

  if (!row) return null
  return { user_id: row.id, org_id: row.org_id, role: row.role }
}

// Send (or re-send) the owner invite. The signup trigger reads claim_token from
// metadata and joins the invited identity to the claim org as a holding member.
// Returns the invited auth user id, which MUST be recorded on the claim so the
// unconfirmed identity can be cleaned up on revoke/reissue.
async function sendClaimInvite(
  admin: Admin,
  ownerEmail: string,
  ownerName: string | null,
  token: string,
): Promise<{ ok: true; invitedUserId: string } | { ok: false; error: string }> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { claim_token: token, name: ownerName ?? undefined, setup_mode: 'owner_claim' },
    redirectTo: `${APP_BASE_URL}/claim/${token}`,
  })
  if (error) {
    const msg = /already|registered|exist/i.test(error.message)
      ? 'That email already has a Flodok account. Use a different address for the owner, or contact support.'
      : error.message
    return { ok: false, error: msg }
  }
  // Without the invited id we cannot clean up the identity later, which would
  // block reissues to that address — treat a missing id as a hard failure.
  if (!data.user?.id) {
    return { ok: false, error: 'Could not create the owner invitation identity. Please try again.' }
  }
  return { ok: true, invitedUserId: data.user.id }
}

// Cancel every pending claim for the org and best-effort delete the unconfirmed
// invited identity so a reissue to that (or another) address isn't blocked. A
// failed delete is logged but never blocks revocation — the worst case is that
// reissuing to the SAME email surfaces a clear "already has an account" error.
async function revokePending(admin: Admin, orgId: string): Promise<void> {
  const { data: pending } = await admin
    .from('owner_claims')
    .select('id, invited_user_id')
    .eq('org_id', orgId)
    .eq('status', 'pending')

  for (const claim of pending ?? []) {
    if (claim.invited_user_id) {
      // Only delete if the invitee never accepted (no confirmed email and never
      // signed in). Deleting an accepted account would destroy a real login.
      const { data: invited } = await admin.auth.admin.getUserById(claim.invited_user_id)
      const u = invited?.user
      const accepted = !!(u?.email_confirmed_at || u?.last_sign_in_at)
      if (u && !accepted) {
        const { error: delErr } = await admin.auth.admin.deleteUser(claim.invited_user_id)
        if (delErr) console.warn(`owner-claim: failed to delete invited user ${claim.invited_user_id}: ${delErr.message}`)
      }
    } else {
      console.warn(`owner-claim: pending claim ${claim.id} has no invited_user_id; orphan identity may linger`)
    }

    await admin.from('owner_claims').update({ status: 'revoked' }).eq('id', claim.id)
  }
}

// Issue a fresh pending claim and email the owner. Used by create, change-email,
// and resend. Atomic in effect: any failure after the insert rolls the claim
// back, so the one-pending-per-org slot is never left occupied by a dead row.
async function issueClaim(
  admin: Admin,
  orgId: string,
  createdBy: string,
  ownerEmail: string,
  ownerName: string | null,
): Promise<Response> {
  // Reissue is revoke-then-create; revokePending also frees the email by
  // deleting any prior unconfirmed invited identity.
  await revokePending(admin, orgId)

  // Insert the pending claim BEFORE inviting, so the signup trigger (fired
  // synchronously by inviteUserByEmail) can resolve the token to this org.
  const token = generateKeyB64() // 32-byte (256-bit) URL-safe single-use token
  const { data: claim, error: insErr } = await admin
    .from('owner_claims')
    .insert({ org_id: orgId, owner_name: ownerName, owner_email: ownerEmail, token, created_by: createdBy })
    .select('id')
    .single()
  if (insErr || !claim) {
    // 23505 = the one-pending-per-org partial unique index: a concurrent
    // create/redeem won the race. Surface a clean retry, not a raw 500.
    if (insErr?.code === '23505') {
      return jsonResponse({ error: 'A claim is already in progress for this organisation. Please refresh and try again.' }, 409)
    }
    return jsonResponse({ error: insErr?.message ?? 'Could not create claim' }, 400)
  }

  const sent = await sendClaimInvite(admin, ownerEmail, ownerName, token)
  if (!sent.ok) {
    await admin.from('owner_claims').update({ status: 'revoked' }).eq('id', claim.id)
    return jsonResponse({ error: sent.error }, 400)
  }

  const { error: backfillErr } = await admin
    .from('owner_claims')
    .update({ invited_user_id: sent.invitedUserId })
    .eq('id', claim.id)
  if (backfillErr) {
    await admin.auth.admin.deleteUser(sent.invitedUserId).catch(() => {})
    await admin.from('owner_claims').update({ status: 'revoked' }).eq('id', claim.id)
    return jsonResponse({ error: 'Could not finalise the invitation. Please try again.' }, 500)
  }

  return jsonResponse({ ok: true, claim_id: claim.id })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    if (!APP_BASE_URL) {
      return jsonResponse({ error: 'Server misconfigured: APP_BASE_URL is not set.' }, 500)
    }

    const admin = getSupabaseAdmin()

    const user = await authenticateUser(req, admin)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
    if (user.role !== 'owner' && user.role !== 'admin') {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    // An owner claim only exists while the org is ownerless. If an owner already
    // exists, there is nothing to issue or correct.
    const { count: ownerCount } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', user.org_id)
      .eq('role', 'owner')
    if ((ownerCount ?? 0) > 0) {
      return jsonResponse({ error: 'This organisation already has an owner.' }, 409)
    }

    const body = await req.json().catch(() => ({})) as {
      action?: string
      owner_email?: string
      owner_name?: string
    }
    const action = body.action

    if (action === 'create' || action === 'change-email') {
      const ownerEmail = (body.owner_email ?? '').trim().toLowerCase()
      const ownerName = (body.owner_name ?? '').trim() || null
      if (!ownerEmail || !ownerEmail.includes('@')) {
        return jsonResponse({ error: 'A valid owner email is required.' }, 400)
      }
      return await issueClaim(admin, user.org_id, user.user_id, ownerEmail, ownerName)
    }

    // Resend = reissue to the same address with a fresh token. We can't re-send
    // via inviteUserByEmail (the prior unconfirmed identity still exists), so
    // issueClaim revokes it (deleting that identity, freeing the email) and
    // sends a clean new invite — the old link is intentionally invalidated.
    if (action === 'resend') {
      const { data: claim } = await admin
        .from('owner_claims')
        .select('owner_email, owner_name')
        .eq('org_id', user.org_id)
        .eq('status', 'pending')
        .maybeSingle()
      if (!claim) return jsonResponse({ error: 'No pending owner claim to resend.' }, 404)
      return await issueClaim(admin, user.org_id, user.user_id, claim.owner_email, claim.owner_name)
    }

    if (action === 'revoke') {
      await revokePending(admin, user.org_id)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500)
  }
})
