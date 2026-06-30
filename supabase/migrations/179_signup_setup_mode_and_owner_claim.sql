-- Extend signup provisioning (164) for the two-path welcome + owner-claim.
--
-- Two new behaviours, both layered on top of 164's atomic, orphan-safe design:
--
--   A. setup_mode = 'on_behalf'  (new-org path)
--      The creator is an HR/admin setting the company up for someone else.
--      Provision them as ADMIN of an OWNERLESS org instead of owner. The real
--      owner is invited separately and claims via redeem_owner_claim (178).
--      Everything else (no owner yet) is tolerable for a brand-new org: forms
--      owner-approval defaults off, and there is no constraint requiring >=1
--      owner. Default (no/owner mode) is unchanged: creator = owner.
--
--   B. claim_token present
--      The identity was created by auth.admin.inviteUserByEmail with the claim
--      token in metadata (the owner accepting their invite). Join them to the
--      EXISTING claim org as a holding MEMBER — never owner here, and never a
--      fresh junk org. redeem_owner_claim() promotes them to owner only on
--      active acceptance, so a mistyped/intercepted address is never handed
--      ownership at email-send time.
--
-- The owner-claim table + redemption live in 178; this migration only teaches
-- the signup trigger and the idempotent recovery primitive about the new
-- metadata. The 5-arg handle_signup signature is preserved (recovery reads the
-- extra context from raw_user_meta_data), so generated types stay valid.

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

  -- Invite path: join the inviting org at the invited role.
  if v_invite_token is not null then
    select * into v_invite_rec
    from public.org_invitations
    where token = v_invite_token
      and status = 'pending'
      and expires_at > now();

    if v_invite_rec.id is not null then
      insert into public.users (id, org_id, email, name, role)
      values (new.id, v_invite_rec.org_id, new.email, v_name, coalesce(v_invite_rec.role, 'member'))
      on conflict (id) do nothing;

      update public.org_invitations
        set status = 'accepted', accepted_at = now(), accepted_by = new.id
        where id = v_invite_rec.id;

      return new;
    end if;
    -- Invalid/expired invite: fall through to new-org so the user is never orphaned.
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

  -- New-org path (also the fallback for a bad/expired invite token).
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

-- Trigger binding is unchanged from 164, but re-assert it defensively.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. handle_signup: idempotent recovery primitive -----------------------------
-- Mirrors the trigger's new branches. Reads setup_mode / claim_token from the
-- caller's raw_user_meta_data (the 5-arg signature is preserved).

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
  -- rides in raw_user_meta_data rather than as parameters.
  select raw_user_meta_data into v_meta from auth.users where id = v_uid;
  v_claim_token := nullif(v_meta->>'claim_token', '');
  v_setup_mode  := nullif(v_meta->>'setup_mode', '');

  if invite_token is not null then
    select * into v_invite_rec
    from public.org_invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now();

    if v_invite_rec.id is not null then
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
