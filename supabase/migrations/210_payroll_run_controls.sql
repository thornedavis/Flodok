-- Payroll run controls — pending-month signal + reopen (undo a freeze).
--
-- Two additions on top of the Phase-5 payroll spine (158) and the per-employee
-- close (144 `close_period`, which already freezes + snapshots one employee):
--
--   1. payroll_pending_months(from, to) — read-only. For each PAST month in the
--      range (never the current or a future month), how many employees still
--      need payroll run: employed that month (active contract started on/before
--      the month-end, or an adjustment that month) AND not yet settled. Powers
--      the orange "needs payroll" dot on the month strip + the sidebar badge.
--
--   2. reopen_period(period, employee?) — OWNER-ONLY. Undoes a freeze for one
--      employee or a whole month: drops the frozen settlement snapshot(s) (their
--      itemised lines cascade) and clears `paid_out_at` so the freeze trigger
--      (126/144) stops firing and bonuses/deductions can be edited again. This
--      is the in-app escape hatch that previously required manual SQL.
--
-- Per-employee FREEZE needs no new function — the UI calls the existing
-- close_period(employee, period).

-- ─── 1. payroll_pending_months ──────────────────────────────────────────────
create or replace function public.payroll_pending_months(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
  v_current   date;
  result      jsonb;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  v_current := public.current_period_month();

  with months as (
    select generate_series(
             date_trunc('month', p_from)::date,
             date_trunc('month', p_to)::date,
             interval '1 month'
           )::date as m
  ),
  past_months as (
    -- Only months that have fully begun before the current period: never nudge
    -- for the in-progress month (that's the page default) or the future.
    select m from months where m < v_current
  ),
  emp as (
    select id from public.employees
    where org_id = caller_org
      and deleted_at is null
      and lifecycle_stage in ('active', 'separated')
  ),
  counted as (
    select
      pm.m as month,
      count(*) filter (
        where
          -- Settleable that month: employed then (active contract that had
          -- started) OR carries an adjustment for the month.
          (
            exists (
              select 1 from public.contracts c
              where c.employee_id = e.id
                and c.status = 'active'
                and c.deleted_at is null
                and (c.start_date is null
                     or c.start_date <= (pm.m + interval '1 month - 1 day')::date)
            )
            or exists (
              select 1 from public.pay_adjustments pa
              where pa.employee_id = e.id and pa.period_month = pm.m
            )
          )
          -- Not already frozen: no settlement snapshot and no paid-out adjustment.
          and not exists (
            select 1 from public.pay_period_settlements s
            where s.employee_id = e.id and s.period_month = pm.m
          )
          and not exists (
            select 1 from public.pay_adjustments pa
            where pa.employee_id = e.id and pa.period_month = pm.m
              and pa.paid_out_at is not null
          )
      )::int as pending
    from past_months pm
    cross join emp e
    group by pm.m
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('month', month, 'pending', pending)
      order by month
    ),
    '[]'::jsonb
  )
  into result
  from counted
  where pending > 0;

  return result;
end;
$$;

revoke all on function public.payroll_pending_months(date, date) from public, anon;
grant execute on function public.payroll_pending_months(date, date) to authenticated;

-- ─── 2. reopen_period ───────────────────────────────────────────────────────
create or replace function public.reopen_period(
  p_period date,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
  target_org  uuid;
  v_count     int;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  -- Reopening finalised pay is a higher privilege than running it: owner-only.
  if caller_role <> 'owner' then
    raise exception 'Only the owner can reopen a pay period';
  end if;

  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'Period must be the first day of a month';
  end if;

  -- A single-employee reopen must target an employee in the caller's org.
  if p_employee_id is not null then
    select org_id into target_org from public.employees where id = p_employee_id;
    if target_org is null or target_org <> caller_org then
      raise exception 'Employee not found in your organization';
    end if;
  end if;

  -- How many employees are we reopening (frozen snapshot OR paid-out adjustment)?
  with victims as (
    select employee_id from public.pay_period_settlements
    where org_id = caller_org and period_month = p_period
      and (p_employee_id is null or employee_id = p_employee_id)
    union
    select employee_id from public.pay_adjustments
    where org_id = caller_org and period_month = p_period and paid_out_at is not null
      and (p_employee_id is null or employee_id = p_employee_id)
  )
  select count(*) into v_count from victims;

  -- Drop the frozen snapshots (settlement lines cascade via FK).
  delete from public.pay_period_settlements
  where org_id = caller_org and period_month = p_period
    and (p_employee_id is null or employee_id = p_employee_id);

  -- Re-open the ledger: clear paid_out_at so the freeze trigger stops firing and
  -- adjustments become editable/deletable again.
  update public.pay_adjustments set paid_out_at = null
  where org_id = caller_org and period_month = p_period and paid_out_at is not null
    and (p_employee_id is null or employee_id = p_employee_id);

  return jsonb_build_object(
    'period', p_period,
    'employees_reopened', v_count
  );
end;
$$;

revoke all on function public.reopen_period(date, uuid) from public, anon;
grant execute on function public.reopen_period(date, uuid) to authenticated;
