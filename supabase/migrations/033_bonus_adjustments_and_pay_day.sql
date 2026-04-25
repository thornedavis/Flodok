-- Additive foundation for the compensation-model simplification:
--   1. bonus_adjustments — fourth layer for one-off positive IDR top-ups.
--      Mirrors credit_adjustments' payout lifecycle so they freeze together
--      on pay day.
--   2. organizations.pay_day_of_month — anchor for the automatic period-close
--      scheduler (a separate Worker hits close_period on the day after pay day).
--   3. Extend close_credit_period to also freeze bonuses in the same period,
--      so a single call locks both ledgers in lockstep.
--   4. Extend portal_home to surface bonuses to the employee portal.
--
-- No data migration here. Allowance adjustments and the manual cash-out
-- button stay in place; Phase 2 will migrate + drop them and swap the
-- manual cash-out for a cron-driven auto-close.

-- 1. Bonus adjustments ledger -------------------------------------------------

create table if not exists public.bonus_adjustments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  period_month  date not null default public.current_period_month(),
  amount_idr    integer not null,
  reason        text not null,
  awarded_by    uuid not null references public.users(id),
  payout_idr    integer,
  paid_out_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint bonus_adjustments_amount_positive check (amount_idr > 0),
  constraint bonus_adjustments_reason_length check (length(reason) >= 20),
  constraint bonus_adjustments_period_first_of_month
    check (period_month = date_trunc('month', period_month)::date),
  constraint bonus_adjustments_payout_pair
    check ((payout_idr is null and paid_out_at is null)
           or (payout_idr is not null and paid_out_at is not null))
);

create index if not exists bonus_adjustments_emp_period_idx
  on public.bonus_adjustments (employee_id, period_month);
create index if not exists bonus_adjustments_org_period_idx
  on public.bonus_adjustments (org_id, period_month);

-- Freeze trigger: block new rows once the period has been paid out.
create or replace function public.tg_bonus_adjustments_freeze()
returns trigger
language plpgsql
as $$
declare
  frozen boolean;
begin
  select exists (
    select 1 from public.bonus_adjustments
    where employee_id = new.employee_id
      and period_month = new.period_month
      and paid_out_at is not null
  ) into frozen;

  if frozen then
    raise exception 'Bonus period % for employee % has been paid out and is frozen',
      new.period_month, new.employee_id;
  end if;

  return new;
end;
$$;

drop trigger if exists bonus_adjustments_freeze on public.bonus_adjustments;
create trigger bonus_adjustments_freeze
  before insert on public.bonus_adjustments
  for each row execute function public.tg_bonus_adjustments_freeze();

alter table public.bonus_adjustments enable row level security;

create policy "Members read bonus adjustments in own org"
  on public.bonus_adjustments for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'manager')
  );

create policy "Admins insert bonus adjustments in own org"
  on public.bonus_adjustments for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
    and awarded_by = auth.uid()
  );

-- 2. Org pay-day field --------------------------------------------------------
-- 1–28 = a specific day of the month. 0 = "last day of the month"
-- (handled by the scheduler, not a constraint here). Default 1 matches the
-- most common Indonesian practice of paying on the 1st.

alter table public.organizations
  add column if not exists pay_day_of_month smallint not null default 1;

alter table public.organizations
  drop constraint if exists organizations_pay_day_of_month_range;
alter table public.organizations
  add constraint organizations_pay_day_of_month_range
  check (pay_day_of_month between 0 and 28);

-- 3. Unified period close -----------------------------------------------------
-- Same signature as before so the existing "Cash out this period" button keeps
-- working during the additive phase. Now also snapshots payout_idr on any
-- open bonus rows for the same (employee, period) and freezes them.

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
  credit_payout integer;
  bonus_payout integer;
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

  credit_payout := case
    when net_credits > 0 then round(net_credits::numeric * allowance / org_divisor)::integer
    else 0
  end;

  update public.bonus_adjustments
  set payout_idr = amount_idr,
      paid_out_at = now()
  where employee_id = target_employee_id
    and period_month = target_period_month
    and paid_out_at is null;

  select coalesce(sum(amount_idr), 0) into bonus_payout
  from public.bonus_adjustments
  where employee_id = target_employee_id
    and period_month = target_period_month;

  return credit_payout + bonus_payout;
end;
$$;

grant execute on function public.close_credit_period(uuid, date) to authenticated;

-- 4. Extend portal_home with bonuses -----------------------------------------

create or replace function public.portal_home(
  emp_slug text,
  emp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  org public.organizations%rowtype;
  active_contract public.contracts%rowtype;
  period date;
  result jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org from public.organizations where id = emp.org_id;

  select * into active_contract from public.contracts
  where employee_id = emp.id and status = 'active'
  order by updated_at desc
  limit 1;

  period := public.current_period_month();

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id', emp.id,
      'name', emp.name,
      'photo_url', emp.photo_url,
      'department', emp.department,
      'departments', to_jsonb(coalesce(emp.departments, array[]::text[])),
      'created_at', emp.created_at
    ),
    'org', jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'logo_url', org.logo_url,
      'credits_divisor', org.credits_divisor
    ),
    'contract', case
      when active_contract.id is null then null
      else jsonb_build_object(
        'base_wage_idr', active_contract.base_wage_idr,
        'allowance_idr', active_contract.allowance_idr
      )
    end,
    'period_month', period,
    'allowance_adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_idr', amount_idr,
          'reason', reason,
          'created_at', created_at
        )
        order by created_at desc
      )
      from public.allowance_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'allowance_sum', coalesce((
      select sum(amount_idr)::integer
      from public.allowance_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'credit_adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount', amount,
          'reason', reason,
          'created_at', created_at,
          'paid_out_at', paid_out_at,
          'payout_idr', payout_idr
        )
        order by created_at desc
      )
      from public.credit_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'credit_net', coalesce((
      select sum(amount)::integer
      from public.credit_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'credit_frozen', exists (
      select 1 from public.credit_adjustments
      where employee_id = emp.id
        and period_month = period
        and paid_out_at is not null
    ),
    'bonus_adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_idr', amount_idr,
          'reason', reason,
          'created_at', created_at,
          'paid_out_at', paid_out_at,
          'payout_idr', payout_idr
        )
        order by created_at desc
      )
      from public.bonus_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'bonus_sum', coalesce((
      select sum(amount_idr)::integer
      from public.bonus_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'unlock_id', u.id,
          'unlocked_at', u.unlocked_at,
          'reason', u.reason,
          'name', d.name,
          'icon', d.icon,
          'description', d.description,
          'is_featured', d.is_featured
        )
        order by d.is_featured desc, u.unlocked_at desc
      )
      from public.achievement_unlocks u
      join public.achievement_definitions d on d.id = u.achievement_id
      where u.employee_id = emp.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_home(text, text) to anon, authenticated;
