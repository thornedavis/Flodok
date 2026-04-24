-- Foundation for the Credits + Achievements system.
--
-- Four-layer compensation / recognition model:
--   Layer 1 — Gaji pokok (base wage). First-class column on contracts.
--             Structurally immutable by this system. No adjustment path touches it.
--   Layer 2 — Tunjangan (allowance). First-class column on contracts. Elastic via
--             allowance_adjustments, floor-protected so effective tunjangan cannot
--             drop below zero in any period.
--   Layer 3 — Credits. Proportional to each employee's allowance via
--             organizations.credits_divisor (default 1000 = 1 month allowance).
--             Additive and subtractive, period-scoped, net floored at zero,
--             frozen once a period is cashed out. Public by default for leaderboard.
--   Layer 4 — Achievements. Pure reputation (badges). No monetary tie-in.
--             Manual or auto-triggered. Independent of Credits.
--
-- This migration:
--   1. Adds wage fields to contracts
--   2. Adds credits_divisor to organizations
--   3. Creates allowance_adjustments (Layer 2) + floor trigger + RLS
--   4. Creates credit_adjustments (Layer 3) + floor/freeze trigger + RLS
--   5. Creates achievement_definitions + achievement_unlocks (Layer 4) + RLS
--   6. Helper: current_period_month() anchored to Asia/Jakarta (WIB)
--   7. RPC: close_credit_period() to snapshot payout and freeze a period

-- 1. Contract wage fields -----------------------------------------------------

alter table public.contracts
  add column if not exists base_wage_idr integer,
  add column if not exists allowance_idr integer;

alter table public.contracts
  drop constraint if exists contracts_base_wage_nonneg;
alter table public.contracts
  add constraint contracts_base_wage_nonneg
  check (base_wage_idr is null or base_wage_idr >= 0);

alter table public.contracts
  drop constraint if exists contracts_allowance_nonneg;
alter table public.contracts
  add constraint contracts_allowance_nonneg
  check (allowance_idr is null or allowance_idr >= 0);

-- 2. Org credits divisor ------------------------------------------------------

alter table public.organizations
  add column if not exists credits_divisor integer not null default 1000;

alter table public.organizations
  drop constraint if exists organizations_credits_divisor_positive;
alter table public.organizations
  add constraint organizations_credits_divisor_positive
  check (credits_divisor > 0);

-- 3. Period helper ------------------------------------------------------------
-- All periods are computed against Asia/Jakarta (WIB) wall-clock, not server UTC.
-- This keeps period boundaries aligned with how employees and admins experience
-- "this month" regardless of DB/host timezone.

create or replace function public.current_period_month()
returns date
language sql
stable
as $$
  select date_trunc('month', now() at time zone 'Asia/Jakarta')::date
$$;

-- 4. Allowance adjustments (Layer 2) -----------------------------------------

create table if not exists public.allowance_adjustments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  period_month  date not null default public.current_period_month(),
  amount_idr    integer not null,
  reason        text not null,
  awarded_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  constraint allowance_adjustments_reason_length check (length(reason) >= 20),
  constraint allowance_adjustments_period_first_of_month
    check (period_month = date_trunc('month', period_month)::date)
);

create index if not exists allowance_adjustments_emp_period_idx
  on public.allowance_adjustments (employee_id, period_month);
create index if not exists allowance_adjustments_org_period_idx
  on public.allowance_adjustments (org_id, period_month);

