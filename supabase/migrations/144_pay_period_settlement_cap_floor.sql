-- Pay ledger correctness: settled-period snapshot + server-side cap & floor.
--
-- Problems fixed (from the audit of migration 126):
--  1. close_period computed greatest(0, base+allowance+net) but only RETURNED
--     it — never stored it — and auto_close_periods (the cron path) only stamped
--     paid_out_at. So closed months had no frozen payout and every screen
--     recomputed from the CURRENT contract; raising someone's base later changed
--     their already-paid past months.
--  2. The per-adjustment cap (organizations.max_bonus_idr) was enforced only in
--     client JS — a direct insert could exceed it.
--  3. Migration 126 dropped the 125 floor trigger with no replacement, so the
--     cumulative net could be driven arbitrarily negative.
--
-- Fix: snapshot base/allowance/net/payout into pay_period_settlements at close;
-- read paths use the snapshot for closed periods; cap + floor enforced in the
-- existing BEFORE INSERT trigger. Floor = -(base+allowance): a month's penalties
-- can erase the month's pay to Rp 0 but not bury a deficit (matches 126's intent).
--
-- NOTE: only NEW closes are snapshotted. Already-closed historical periods have
-- no settlement row and keep recomputing live (we can't reconstruct the contract
-- values as of a past close), so they're no worse than today.

-- 1. Settlement table -------------------------------------------------------
create table if not exists public.pay_period_settlements (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  period_month       date not null,
  base_idr           integer not null default 0,
  allowance_idr      integer not null default 0,
  adjustment_net_idr integer not null default 0,
  payout_idr         integer not null default 0,
  settled_at         timestamptz not null default now(),
  unique (employee_id, period_month)
);

alter table public.pay_period_settlements enable row level security;

-- Read: owner/admin in the owning org (mirrors pay_adjustments). Writes happen
-- only through the SECURITY DEFINER close functions below — no write policy.
create policy "Admins read settlements in own org"
  on public.pay_period_settlements for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

