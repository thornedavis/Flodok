-- Compensation model v3: collapse credits + bonuses into one signed-IDR ledger.
--
-- Replaces the credit_adjustments (points × divisor) and bonus_adjustments
-- (positive IDR) tables with a single `pay_adjustments` ledger whose amount is
-- signed rupiah: positive = reward (Apresiasi), negative = penalty (Penalti).
-- Net adjustment moves the monthly payout, floored at zero (a penalty may eat
-- the allowance AND the base wage down to Rp 0 — no minimum-wage guarantee).
--
-- Credits live on ONLY as a derived, display-only leaderboard score:
--   credits = round(net_idr / organizations.credits_divisor)
-- so colleagues see a "credit score", never the actual rupiah. Ranking by
-- net-IDR is identical to ranking by credits (monotonic), so leaderboard
-- achievements are unaffected.
--
-- Reused org columns (no schema churn): credits_enabled = feature toggle,
-- credits_divisor = hidden Rp→credit rate, max_bonus_idr = max per adjustment.
-- bonuses_enabled / max_credit_per_award are simply no longer read.
--
-- Dev credit/bonus rows are discarded (per the migration-034 precedent).
-- ---------------------------------------------------------------------------

-- 1. New ledger --------------------------------------------------------------

create table if not exists public.pay_adjustments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  period_month  date not null default public.current_period_month(),
  amount_idr    integer not null,
  reason        text not null,
  awarded_by    uuid not null references public.users(id),
  paid_out_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint pay_adjustments_amount_nonzero check (amount_idr <> 0),
  constraint pay_adjustments_reason_length check (length(reason) >= 3),
  constraint pay_adjustments_period_first_of_month
    check (period_month = date_trunc('month', period_month)::date)
);

create index if not exists pay_adjustments_emp_period_idx
  on public.pay_adjustments (employee_id, period_month);
create index if not exists pay_adjustments_org_period_idx
  on public.pay_adjustments (org_id, period_month);

alter table public.pay_adjustments enable row level security;

create policy "Members read pay adjustments in own org"
  on public.pay_adjustments for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'manager')
  );

create policy "Admins insert pay adjustments in own org"
  on public.pay_adjustments for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
    and awarded_by = auth.uid()
  );

-- Freeze guard: once a period is closed (paid_out_at set), no further rows.
create or replace function public.tg_pay_adjustments_freeze()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.pay_adjustments
    where employee_id = new.employee_id
      and period_month = new.period_month
      and paid_out_at is not null
  ) then
    raise exception 'Pay period % for employee % has been closed and is frozen',
      new.period_month, new.employee_id;
  end if;
  return new;
end;
$$;

drop trigger if exists pay_adjustments_freeze on public.pay_adjustments;
create trigger pay_adjustments_freeze
  before insert on public.pay_adjustments
  for each row execute function public.tg_pay_adjustments_freeze();

-- 2. Settlement (close_period / auto_close_periods) --------------------------
-- No more credit→IDR conversion. Just freeze the period; total payout is
-- base + allowance + net adjustment, floored at zero.

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
  net_adj integer;
  base integer;
  allowance integer;
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

  select coalesce(sum(amount_idr), 0)::integer into net_adj
  from public.pay_adjustments
  where employee_id = target_employee_id
    and period_month = target_period_month;

  select coalesce(base_wage_idr, 0), coalesce(allowance_idr, 0)
  into base, allowance
  from public.contracts
  where employee_id = target_employee_id and status = 'active'
  order by updated_at desc
  limit 1;

  return greatest(0, coalesce(base, 0) + coalesce(allowance, 0) + net_adj);
end;
$$;

grant execute on function public.close_period(uuid, date) to authenticated;

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

-- 3. Admin roster ------------------------------------------------------------
-- One signed `adjustment_idr` net per employee (plus frozen flag), keeping the
-- achievements + departments aggregation from 124.