-- Floor trigger: prevent effective tunjangan from dropping below zero.
-- Effective = (active contract's allowance_idr) + sum of adjustments in period.
create or replace function public.tg_allowance_adjustments_floor()
returns trigger
language plpgsql
as $$
declare
  baseline integer;
  running_sum integer;
begin
  select coalesce(allowance_idr, 0) into baseline
  from public.contracts
  where employee_id = new.employee_id
    and status = 'active'
  order by updated_at desc
  limit 1;

  select coalesce(sum(amount_idr), 0) into running_sum
  from public.allowance_adjustments
  where employee_id = new.employee_id
    and period_month = new.period_month;

  if (baseline + running_sum + new.amount_idr) < 0 then
    raise exception 'Allowance adjustment would drop effective tunjangan below zero (baseline: %, running: %, adjustment: %)',
      baseline, running_sum, new.amount_idr;
  end if;

  return new;
end;
$$;

drop trigger if exists allowance_adjustments_floor on public.allowance_adjustments;
create trigger allowance_adjustments_floor
  before insert on public.allowance_adjustments
  for each row execute function public.tg_allowance_adjustments_floor();

alter table public.allowance_adjustments enable row level security;

-- Admin or owner in same org can read and insert. Append-only: no update/delete
-- policies defined, so those ops are denied.
create policy "Admins read allowance adjustments in own org"
  on public.allowance_adjustments for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'manager')
  );

create policy "Admins insert allowance adjustments in own org"
  on public.allowance_adjustments for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
    and awarded_by = auth.uid()
  );

-- 5. Credit adjustments (Layer 3) --------------------------------------------

create table if not exists public.credit_adjustments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  period_month  date not null default public.current_period_month(),
  amount        integer not null,
  reason        text not null,
  awarded_by    uuid not null references public.users(id),
  payout_idr    integer,
  paid_out_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint credit_adjustments_reason_length check (length(reason) >= 20),
  constraint credit_adjustments_period_first_of_month
    check (period_month = date_trunc('month', period_month)::date),
  constraint credit_adjustments_payout_pair
    check ((payout_idr is null and paid_out_at is null)
           or (payout_idr is not null and paid_out_at is not null))
);

create index if not exists credit_adjustments_emp_period_idx
  on public.credit_adjustments (employee_id, period_month);
create index if not exists credit_adjustments_org_period_idx
  on public.credit_adjustments (org_id, period_month);

-- Floor + freeze trigger:
--   (a) reject if the running net after this row would drop below zero
--   (b) reject if the period has already been cashed out
create or replace function public.tg_credit_adjustments_floor()
returns trigger
language plpgsql
as $$
declare
  running_net integer;
  frozen boolean;
begin
  select exists (
    select 1 from public.credit_adjustments
    where employee_id = new.employee_id
      and period_month = new.period_month
      and paid_out_at is not null
  ) into frozen;

  if frozen then
    raise exception 'Credit period % for employee % has been cashed out and is frozen',
      new.period_month, new.employee_id;
  end if;

  select coalesce(sum(amount), 0) into running_net
  from public.credit_adjustments
  where employee_id = new.employee_id
    and period_month = new.period_month;

  if (running_net + new.amount) < 0 then
    raise exception 'Credit adjustment would drop net below zero (current net: %, adjustment: %)',
      running_net, new.amount;
  end if;

  return new;
end;
$$;

drop trigger if exists credit_adjustments_floor on public.credit_adjustments;
create trigger credit_adjustments_floor
  before insert on public.credit_adjustments
  for each row execute function public.tg_credit_adjustments_floor();

alter table public.credit_adjustments enable row level security;

create policy "Members read credit adjustments in own org"
  on public.credit_adjustments for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'manager')
  );

create policy "Admins insert credit adjustments in own org"
  on public.credit_adjustments for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
    and awarded_by = auth.uid()
  );

-- 6. Achievements (Layer 4) --------------------------------------------------

create table if not exists public.achievement_definitions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  description   text,
  icon          text,
  trigger_type  text not null,
  trigger_rule  jsonb,
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint achievement_definitions_trigger_type
    check (trigger_type in ('manual', 'auto')),
  constraint achievement_definitions_auto_has_rule
    check (trigger_type = 'manual' or trigger_rule is not null),
  constraint achievement_definitions_name_unique_per_org
    unique (org_id, name)
);

