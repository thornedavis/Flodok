-- Owner-claim: the email-gated path that lets an HR/admin set a company up "on
-- behalf of" the real owner WITHOUT ever holding owner privilege themselves.
--
-- Model (see also 179 for the signup-trigger half):
--   1. On-behalf signup provisions the setup person as ADMIN of an OWNERLESS org
--      (179). They can fill in company info but are not the final authority.
--   2. The owner-claim edge function (service role) creates a row here with a
--      high-entropy single-use token and emails the OWNER a Supabase invite
--      link (auth.admin.inviteUserByEmail) whose redirect carries the token.
--      The token never passes through the admin's hands — a copy-paste link
--      would let them self-redeem, so delivery must be out-of-band email.
--   3. The invited owner accepts (sets a password, lands on /claim/<token>) and
--      redeem_owner_claim() promotes them member -> owner. That is the ONLY new
--      way to mint an owner; like transfer_ownership (094) it is a deliberate,
--      SECURITY DEFINER, narrowly-scoped path. Invites still forbid owner (089),
--      admin_update_user_role still forbids owner, self-update still pins role
--      (132) — none of those gates change.
--
-- Correcting a mistyped owner email = revoke + reissue (status 'revoked' is the
-- audit trail), handled by the edge function while the claim is still pending.

create table if not exists public.owner_claims (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  owner_name  text,
  owner_email text not null,
  token       text not null unique,
  status      text not null default 'pending'
                check (status in ('pending', 'claimed', 'revoked', 'expired')),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  claimed_at  timestamptz,
  claimed_by  uuid references public.users(id) on delete set null,
  -- The auth.users id created by inviteUserByEmail for owner_email. Lets the
  -- edge function delete the *unconfirmed* invited identity when a claim is
  -- revoked or its email corrected, so reissuing to an address isn't blocked by
  -- "user already exists". No FK (it points into the auth schema).
  invited_user_id uuid
);

-- At most one live claim per org (matches the "ownerless until claimed" state).
create unique index if not exists owner_claims_one_pending_per_org
  on public.owner_claims (org_id) where status = 'pending';

create index if not exists owner_claims_token_idx on public.owner_claims (token);

alter table public.owner_claims enable row level security;

-- Admins/owner of the org may READ their claim (drives the "owner not confirmed"
-- banner + the Settings row). All WRITES go through the owner-claim edge function
-- (service role, bypasses RLS) or redeem_owner_claim (SECURITY DEFINER) — there
-- is intentionally no authenticated insert/update/delete policy, so a member can
-- never repoint or fabricate a claim.
drop policy if exists "Admins view their org owner claim" on public.owner_claims;
create policy "Admins view their org owner claim"
  on public.owner_claims for select
  to authenticated
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

-- ── Anon-safe token lookup for the claim page ────────────────────────────────
-- Mirrors get_invite_by_token (163): resolves a single token to only what the
-- claim page needs (org name + the email it was sent to), never the org's other
-- claims and never the token of others. The table itself is not anon-readable.
create or replace function public.get_owner_claim_by_token(p_token text)
returns table (org_id uuid, org_name text, owner_email text)
language sql
security definer
stable
set search_path = public
as $$
  select c.org_id, o.name as org_name, c.owner_email
  from public.owner_claims c
  join public.organizations o on o.id = c.org_id
  where c.token = p_token
    and c.status = 'pending'
    and c.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_owner_claim_by_token(text) from public;
grant execute on function public.get_owner_claim_by_token(text) to anon, authenticated;

-- ── Redemption: promote the invited owner member -> owner ────────────────────
-- The sole new owner-mint. Defense in depth:
--   1. authenticated only; actor derived from auth.uid().
--   2. token must be a live, unexpired, pending claim.
--   3. the caller's email must equal owner_email — only the address the claim
--      was emailed to can redeem (the admin who issued it cannot, even if they
--      somehow obtained the token).
--   4. the org must still be ownerless — refuse if an owner already exists.
create or replace function public.redeem_owner_claim(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_email       text;
  v_claim       public.owner_claims%rowtype;
  v_owner_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select * into v_claim
  from public.owner_claims
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if v_claim.id is null then
    raise exception 'Owner claim not found or expired';
  end if;

  if lower(coalesce(v_email, '')) <> lower(v_claim.owner_email) then
    raise exception 'This claim was issued to a different email address';
  end if;

  select count(*) into v_owner_count
  from public.users
  where org_id = v_claim.org_id and role = 'owner';

  if v_owner_count <> 0 then
    raise exception 'This organisation already has an owner';
  end if;

  -- The signup trigger (179) places the invited owner as a member of the claim
  -- org. Promote them; if that row is somehow missing, create it as owner.
  if exists (select 1 from public.users where id = v_uid) then
    update public.users
      set role = 'owner', org_id = v_claim.org_id
      where id = v_uid;
  else
    insert into public.users (id, org_id, email, name, role)
    values (v_uid, v_claim.org_id, v_email,
            coalesce(nullif(btrim(v_claim.owner_name), ''), split_part(v_email, '@', 1)),
            'owner');
  end if;

  update public.owner_claims
    set status = 'claimed', claimed_at = now(), claimed_by = v_uid
    where id = v_claim.id;

  return v_claim.org_id;
end;
$$;

revoke all on function public.redeem_owner_claim(text) from public, anon;
grant execute on function public.redeem_owner_claim(text) to authenticated;
