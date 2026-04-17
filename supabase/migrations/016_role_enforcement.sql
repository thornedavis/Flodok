-- Role-based access control for org members.
--
-- Roles:
--   owner   — one per org (creator). Can do anything. Future: transfer ownership, delete org.
--   admin   — full admin powers except ownership-level actions (future billing, delete org).
--   manager — default member. Can use the product (employees/SOPs/contracts) but cannot
--             manage org settings, API keys, invites, or other members' roles.
--
-- This migration:
--   1. Constrains users.role + org_invitations.role to a known set
--   2. Backfills existing users: first user per org becomes 'owner', rest stay 'manager'
--   3. Updates handle_signup so new-org creators are 'owner'
--   4. Adds a get_user_role() helper
--   5. Tightens RLS on organizations / api_keys / org_invitations — writes require admin+
--   6. Adds admin_update_user_role RPC for promoting/demoting between admin and manager

-- 1. Role value constraints ----------------------------------------------------

alter table public.users
  drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('owner', 'admin', 'manager'));

alter table public.org_invitations
  drop constraint if exists org_invitations_role_check;
alter table public.org_invitations
  add constraint org_invitations_role_check check (role in ('admin', 'manager'));

-- 2. Backfill: first user in each org is the owner ----------------------------

with first_users as (
  select distinct on (org_id) id
  from public.users
  order by org_id, created_at asc
)
update public.users
set role = 'owner'
where id in (select id from first_users);

-- 3. Update signup function: new-org creator becomes owner --------------------

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
  target_org_id uuid;
  invite_record public.org_invitations%rowtype;
  target_role text;
begin
  if invite_token is not null then
    select * into invite_record
    from public.org_invitations
    where token = invite_token
      and status = 'pending'
      and expires_at > now();

    if invite_record.id is null then
      raise exception 'Invite token is invalid or expired';
    end if;

    target_org_id := invite_record.org_id;
    target_role := coalesce(invite_record.role, 'manager');

    insert into public.users (id, org_id, email, name, role)
    values (user_id, target_org_id, user_email, user_name, target_role);

    update public.org_invitations
    set status = 'accepted',
        accepted_at = now(),
        accepted_by = user_id
    where id = invite_record.id;
  else
    -- First user of a new org is the owner
    insert into public.organizations (name)
    values (org_name)
    returning id into target_org_id;

    insert into public.users (id, org_id, email, name, role)
    values (user_id, target_org_id, user_email, user_name, 'owner');
  end if;

  return target_org_id;
end;
$$;

-- 4. Role helper --------------------------------------------------------------

create or replace function public.get_user_role()
returns text
language sql
stable
security definer
as $$
  select role from public.users where id = auth.uid()
$$;

-- 5. Tighten RLS --------------------------------------------------------------

-- Organizations: only admin/owner can update
drop policy if exists "Managers can update own org" on public.organizations;
create policy "Admins can update own org"
  on public.organizations for update
  using (
    id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

-- API keys: read is org-wide; writes require admin/owner.
-- Drop the old catch-all and split into specific policies.
drop policy if exists "Managers can manage API keys in own org" on public.api_keys;

create policy "Members can view API keys in own org"
  on public.api_keys for select
  using (org_id = public.get_user_org_id());

create policy "Admins can create API keys"
  on public.api_keys for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

create policy "Admins can delete API keys"
  on public.api_keys for delete
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

-- Invitations: read stays org-wide; writes require admin/owner.
-- Drop the broad policies from migration 015 and recreate with role checks.
drop policy if exists "Members can create org invitations" on public.org_invitations;
drop policy if exists "Members can update own org invitations" on public.org_invitations;
drop policy if exists "Members can delete own org invitations" on public.org_invitations;

create policy "Admins can create org invitations"
  on public.org_invitations for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

create policy "Admins can update org invitations"
  on public.org_invitations for update
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

create policy "Admins can delete org invitations"
  on public.org_invitations for delete
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

-- 6. Admin RPC: change another member's role (admin <-> manager only) --------
-- Cannot self-promote, cannot touch owners, cannot create owners via this path.

create or replace function public.admin_update_user_role(
  target_user_id uuid,
  new_role text
)
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
begin
  if new_role not in ('admin', 'manager') then
    raise exception 'Invalid role: must be admin or manager';
  end if;

  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  select role, org_id into target_role, target_org
  from public.users where id = target_user_id;

  if target_org is null or target_org != caller_org then
    raise exception 'User not found in your organization';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  if target_role = 'owner' then
    raise exception 'Cannot change the owner''s role';
  end if;

  update public.users
  set role = new_role
  where id = target_user_id;
end;
$$;
