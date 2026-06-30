-- Seat invited members at ACCEPTANCE, not at email-send time.
--
-- Background: team invites now go out via auth.admin.inviteUserByEmail (the
-- invite-member edge fn), which creates the auth identity the moment the email
-- is sent. Under 185 the signup trigger then immediately seated that identity
-- into the org at the invited role and marked the invite 'accepted'. Three
-- problems flowed from seating-at-send-time:
--   1. Revoking an invite did NOT prevent the join — the person was already
--      seated, so revoking only marked the row; they could still set a password
--      later and get in.
--   2. The invitee appeared in the member roster immediately (unconfirmed,
--      can't log in), and the invite never showed under "pending invites".
--   3. The /invite acceptance page couldn't validate the invite (it was already
--      'accepted', so get_invite_by_token returned nothing).
--
-- Fix: the trigger no longer seats on an invite token. An invited identity is
-- created (by inviteUserByEmail) but joins NO org until they actively accept —
-- i.e. set a password on /invite, which calls handle_signup. handle_signup
-- remains the email-bound seater (unchanged from 185): it joins the caller to
-- the org at the invited role only when the invite is still 'pending' and the
-- authenticated email matches. So:
--   • the invite stays genuinely 'pending' (shows in pending-invites, revocable;
--     a revoke before acceptance now actually prevents the join),
--   • no premature unconfirmed member appears in the roster,
--   • get_invite_by_token works on the acceptance page.
--
-- ONLY the invite branch of handle_new_user changes. The owner-claim branch,
-- the new-org / on-behalf branch, the exception handler, handle_signup, the
-- function signatures, search_path, security context, and grants are all
-- unchanged from 185.

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
  v_claim_rec    public.owner_claims%rowtype;
  v_org_id       uuid;
begin
  -- Idempotent: never double-provision.
  if exists (select 1 from public.users where id = new.id) then
    return new;
  end if;

  -- Invite path: DEFERRED. The invited identity exists (inviteUserByEmail
  -- created it), but we do NOT seat them into the org here. Seating happens only
  -- when they actively accept — they set a password on /invite, which calls
  -- handle_signup (the email-bound seater, unchanged from 185). This keeps the
  -- invite genuinely 'pending' so it stays revocable and no premature member
  -- appears. Returning here also avoids creating a junk new-org for the invitee.
  if v_invite_token is not null then
    return new;
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

  -- New-org path. On-behalf setup -> admin of an ownerless org; otherwise -> owner.
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

-- Re-assert the trigger binding defensively (create or replace preserves it).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