-- 2. Snapshot helper (idempotent upsert) ------------------------------------
-- Captures base/allowance from the contract that is active at call time plus the
-- period's adjustment net, and the floored payout. Called when a period closes.
create or replace function public._settle_pay_period(
  p_employee_id uuid,
  p_period_month date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_base  integer;
  v_allow integer;
  v_net   integer;
begin
  select org_id into v_org from public.employees where id = p_employee_id;
  if v_org is null then return; end if;

  select coalesce(base_wage_idr, 0), coalesce(allowance_idr, 0)
    into v_base, v_allow
  from public.contracts
  where employee_id = p_employee_id and status = 'active'
  order by updated_at desc
  limit 1;
  v_base := coalesce(v_base, 0);
  v_allow := coalesce(v_allow, 0);

  select coalesce(sum(amount_idr), 0)::integer into v_net
  from public.pay_adjustments
  where employee_id = p_employee_id and period_month = p_period_month;

  insert into public.pay_period_settlements
    (org_id, employee_id, period_month, base_idr, allowance_idr, adjustment_net_idr, payout_idr)
  values
    (v_org, p_employee_id, p_period_month, v_base, v_allow, v_net,
     greatest(0, v_base + v_allow + v_net))
  on conflict (employee_id, period_month) do update set
    base_idr           = excluded.base_idr,
    allowance_idr      = excluded.allowance_idr,
    adjustment_net_idr = excluded.adjustment_net_idr,
    payout_idr         = excluded.payout_idr,
    settled_at         = now();
end;
$$;

revoke all on function public._settle_pay_period(uuid, date) from public, anon, authenticated;

-- 3. Cap + floor on the existing BEFORE INSERT trigger ----------------------
create or replace function public.tg_pay_adjustments_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap     integer;
  v_pay     integer;  -- base + allowance of the current active contract
  v_running integer;
begin
  -- Frozen-period guard: a period is closed if any adjustment is paid out OR a
  -- settlement snapshot exists (covers zero-adjustment periods that auto_close
  -- still settled).
  if exists (
    select 1 from public.pay_adjustments
    where employee_id = new.employee_id
      and period_month = new.period_month
      and paid_out_at is not null
  ) or exists (
    select 1 from public.pay_period_settlements
    where employee_id = new.employee_id
      and period_month = new.period_month
  ) then
    raise exception 'Pay period % for employee % has been closed and is frozen',
      new.period_month, new.employee_id;
  end if;

  -- Per-adjustment cap (only when the org sets one).
  select max_bonus_idr into v_cap from public.organizations where id = new.org_id;
  if v_cap is not null and abs(new.amount_idr) > v_cap then
    raise exception 'Adjustment of % exceeds the per-adjustment cap of %',
      new.amount_idr, v_cap;
  end if;

  -- Floor: the cumulative net for the period may not fall below -(base+allowance)
  -- — i.e. penalties can erase the month's pay to Rp 0 but no further.
  select coalesce(base_wage_idr, 0) + coalesce(allowance_idr, 0) into v_pay
  from public.contracts
  where employee_id = new.employee_id and status = 'active'
  order by updated_at desc
  limit 1;
  v_pay := coalesce(v_pay, 0);

  select coalesce(sum(amount_idr), 0) into v_running
  from public.pay_adjustments
  where employee_id = new.employee_id and period_month = new.period_month;

  if (v_running + new.amount_idr) < -v_pay then
    raise exception 'Adjustment would drop the period net below the floor of -% (current net %, adjustment %)',
      v_pay, v_running, new.amount_idr;
  end if;

  return new;
end;
$$;

-- 4. close_period: snapshot on close ----------------------------------------
create or replace function public.close_period(
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
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to close periods';
  end if;

  select org_id into target_org
  from public.employees where id = target_employee_id;
  if target_org is null or target_org != caller_org then
    raise exception 'Employee not found in your organization';
  end if;

  if exists (
    select 1 from public.pay_adjustments
    where employee_id = target_employee_id
      and period_month = target_period_month
      and paid_out_at is not null
  ) then
    raise exception 'Period has already been closed';
  end if;

  update public.pay_adjustments
  set paid_out_at = now()
  where employee_id = target_employee_id
    and period_month = target_period_month
    and paid_out_at is null;

  -- Freeze base/allowance/net/payout so the closed month never moves again.
  perform public._settle_pay_period(target_employee_id, target_period_month);

  return (
    select payout_idr from public.pay_period_settlements
    where employee_id = target_employee_id and period_month = target_period_month
  );
end;
$$;

grant execute on function public.close_period(uuid, date) to authenticated;

-- 5. auto_close_periods: snapshot every employee closed ---------------------
create or replace function public.auto_close_periods()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today_wib date;
  is_last_day boolean;
  day_of_month smallint;
  org_record record;
  emp_record record;
  target_period date;
  employees_closed integer := 0;
  orgs_processed integer := 0;
  report jsonb := '[]'::jsonb;
begin
  today_wib := (now() at time zone 'Asia/Jakarta')::date;
  day_of_month := extract(day from today_wib)::smallint;
  is_last_day := date_trunc('month', today_wib + interval '1 day')::date
                 <> date_trunc('month', today_wib)::date;

  for org_record in
    select id, pay_day_of_month
    from public.organizations
    where
      (pay_day_of_month = day_of_month and pay_day_of_month between 1 and 28)
      or (pay_day_of_month = 0 and is_last_day)
  loop
    orgs_processed := orgs_processed + 1;

    if org_record.pay_day_of_month = 0 then
      target_period := date_trunc('month', today_wib)::date;
    else
      target_period := (date_trunc('month', today_wib) - interval '1 month')::date;
    end if;

    for emp_record in
      select id from public.employees where org_id = org_record.id
    loop
      if exists (
        select 1 from public.pay_adjustments
        where employee_id = emp_record.id
          and period_month = target_period
          and paid_out_at is not null
      ) then
        continue;
      end if;

      update public.pay_adjustments
      set paid_out_at = now()
      where employee_id = emp_record.id
        and period_month = target_period
        and paid_out_at is null;

      -- Snapshot every employee closed (even those with no adjustments — this
      -- freezes their base/allowance for the month).
      perform public._settle_pay_period(emp_record.id, target_period);

      employees_closed := employees_closed + 1;
    end loop;

    report := report || jsonb_build_object(
      'org_id', org_record.id,
      'period_month', target_period,
      'pay_day_of_month', org_record.pay_day_of_month
    );
  end loop;

  return jsonb_build_object(
    'today_wib', today_wib,
    'orgs_processed', orgs_processed,
    'employees_closed', employees_closed,
    'closures', report
  );
end;
$$;

revoke all on function public.auto_close_periods() from public, anon, authenticated;
grant execute on function public.auto_close_periods() to service_role;

-- 6. portal_home: use the frozen snapshot for closed periods ----------------
-- Reproduced from 126 with one change: base/allowance come from the settlement
-- when the period is settled (adjustment_net is unaffected — the freeze guard
-- blocks new adjustments after close, so the live sum already equals the frozen
-- net).
create or replace function public.portal_home(
  emp_slug text,
  emp_token text,
  target_month date
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
  settlement public.pay_period_settlements%rowtype;
  period date;
  period_end date;
  is_current_period boolean;
  emp_departments text[];
  emp_primary_dept text;
  eff_base integer;
  eff_allow integer;
  has_pay boolean;
  result jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org from public.organizations where id = emp.org_id;

  period := coalesce(target_month, public.current_period_month());
  period_end := (period + interval '1 month - 1 day')::date;
  is_current_period := period = public.current_period_month();

  select coalesce(
    array_agg(d.name order by ed.is_primary desc, d.name asc),
    array[]::text[]
  )
  into emp_departments
  from public.employee_departments ed
  join public.company_departments d on d.id = ed.department_id
  where ed.employee_id = emp.id;

  select d.name into emp_primary_dept
  from public.employee_departments ed
  join public.company_departments d on d.id = ed.department_id
  where ed.employee_id = emp.id and ed.is_primary
  limit 1;

  select c.* into active_contract from public.contracts c
  where c.employee_id = emp.id and c.status = 'active'
    and (c.start_date is null or c.start_date <= period_end)
    and (
      not exists (
        select 1 from public.contract_signatures cs
        where cs.contract_id = c.id
          and cs.version_number = c.current_version
          and cs.signer_role = 'employer'
      )
      or (
        exists (
          select 1 from public.contract_signatures cs
          where cs.contract_id = c.id
            and cs.version_number = c.current_version
            and cs.signer_role = 'employer'
        )
        and exists (
          select 1 from public.contract_signatures cs
          where cs.contract_id = c.id
            and cs.version_number = c.current_version
            and cs.signer_role = 'employee'
        )
      )
    )
  order by c.updated_at desc
  limit 1;

  -- Frozen snapshot for a closed period, if any.
  select * into settlement from public.pay_period_settlements
  where employee_id = emp.id and period_month = period;

  if settlement.id is not null then
    eff_base := settlement.base_idr;
    eff_allow := settlement.allowance_idr;
    has_pay := true;
  elsif active_contract.id is not null then
    eff_base := active_contract.base_wage_idr;
    eff_allow := active_contract.allowance_idr;
    has_pay := true;
  else
    has_pay := false;
  end if;

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id', emp.id,
      'name', emp.name,
      'photo_url', emp.photo_url,
      'department', emp_primary_dept,
      'departments', to_jsonb(emp_departments),
      'created_at', emp.created_at
    ),
    'org', jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'logo_url', org.logo_url
    ),
    'contract', case
      when not has_pay then null
      else jsonb_build_object(
        'base_wage_idr', eff_base,
        'allowance_idr', eff_allow,
        'hours_per_day', active_contract.hours_per_day,
        'days_per_week', active_contract.days_per_week
      )
    end,
    'period_month', period,
    'is_current_period', is_current_period,
    'adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_idr', amount_idr,
          'reason', reason,
          'created_at', created_at,
          'paid_out_at', paid_out_at
        )
        order by created_at desc
      )
      from public.pay_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'adjustment_net', coalesce((
      select sum(amount_idr)::integer
      from public.pay_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'adjustment_frozen', exists (
      select 1 from public.pay_adjustments
      where employee_id = emp.id
        and period_month = period
        and paid_out_at is not null
    ),
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
        and (
          target_month is null
          or date_trunc('month', u.unlocked_at at time zone 'Asia/Jakarta')::date = target_month
        )
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_home(text, text, date) to anon, authenticated;