create index if not exists achievement_definitions_org_idx
  on public.achievement_definitions (org_id);

alter table public.achievement_definitions enable row level security;

create policy "Members read achievement definitions in own org"
  on public.achievement_definitions for select
  using (org_id = public.get_user_org_id());

create policy "Admins manage achievement definitions in own org"
  on public.achievement_definitions for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

create policy "Admins update achievement definitions in own org"
  on public.achievement_definitions for update
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

create policy "Admins delete achievement definitions in own org"
  on public.achievement_definitions for delete
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

create table if not exists public.achievement_unlocks (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  achievement_id  uuid not null references public.achievement_definitions(id) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  awarded_by      uuid references public.users(id),
  reason          text,
  constraint achievement_unlocks_unique unique (employee_id, achievement_id)
);

create index if not exists achievement_unlocks_employee_idx
  on public.achievement_unlocks (employee_id);
create index if not exists achievement_unlocks_achievement_idx
  on public.achievement_unlocks (achievement_id);

alter table public.achievement_unlocks enable row level security;

-- Members of the same org can read all unlocks (for social visibility).
-- Scoping happens via join to achievement_definitions, which is org-scoped.
create policy "Members read achievement unlocks in own org"
  on public.achievement_unlocks for select
  using (
    exists (
      select 1 from public.achievement_definitions d
      where d.id = achievement_id
        and d.org_id = public.get_user_org_id()
    )
  );

create policy "Admins insert achievement unlocks in own org"
  on public.achievement_unlocks for insert
  with check (
    exists (
      select 1 from public.achievement_definitions d
      where d.id = achievement_id
        and d.org_id = public.get_user_org_id()
    )
    and public.get_user_role() in ('owner', 'admin')
  );

create policy "Admins delete achievement unlocks in own org"
  on public.achievement_unlocks for delete
  using (
    exists (
      select 1 from public.achievement_definitions d
      where d.id = achievement_id
        and d.org_id = public.get_user_org_id()
    )
    and public.get_user_role() in ('owner', 'admin')
  );

-- 7. Close credit period RPC --------------------------------------------------
-- Snapshots payout_idr on every row in the (employee, period) scope and sets
-- paid_out_at. After this runs, the freeze trigger blocks further adjustments
-- in that period. Positive rows are converted via the current active contract's
-- allowance and the org's credits_divisor. Negative rows get 0 payout.

create or replace function public.close_credit_period(
  target_employee_id uuid,
  target_period_month date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org uuid;
  target_org uuid;
  net_credits integer;
  org_divisor integer;
  allowance integer;
  total_payout integer;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to close credit periods';
  end if;

  select org_id into target_org
  from public.employees where id = target_employee_id;
  if target_org is null or target_org != caller_org then
    raise exception 'Employee not found in your organization';
  end if;

  if exists (
    select 1 from public.credit_adjustments
    where employee_id = target_employee_id
      and period_month = target_period_month
      and paid_out_at is not null
  ) then
    raise exception 'Period has already been cashed out';
  end if;

  select coalesce(sum(amount), 0) into net_credits
  from public.credit_adjustments
  where employee_id = target_employee_id
    and period_month = target_period_month;

  select credits_divisor into org_divisor
  from public.organizations where id = caller_org;

  select coalesce(allowance_idr, 0) into allowance
  from public.contracts
  where employee_id = target_employee_id
    and status = 'active'
  order by updated_at desc
  limit 1;

  update public.credit_adjustments
  set payout_idr = case
        when amount > 0 then round(amount::numeric * allowance / org_divisor)::integer
        else 0
      end,
      paid_out_at = now()
  where employee_id = target_employee_id
    and period_month = target_period_month;

  total_payout := case
    when net_credits > 0 then round(net_credits::numeric * allowance / org_divisor)::integer
    else 0
  end;

  return total_payout;
end;
$$;

grant execute on function public.close_credit_period(uuid, date) to authenticated;
