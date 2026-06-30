-- H1: bind invite acceptance to the invited email address.
--
-- Before this, both the signup trigger (handle_new_user) and the idempotent
-- recovery primitive (handle_signup) in migration 179 accepted an org invitation
-- on a valid TOKEN alone — they never checked that the signing-up identity's
-- email matched the address the invitation was issued to. That made an invite a
-- pure bearer credential: a leaked or forwarded invite link (and invites can be
-- created at role='admin' / 'hr') let an arbitrary email claim that seat and
-- take over the tenant org.
--
-- The fix mirrors the email binding already enforced for owner-claims in
-- redeem_owner_claim (178:124): an invitation is honoured only when
--   lower(<authenticated identity email>) = lower(org_invitations.email).
-- A token whose email does not match is treated like an invalid/expired invite
-- and falls through to the normal new-org path, so the user is never orphaned —
-- a wrong-email invite simply becomes an ordinary new-org signup instead of a
-- silent cross-account org grant.
--
-- IMPORTANT: in handle_signup the binding compares against the email on
-- auth.users for the authenticated uid (the trusted identity), NOT the
-- client-supplied `user_email` argument — otherwise the guard would itself be
-- bypassable by passing a spoofed parameter. The trigger already keys off
-- new.email (the row being inserted into auth.users), which is trustworthy.
--
-- Only the invite branch changes; the owner-claim and new-org branches, the
-- function signatures, search_path, security context, and grants are unchanged.

-- 1. Trigger: provision atomically with the identity --------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name         text := coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''),
                                   split_part(new.email, '@', 1));
  v_org_name     text := nullif(btrim(new.raw_user_meta_data->>'org_name'), '');
  v_invite_token text := nullif(new.raw_user_meta_data->>'invite_token', '');
  v_claim_token  text := nullif(new.raw_user_meta_data->>'claim_token', '');
  v_setup_mode   text := nullif(new.raw_user_meta_data->>'setup_mode', '');
  v_invite_rec   public.org_invitations%rowtype;
  v_claim_rec    public.owner_claims%rowtype;
  v_org_id       uuid;
