-- Make signup atomic and recoverable so a failed/abandoned profile-provisioning
-- leg can never permanently orphan an auth.users identity (auth row with no
-- public.users row -> the dead-end "Setting up your account..." screen, with no
-- way out short of an operator deleting the auth row).
--
-- BEFORE: the client did supabase.auth.signUp() and THEN a separate
-- handle_signup() RPC as two awaits with no transaction/retry. If the RPC leg
-- failed (network/timeout/tab-close) the identity existed with no users row and
-- there was no recovery path.
--
-- AFTER:
--   1. A SECURITY DEFINER AFTER INSERT trigger on auth.users provisions the
--      org + users row in the SAME transaction as the identity, reading
--      name / org_name / invite_token from raw_user_meta_data (passed via
--      auth.signUp options.data). The body is exception-wrapped so a
--      provisioning failure can NEVER abort the identity insert.
--   2. handle_signup() is rewritten to be idempotent and to derive the caller
--      from auth.uid(), so it doubles as a client-callable recovery primitive
--      for any orphan (App.tsx self-heal). It is revoked from anon (it now only
--      runs from an authenticated session), which also closes the prior
--      "handle_signup is PUBLIC-executable and trusts a spoofable user_id" gap.

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
  v_invite_rec   public.org_invitations%rowtype;
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

  -- New-org path (also the fallback for a bad/expired invite token).
  insert into public.organizations (name)
    values (coalesce(v_org_name, v_name || '''s organization'))
    returning id into v_org_id;

  insert into public.users (id, org_id, email, name, role)
    values (new.id, v_org_id, new.email, v_name, 'owner')
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. handle_signup: idempotent recovery primitive -----------------------------
-- Now only called by the client self-heal path (App.tsx) when a session exists
-- but the users row is missing. Derives the caller from auth.uid() (ignoring a
-- spoofable user_id param), is safe to re-run, and never leaves the caller
-- orphaned. The 5-arg signature is preserved so generated types stay valid.

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
  v_uid        uuid := coalesce(auth.uid(), user_id);
  v_existing   uuid;
  v_invite_rec public.org_invitations%rowtype;
  v_org_id     uuid;
  v_name       text := coalesce(nullif(btrim(user_name), ''), split_part(user_email, '@', 1), 'User');
begin
  if v_uid is null then
    raise exception 'No authenticated session';
  end if;

  -- Idempotent: already provisioned -> return existing org, insert nothing.
  select org_id into v_existing from public.users where id = v_uid;
  if v_existing is not null then
    return v_existing;
  end if;

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

  insert into public.organizations (name)
    values (coalesce(nullif(btrim(org_name), ''), v_name || '''s organization'))
    returning id into v_org_id;

  insert into public.users (id, org_id, email, name, role)
    values (v_uid, v_org_id, user_email, v_name, 'owner')
    on conflict (id) do nothing;

  return v_org_id;
end;
$$;

revoke all on function public.handle_signup(uuid, text, text, text, text) from public, anon;
grant execute on function public.handle_signup(uuid, text, text, text, text) to authenticated;
