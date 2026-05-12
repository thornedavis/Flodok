-- Roles overhaul + user ↔ employee link.
--
-- Two changes that the upcoming hiring-request workflow depends on:
--
-- 1. The 'manager' role today is a misnomer — it just means "regular member,
--    can use the product, no admin powers." That clashes with the real-world
--    notion of a department manager. Rename it to 'member' and add a new
--    'hr' role for HR staff who own the employee lifecycle (hiring,
--    contracts, onboarding, separations) without needing billing/integration
--    powers. Final role enum: owner | admin | hr | member.
--
-- 2. Login users and employee records have been disjoint tables. A managing
--    director who is both a user (logs in to manage the org) and an
--    employee (has a contract, a portal slug, an HR record) has had two
--    independent rows joined only by an email string. Add a nullable
--    users.employee_id FK so the two can be wired together; backfill from
--    a case-insensitive email match where possible. Future workflows (the
--    hiring-request flow, performance reviews) need this link to route
--    approvals by department membership.
--
-- 3. Update every function and policy that hardcodes 'manager' to use the
--    new enum. handle_signup, admin_update_user_role, and the
--    allowance_adjustments SELECT policy all touched here.

-- 1. Roles: widen the CHECK, migrate data, then tighten -----------------------

alter table public.users
  drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('owner', 'admin', 'hr', 'manager', 'member'));

alter table public.org_invitations
  drop constraint if exists org_invitations_role_check;
alter table public.org_invitations
  add constraint org_invitations_role_check check (role in ('admin', 'hr', 'manager', 'member'));

update public.users          set role = 'member' where role = 'manager';
update public.org_invitations set role = 'member' where role = 'manager';

alter table public.users
  drop constraint users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('owner', 'admin', 'hr', 'member'));

alter table public.org_invitations
  drop constraint org_invitations_role_check;
alter table public.org_invitations
  add constraint org_invitations_role_check check (role in ('admin', 'hr', 'member'));

alter table public.users          alter column role set default 'member';
alter table public.org_invitations alter column role set default 'member';

-- 2. User ↔ employee link -----------------------------------------------------

alter table public.users
  add column if not exists employee_id uuid
    references public.employees(id) on delete set null;

-- One employee may be linked to at most one login user. Enforced with a
-- partial unique index so multiple users with employee_id IS NULL stay valid.
create unique index if not exists users_employee_id_unique
  on public.users (employee_id)
  where employee_id is not null;

create index if not exists idx_users_employee_id
  on public.users (employee_id)
  where employee_id is not null;

-- Best-effort backfill: link any user whose email matches an employee in
-- the same org (case-insensitive). Skips users that would collide on the
-- partial unique index above.
update public.users u
set employee_id = e.id
from public.employees e
where u.org_id = e.org_id
  and u.employee_id is null
  and u.email is not null
  and e.email is not null
  and lower(trim(u.email)) = lower(trim(e.email))
  and not exists (
    select 1 from public.users u2
    where u2.employee_id = e.id and u2.id <> u.id
  );

-- 3. Update functions / policies that referenced 'manager' --------------------

-- handle_signup: invited users now default to 'member' instead of 'manager'.
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
    target_role := coalesce(invite_record.role, 'member');

    insert into public.users (id, org_id, email, name, role)
    values (user_id, target_org_id, user_email, user_name, target_role);

    update public.org_invitations
    set status = 'accepted',
        accepted_at = now(),
        accepted_by = user_id
    where id = invite_record.id;
  else
    insert into public.organizations (name)
    values (org_name)
    returning id into target_org_id;

    insert into public.users (id, org_id, email, name, role)
    values (user_id, target_org_id, user_email, user_name, 'owner');
  end if;

  return target_org_id;
end;
$$;

-- admin_update_user_role: accepts admin / hr / member; can't touch owners,
-- can't self-promote. Same constraints as before.
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
  if new_role not in ('admin', 'hr', 'member') then
    raise exception 'Invalid role: must be admin, hr, or member';
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

-- The only RLS policy that referenced 'manager' as a literal was on
-- allowance_adjustments (migration 027). That table was dropped in 034 when
-- the ledger collapsed into credit_adjustments, so the dangling policy is
-- already gone — no rewrite needed here.