begin
  -- Idempotent: never double-provision.
  if exists (select 1 from public.users where id = new.id) then
    return new;
  end if;

  -- Invite path: join the inviting org at the invited role — but ONLY when the
  -- signing-up identity's email matches the address the invite was issued to.
  -- Without this binding an invite is a bearer token: a leaked/forwarded link
  -- would let an arbitrary email take the encoded (admin/hr) seat. Mirrors the
  -- email binding in redeem_owner_claim (178).
  if v_invite_token is not null then
    select * into v_invite_rec
    from public.org_invitations
    where token = v_invite_token
      and status = 'pending'
      and expires_at > now();

    if v_invite_rec.id is not null
       and lower(coalesce(new.email, '')) = lower(v_invite_rec.email) then
      insert into public.users (id, org_id, email, name, role)
      values (new.id, v_invite_rec.org_id, new.email, v_name, coalesce(v_invite_rec.role, 'member'))
      on conflict (id) do nothing;

      update public.org_invitations
        set status = 'accepted', accepted_at = now(), accepted_by = new.id
        where id = v_invite_rec.id;

      return new;
    end if;
    -- Invalid / expired / email-mismatched invite: fall through to new-org so
    -- the user is never orphaned (a wrong-email invite becomes a normal new-org
    -- signup rather than a silent cross-account org grant).
  end if;

  -- Owner-claim path: the invited owner joins the EXISTING org as a holding
  -- member. They are promoted to owner only by redeem_owner_claim (178) once
  -- they actively accept — never at email-send time.
  if v_claim_token is not null then
    select * into v_claim_rec
    from public.owner_claims
    where token = v_claim_token
      and status = 'pending'
      and expires_at > now();

    if v_claim_rec.id is not null then
      insert into public.users (id, org_id, email, name, role)
      values (new.id, v_claim_rec.org_id, new.email, v_name, 'member')
      on conflict (id) do nothing;
      return new;
    end if;
    -- Invalid/expired claim: do NOT fall through to new-org (that would create a
    -- junk org and make the invited identity its owner). Leave unprovisioned;
    -- the self-heal path recovers a legitimate user.
    raise warning 'handle_new_user: claim_token not valid for %', new.id;
    return new;
  end if;

  -- New-org path (also the fallback for a bad/expired/email-mismatched invite).
  -- On-behalf setup -> admin of an ownerless org; otherwise -> owner.
  insert into public.organizations (name)
    values (coalesce(v_org_name, v_name || '''s organization'))
    returning id into v_org_id;

  insert into public.users (id, org_id, email, name, role)
    values (new.id, v_org_id, new.email, v_name,
            case when v_setup_mode = 'on_behalf' then 'admin' else 'owner' end)
    on conflict (id) do nothing;

  return new;
exception when others then
  -- NEVER block the auth.users insert: a provisioning failure must not abort the
  -- identity. The client self-heal (handle_signup via App.tsx) recovers it on
  -- next login. The subtransaction rollback here also undoes any half-written
  -- organizations row, so no orphan org is left behind.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Trigger binding is unchanged (create or replace preserves it), but re-assert
-- it defensively to match 179.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. handle_signup: idempotent recovery primitive -----------------------------
-- Same email binding, compared against the authenticated identity's email on
-- auth.users (NOT the client-supplied user_email argument).

create or replace function public.handle_signup(
  user_id uuid,
  user_email text,
  user_name text,
  org_name text,
  invite_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := coalesce(auth.uid(), user_id);
  v_existing    uuid;
  v_invite_rec  public.org_invitations%rowtype;
  v_claim_rec   public.owner_claims%rowtype;
  v_org_id      uuid;
  v_name        text := coalesce(nullif(btrim(user_name), ''), split_part(user_email, '@', 1), 'User');
  v_meta        jsonb;
  v_auth_email  text;
  v_claim_token text;
  v_setup_mode  text;
begin
  if v_uid is null then
    raise exception 'No authenticated session';
  end if;

  -- Idempotent: already provisioned -> return existing org, insert nothing.
  select org_id into v_existing from public.users where id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;

  -- The recovery RPC keeps its 5-arg signature, so the setup/claim context
  -- rides in raw_user_meta_data rather than as parameters. We also read the
  -- TRUSTED identity email here for the invite binding below.
  select email, raw_user_meta_data into v_auth_email, v_meta
    from auth.users where id = v_uid;
  v_claim_token := nullif(v_meta->>'claim_token', '');
  v_setup_mode  := nullif(v_meta->>'setup_mode', '');

  if invite_token is not null then
    select * into v_invite_rec
    from public.org_invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now();

    -- Bind on the authenticated identity's email (v_auth_email), never the
    -- client-supplied user_email argument. A mismatch falls through to the
    -- new-org path so the user is never orphaned.
    if v_invite_rec.id is not null
       and lower(coalesce(v_auth_email, '')) = lower(v_invite_rec.email) then
      insert into public.users (id, org_id, email, name, role)
      values (v_uid, v_invite_rec.org_id, user_email, v_name, coalesce(v_invite_rec.role, 'member'))
      on conflict (id) do nothing;

      update public.org_invitations
        set status = 'accepted', accepted_at = now(), accepted_by = v_uid
        where id = v_invite_rec.id;

      return v_invite_rec.org_id;
    end if;
  end if;

  -- Owner-claim recovery: join the existing org as a holding member (promotion
  -- to owner still requires redeem_owner_claim on active acceptance).
  if v_claim_token is not null then
    select * into v_claim_rec
    from public.owner_claims
    where token = v_claim_token
      and status = 'pending'
      and expires_at > now();

    if v_claim_rec.id is not null then
      insert into public.users (id, org_id, email, name, role)
      values (v_uid, v_claim_rec.org_id, user_email, v_name, 'member')
      on conflict (id) do nothing;
      return v_claim_rec.org_id;
    end if;
    raise exception 'Owner claim token is not valid';
  end if;

  -- New-org path: on-behalf -> admin of an ownerless org; otherwise -> owner.
  insert into public.organizations (name)
    values (coalesce(nullif(btrim(org_name), ''), v_name || '''s organization'))
    returning id into v_org_id;

  insert into public.users (id, org_id, email, name, role)
    values (v_uid, v_org_id, user_email, v_name,
            case when v_setup_mode = 'on_behalf' then 'admin' else 'owner' end)
    on conflict (id) do nothing;

  return v_org_id;
end;
$$;

revoke all on function public.handle_signup(uuid, text, text, text, text) from public, anon;
grant execute on function public.handle_signup(uuid, text, text, text, text) to authenticated;