create or replace function public.admin_rewards_roster(target_period_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  caller_role text;
  caller_org uuid;
  period date;
  result jsonb;
begin
  caller_id := auth.uid();

  select role, org_id into caller_role, caller_org
  from public.users where id = caller_id;

  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  period := coalesce(target_period_month, public.current_period_month());

  with adj_per_employee as (
    select
      pa.employee_id,
      sum(pa.amount_idr)::integer as adjustment_idr,
      bool_or(pa.paid_out_at is not null) as frozen
    from public.pay_adjustments pa
    where pa.org_id = caller_org
      and pa.period_month = period
    group by pa.employee_id
  ),
  achievement_counts as (
    select
      u.employee_id,
      count(*)::integer as achievements_count
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_id
    where d.org_id = caller_org
    group by u.employee_id
  ),
  top_badges as (
    select
      employee_id,
      jsonb_agg(
        jsonb_build_object('name', name, 'icon', icon, 'unlocked_at', unlocked_at)
        order by rn asc
      ) as top_achievements
    from (
      select
        u.employee_id, d.name, d.icon, u.unlocked_at,
        row_number() over (
          partition by u.employee_id
          order by d.is_featured desc, u.unlocked_at desc
        ) as rn
      from public.achievement_unlocks u
      join public.achievement_definitions d on d.id = u.achievement_id
      where d.org_id = caller_org
    ) ranked
    where rn <= 3
    group by employee_id
  ),
  departments_per_employee as (
    select
      ed.employee_id,
      coalesce(jsonb_agg(d.name order by ed.is_primary desc, d.name asc), '[]'::jsonb) as departments
    from public.employee_departments ed
    join public.company_departments d on d.id = ed.department_id
    join public.employees e on e.id = ed.employee_id
    where e.org_id = caller_org
    group by ed.employee_id
  ),
  rows as (
    select
      e.id as employee_id,
      e.name,
      e.photo_url,
      coalesce(dpe.departments, '[]'::jsonb) as departments,
      coalesce(a.adjustment_idr, 0) as adjustment_idr,
      coalesce(a.frozen, false) as adjustment_frozen,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements
    from public.employees e
    left join adj_per_employee a on a.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges tb on tb.employee_id = e.id
    left join departments_per_employee dpe on dpe.employee_id = e.id
    where e.org_id = caller_org
  )
  select jsonb_build_object(
    'period_month', period,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.name asc)
      from rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_rewards_roster(date) to authenticated;

-- 4. Portal home -------------------------------------------------------------
-- Single adjustments stream (signed Rp) + net + frozen flag, replacing the
-- credit/bonus split. Contract-gate + departments logic preserved from 086.

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
  period date;
  period_end date;
  is_current_period boolean;
  emp_departments text[];
  emp_primary_dept text;
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
      when active_contract.id is null then null
      else jsonb_build_object(
        'base_wage_idr', active_contract.base_wage_idr,
        'allowance_idr', active_contract.allowance_idr,
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

-- 5. Leaderboard (derived credits) -------------------------------------------
-- Rank by net rupiah; expose `net_credits = round(net_idr / credits_divisor)`
-- so the portal shows a credit score, never the underlying money.

create or replace function public.portal_leaderboard(
  emp_slug text,
  emp_token text,
  period_kind text default 'month'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.employees%rowtype;
  org_row public.organizations%rowtype;
  period_start date;
  period_label text;
  rate integer;
  result jsonb;
begin
  if period_kind not in ('month', 'quarter', 'all-time') then
    raise exception 'Invalid period_kind: %', period_kind;
  end if;

  select * into viewer from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if viewer.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org_row from public.organizations where id = viewer.org_id;
  rate := greatest(coalesce(org_row.credits_divisor, 1000), 1);

  if period_kind = 'month' then
    period_start := public.current_period_month();
    period_label := to_char(period_start, 'YYYY-MM');
  elsif period_kind = 'quarter' then
    period_start := date_trunc('quarter', (now() at time zone 'Asia/Jakarta')::date)::date;
    period_label := to_char(period_start, 'YYYY-"Q"Q');
  else
    period_start := null;
    period_label := 'all-time';
  end if;

  with net_per_employee as (
    select
      pa.employee_id,
      sum(pa.amount_idr)::integer as net_idr
    from public.pay_adjustments pa
    where pa.org_id = viewer.org_id
      and (period_start is null or pa.period_month >= period_start)
    group by pa.employee_id
  ),
  achievement_counts as (
    select u.employee_id, count(*)::integer as achievements_count
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_id
    where d.org_id = viewer.org_id
    group by u.employee_id
  ),
  top_badges_per_employee as (
    select
      employee_id,
      jsonb_agg(
        jsonb_build_object('name', name, 'icon', icon, 'unlocked_at', unlocked_at, 'is_featured', is_featured)
        order by rn asc
      ) as top_achievements
    from (
      select
        u.employee_id, d.name, d.icon, d.is_featured, u.unlocked_at,
        row_number() over (
          partition by u.employee_id
          order by d.is_featured desc, u.unlocked_at desc
        ) as rn
      from public.achievement_unlocks u
      join public.achievement_definitions d on d.id = u.achievement_id
      where d.org_id = viewer.org_id
    ) ranked
    where rn <= 3
    group by employee_id
  ),
  departments_per_employee as (
    select
      ed.employee_id,
      coalesce(jsonb_agg(d.name order by ed.is_primary desc, d.name asc), '[]'::jsonb) as departments
    from public.employee_departments ed
    join public.company_departments d on d.id = ed.department_id
    group by ed.employee_id
  ),
  candidates as (
    select e.id as employee_id
    from public.employees e
    join net_per_employee n on n.employee_id = e.id
    where e.org_id = viewer.org_id
    union
    select viewer.id
  ),
  rows as (
    select
      e.id as employee_id,
      e.name,
      e.photo_url,
      coalesce(dpe.departments, '[]'::jsonb) as departments,
      round(coalesce(n.net_idr, 0)::numeric / rate)::integer as net_credits,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements
    from candidates c
    join public.employees e on e.id = c.employee_id
    left join net_per_employee n on n.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges_per_employee tb on tb.employee_id = e.id
    left join departments_per_employee dpe on dpe.employee_id = e.id
    order by
      coalesce(n.net_idr, 0) desc,
      coalesce(ac.achievements_count, 0) desc,
      e.name asc
  )
  select jsonb_build_object(
    'period_kind', period_kind,
    'period_label', period_label,
    'viewer_employee_id', viewer.id,
    'org', jsonb_build_object('id', org_row.id, 'name', org_row.name),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.net_credits desc, rows.achievements_count desc, rows.name asc)
      from rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_leaderboard(text, text, text) to anon, authenticated;

-- 6. Leaderboard snapshot (achievements) -------------------------------------
-- Score = net rupiah for the month; ranking is identical to ranking by the
-- derived credits, so Podium / Number One / Reigning Champion are unaffected.

create or replace function public.take_monthly_leaderboard_snapshot(p_period_start date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end date;
  v_inserted int;
begin
  v_period_end := (p_period_start + interval '1 month' - interval '1 day')::date;

  with ranked as (
    select
      e.org_id,
      e.id as employee_id,
      sum(pa.amount_idr) as net_score,
      rank() over (
        partition by e.org_id
        order by sum(pa.amount_idr) desc
      ) as employee_rank
    from public.employees e
    join public.pay_adjustments pa on pa.employee_id = e.id
    join public.organizations o on o.id = e.org_id
    where e.status in ('trial', 'active')
      and pa.period_month = p_period_start
      and o.badges_enabled = true
    group by e.org_id, e.id
    having sum(pa.amount_idr) > 0
  )
  insert into public.leaderboard_snapshots
    (org_id, period_type, period_start, period_end, employee_id, rank, score)
  select org_id, 'month', p_period_start, v_period_end, employee_id, employee_rank, net_score
  from ranked
  on conflict (org_id, period_type, period_start, employee_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- 7. First-earnings achievement evaluator ------------------------------------
-- Legacy trigger_rule sources (credit_adjustments / bonus_adjustments) now all
-- resolve against pay_adjustments: "first positive adjustment" or "first
-- frozen adjustment".

create or replace function public.evaluate_first_event_for_employee(p_employee_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_org_id uuid;
  rec record;
  v_first_at timestamptz;
  v_delay_hours int;
  v_unlock_at timestamptz;
  v_inserted int;
  v_unlocked int := 0;
begin
  select e.status, e.org_id into v_status, v_org_id
  from public.employees e
  where e.id = p_employee_id;

  if v_status is null or v_status not in ('trial', 'active') then
    return 0;
  end if;

  for rec in
    select id, trigger_rule
    from public.achievement_definitions
    where org_id = v_org_id
      and is_active = true
      and trigger_type = 'auto'
      and trigger_rule->>'type' = 'first_event'
  loop
    v_delay_hours := coalesce((rec.trigger_rule->>'delay_hours')::int, 0);
    v_first_at := null;

    if rec.trigger_rule->>'source' in ('credit_adjustments', 'bonus_adjustments', 'pay_adjustments') then
      if rec.trigger_rule->>'filter' = 'paid_out_at IS NOT NULL' then
        select min(paid_out_at) into v_first_at
        from public.pay_adjustments
        where employee_id = p_employee_id and paid_out_at is not null;
      else
        select min(created_at) into v_first_at
        from public.pay_adjustments
        where employee_id = p_employee_id and amount_idr > 0;
      end if;
    end if;

    if v_first_at is null then
      continue;
    end if;

    v_unlock_at := v_first_at + (v_delay_hours || ' hours')::interval;

    if now() >= v_unlock_at then
      insert into public.achievement_unlocks (employee_id, achievement_id, unlocked_at)
      select p_employee_id, rec.id, v_unlock_at
      where not exists (
        select 1 from public.achievement_unlocks
        where employee_id = p_employee_id
          and achievement_id = rec.id
          and awarded_by is null
      );
      get diagnostics v_inserted = row_count;
      v_unlocked := v_unlocked + v_inserted;
    end if;
  end loop;

  return v_unlocked;
end;
$$;

-- 8. Drop the old model ------------------------------------------------------

drop function if exists public.deduct_credits_cascade(uuid, integer, text);
drop table if exists public.credit_adjustments cascade;
drop table if exists public.bonus_adjustments cascade;
drop function if exists public.tg_credit_adjustments_floor();
drop function if exists public.tg_bonus_adjustments_freeze();
