-- Pre-onboarding security hardening — bundle of independently-revertable blocks.
-- (H2's "revoke INSERT on users" is intentionally NOT here; it lives in a later
--  migration that must apply AFTER the signup trigger in 164.)
--
--   H1  org_invitations anon token leak  -> token lookup via a scoped RPC
--   H3  vestigial anon SOP read policies  -> dropped
--   H5  authenticated employee-signature forgery branch  -> removed
--   M4  contract pay components readable/writable by any member  -> admin-gated

-- ── H1: stop the cross-org invite-token leak ─────────────────────────────────
-- "Anyone can read invite by token" (015) filtered only by status/expiry, not by
-- token or org, so a raw anon select returned EVERY org's pending invites
-- (token, email, role, org_id). Replace it with a SECURITY DEFINER RPC that
-- resolves a single token to only the fields the accept page needs (never role).

drop policy if exists "Anyone can read invite by token" on public.org_invitations;

create or replace function public.get_invite_by_token(p_token text)
returns table (org_id uuid, org_name text, email text)
language sql
security definer
stable
set search_path = public
as $$
  select i.org_id, o.name as org_name, i.email
  from public.org_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_invite_by_token(text) from public;
grant execute on function public.get_invite_by_token(text) to anon, authenticated;

-- Defense-in-depth: the table itself no longer needs to be anon-readable now
-- that the only anon entry point is the scoped RPC above.
revoke select on public.org_invitations from anon;

-- ── H3: drop the vestigial anon SOP read policies ────────────────────────────
-- 141 locked down the portal but missed these three; the portal now reads SOPs
-- via the portal_documents / portal_document_versions SECURITY DEFINER RPCs, so
-- these are pure leftover cross-tenant read surface (anyone with the anon key
-- could read every org's active SOP content + version history + audience).

drop policy if exists "Public can view active SOPs"            on public.sops;
drop policy if exists "Public can view versions of active SOPs" on public.sop_versions;
drop policy if exists "Public can view audience of active SOPs" on public.sop_audience;

revoke select on public.sops, public.sop_versions, public.sop_audience from anon;

-- ── H5: remove the employee-signature forgery branch ─────────────────────────
-- Post-141 the ONLY sanctioned employee-signing path is the portal_sign_*
-- SECURITY DEFINER RPCs (which validate slug+token and that the doc is addressed
-- to that employee). The surviving authenticated INSERT policies still let ANY
-- org member insert a row with signer_role='employee' for ANY employee_id —
-- forging a legally-binding employee signature. Keep only the employer branch.

drop policy if exists "Authenticated can insert contract signatures" on public.contract_signatures;
create policy "Authenticated can insert contract signatures"
  on public.contract_signatures for insert
  to authenticated
  with check (
    signer_role = 'employer'
    and signer_user_id = auth.uid()
    and contract_id in (select id from public.contracts where org_id = public.get_user_org_id())
  );

drop policy if exists "Authenticated can insert nda signatures" on public.nda_signatures;
create policy "Authenticated can insert nda signatures"
  on public.nda_signatures for insert
  to authenticated
  with check (
    signer_role = 'employer'
    and signer_user_id = auth.uid()
    and nda_id in (select id from public.ndas where org_id = public.get_user_org_id())
  );

-- ── M4: gate itemized pay components to owner/admin/hr ───────────────────────
-- The single FOR ALL policy (155) scoped only by org, so any 'member' could
-- read every colleague's salary breakdown AND rewrite components (which sync
-- into contracts.allowance_idr via the 156 trigger and into payroll). Restrict
-- both read and write to the roles that own the employee/contract lifecycle.

drop policy if exists "Members manage their org contract components" on public.contract_compensation_components;
create policy "Admins manage their org contract components"
  on public.contract_compensation_components
  for all
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
  )
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
  );
