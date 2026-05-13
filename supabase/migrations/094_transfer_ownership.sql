-- Ownership transfer.
--
-- One-shot atomic swap: the current owner picks another user in the same
-- org, both get re-roled in a single transaction (current owner → admin,
-- target → owner). Either both updates land or neither does, so the org
-- never ends up with zero owners or two owners.
--
-- This is the only way to change the owner after signup. The role-edit
-- dropdown in Settings (admin_update_user_role) explicitly refuses to
-- touch the owner row; invitations explicitly forbid role='owner'. Both
-- of those gates remain — this RPC is a separate, deliberately-named
-- path that surfaces in the UI as a distinct destructive action.
--
-- Defense in depth:
--   1. SECURITY DEFINER + auth.uid() — runs with elevated privileges but
--      derives the actor from the session, not a caller-provided id.
--   2. caller_role check — only role='owner' passes.
--   3. target_user_id sanity — must exist, must be in caller's org, must
--      not be the caller themselves.
--   4. one-owner sanity — if we somehow discover more than one owner in
--      the org (data integrity violation from elsewhere), refuse rather
--      than make it worse.
--   5. EXECUTE granted only to authenticated; anon + public revoked.

create or replace function public.transfer_ownership(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org uuid;
  target_role text;
  target_org uuid;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be the current owner.
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role is null then
    raise exception 'Caller is not a registered user';
  end if;

  if caller_role <> 'owner' then
    raise exception 'Only the current owner can transfer ownership';
  end if;

  -- Block self-transfer — would be a no-op but might confuse the audit.
  if p_target_user_id = auth.uid() then
    raise exception 'Cannot transfer ownership to yourself';
  end if;

  -- Target must exist and live in the same org.
  select role, org_id into target_role, target_org
  from public.users where id = p_target_user_id;

  if target_role is null then
    raise exception 'Target user not found';
  end if;

  if target_org <> caller_org then
    raise exception 'Target user belongs to another organisation';
  end if;

  -- Belt-and-brace: a healthy org has exactly one owner (the caller).
  -- If we find more, something else corrupted state and a transfer would
  -- make the inconsistency worse — refuse and surface the issue.
  select count(*) into owner_count
  from public.users
  where org_id = caller_org and role = 'owner';

  if owner_count <> 1 then
    raise exception 'Unexpected owner count for organisation (% rows); refusing transfer', owner_count;
  end if;

  -- Atomic swap. PL/pgSQL function bodies run inside the caller's
  -- transaction, so both updates commit together or roll back together.
  -- Order matters defensively: demote the current owner first, then
  -- promote the target. If a constraint somewhere ever refuses the
  -- second update, the first rolls back and the org keeps its owner.
  update public.users set role = 'admin' where id = auth.uid();
  update public.users set role = 'owner' where id = p_target_user_id;
end;
$$;

revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;
