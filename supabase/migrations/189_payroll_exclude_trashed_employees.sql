-- Payroll: exclude soft-deleted (trashed) employees from payroll.
--
-- Employees are soft-deleted: trash_employee (104/148) stamps deleted_at and the
-- row lingers in the trash for 30 days before the purge cron (105) hard-deletes
-- it. Every *normal* query is shielded by the RLS policy on employees, which is
-- `using (org_id = ... and deleted_at is null)` (103) — that's why a trashed
-- employee vanishes from the Employees list immediately.
--
-- But the payroll RPCs are SECURITY DEFINER, so they run as the function owner
-- and BYPASS RLS. They therefore have to filter deleted_at themselves. 182
-- narrowed them to lifecycle_stage in ('active','separated') to keep recruits
-- out, but never added the deleted_at guard — so a trashed employee still leaked
-- into preview_payroll's roster + totals, the payroll_trend chart, and (worst)
-- run_payroll's settle loop, which would freeze pay for someone you deleted.
--
-- This recreates all three verbatim from 182 with `deleted_at is null` added to
-- every employee selection (5 spots). Nothing else changes; signatures are
-- identical. (The separate "trashed *contract* still reads as active" gap in the
-- contract joins is intentionally left for its own change — fixing it here alone
-- would desync preview from freeze.)

-- ─── preview_payroll ────────────────────────────────────────────────────────
create or replace function public.preview_payroll(p_period date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role   text;
  caller_org    uuid;
  v_rows        jsonb;
  v_total       bigint;
  v_settled     int;
  v_open        int;
  v_no_contract int;
  v_bonus       bigint;
  v_deduction   bigint;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', r.employee_id,
      'name', r.name,
      'photo_url', r.photo_url,
      'settled', r.settled,
      'has_active_contract', r.contract_id is not null,
      'base_idr', r.base_idr,
      'allowance_idr', r.allowance_idr,
      'adjustment_net_idr', r.adjustment_net_idr,
      'payout_idr', r.payout_idr
    ) order by r.name),
    '[]'::jsonb),
    coalesce(sum(r.payout_idr), 0),
    count(*) filter (where r.settled),
    count(*) filter (where not r.settled),
    count(*) filter (where r.contract_id is null)
  into v_rows, v_total, v_settled, v_open, v_no_contract
  from (
    select
      e.id as employee_id, e.name, e.photo_url,
      ac.id as contract_id,
      (s.id is not null) as settled,
      coalesce(s.base_idr, coalesce(ac.base_wage_idr, 0)) as base_idr,
      coalesce(s.allowance_idr, coalesce(ac.allowance_idr, 0)) as allowance_idr,
      coalesce(s.adjustment_net_idr, coalesce(adj.net, 0)) as adjustment_net_idr,
      coalesce(s.payout_idr,
        greatest(0, coalesce(ac.base_wage_idr, 0) + coalesce(ac.allowance_idr, 0) + coalesce(adj.net, 0))) as payout_idr
    from public.employees e
    left join lateral (
      select c.id, c.base_wage_idr, c.allowance_idr
      from public.contracts c
      where c.employee_id = e.id and c.status = 'active'
      order by c.updated_at desc limit 1
    ) ac on true
    left join public.pay_period_settlements s
      on s.employee_id = e.id and s.period_month = p_period
    left join lateral (
      select sum(amount_idr) as net
      from public.pay_adjustments
      where employee_id = e.id and period_month = p_period
    ) adj on true
    where e.org_id = caller_org
      and e.deleted_at is null
      and e.lifecycle_stage in ('active', 'separated')
  ) r;

  -- Gross adjustment split for the org/period, restricted to real employees so
  -- it reconciles with the visible rows (signed: bonuses ≥ 0, deductions ≤ 0).
  select
    coalesce(sum(pa.amount_idr) filter (where pa.amount_idr > 0), 0),
    coalesce(sum(pa.amount_idr) filter (where pa.amount_idr < 0), 0)
  into v_bonus, v_deduction
  from public.pay_adjustments pa
  join public.employees e on e.id = pa.employee_id
  where pa.org_id = caller_org and pa.period_month = p_period
    and e.deleted_at is null
    and e.lifecycle_stage in ('active', 'separated');

  return jsonb_build_object(
    'period', p_period,
    'rows', v_rows,
    'total_payout_idr', v_total,
    'total_bonus_idr', v_bonus,
    'total_deduction_idr', v_deduction,
    'counts', jsonb_build_object(
      'total', v_settled + v_open,
      'settled', v_settled,
      'open', v_open,
      'no_contract', v_no_contract
    )
  );
end;
$$;

revoke all on function public.preview_payroll(date) from public, anon;
grant execute on function public.preview_payroll(date) to authenticated;

-- ─── payroll_trend ──────────────────────────────────────────────────────────
create or replace function public.payroll_trend(p_period date, p_months int default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
  v_months    int := greatest(1, least(coalesce(p_months, 6), 24));
  v_result    jsonb;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'Period must be the first day of a month';
  end if;

  with months as (
    select (date_trunc('month', p_period) - (gs || ' months')::interval)::date as m
    from generate_series(0, v_months - 1) as gs
  ),
  payouts as (
    select mo.m as period,
      coalesce(sum(
        coalesce(s.payout_idr,
          greatest(0, coalesce(ac.base_wage_idr, 0) + coalesce(ac.allowance_idr, 0) + coalesce(adj.net, 0)))
      ), 0) as total_payout
    from months mo
    cross join public.employees e
    left join lateral (
      select c.base_wage_idr, c.allowance_idr
      from public.contracts c
      where c.employee_id = e.id and c.status = 'active'
      order by c.updated_at desc limit 1
    ) ac on true
    left join public.pay_period_settlements s
      on s.employee_id = e.id and s.period_month = mo.m
    left join lateral (
      select sum(amount_idr) as net
      from public.pay_adjustments
      where employee_id = e.id and period_month = mo.m
    ) adj on true
    where e.org_id = caller_org
      and e.deleted_at is null
      and e.lifecycle_stage in ('active', 'separated')
    group by mo.m
  ),
  adj_split as (
    select pa.period_month as period,
      coalesce(sum(pa.amount_idr) filter (where pa.amount_idr > 0), 0) as total_bonus,
      coalesce(sum(pa.amount_idr) filter (where pa.amount_idr < 0), 0) as total_deduction
    from public.pay_adjustments pa
    join public.employees e on e.id = pa.employee_id
    where pa.org_id = caller_org
      and pa.period_month in (select m from months)
      and e.deleted_at is null
      and e.lifecycle_stage in ('active', 'separated')
    group by pa.period_month
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'period', mo.m,
    'total_payout_idr', coalesce(p.total_payout, 0),
    'total_bonus_idr', coalesce(a.total_bonus, 0),
    'total_deduction_idr', coalesce(a.total_deduction, 0)
  ) order by mo.m), '[]'::jsonb)
  into v_result
  from months mo
  left join payouts p on p.period = mo.m
  left join adj_split a on a.period = mo.m;

  return v_result;
end;
$$;

revoke all on function public.payroll_trend(date, int) from public, anon;
grant execute on function public.payroll_trend(date, int) to authenticated;

-- ─── run_payroll ────────────────────────────────────────────────────────────
create or replace function public.run_payroll(p_period date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
  emp_record  record;
  v_run       int := 0;
  v_skipped   int := 0;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to run payroll';
  end if;

  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'Period must be the first day of a month';
  end if;

  for emp_record in
    select id from public.employees
    where org_id = caller_org
      and deleted_at is null
      and lifecycle_stage in ('active', 'separated')
  loop
    -- Already frozen for this period → idempotent skip.
    if exists (
      select 1 from public.pay_period_settlements
      where employee_id = emp_record.id and period_month = p_period
    ) or exists (
      select 1 from public.pay_adjustments
      where employee_id = emp_record.id and period_month = p_period and paid_out_at is not null
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Nothing to settle (no active contract and no adjustments) → don't create
    -- an empty settlement; not counted as run.
    if not exists (
      select 1 from public.contracts
      where employee_id = emp_record.id and status = 'active'
    ) and not exists (
      select 1 from public.pay_adjustments
      where employee_id = emp_record.id and period_month = p_period
    ) then
      continue;
    end if;

    update public.pay_adjustments set paid_out_at = now()
    where employee_id = emp_record.id and period_month = p_period and paid_out_at is null;

    perform public._settle_pay_period(emp_record.id, p_period);
    v_run := v_run + 1;
  end loop;

  return jsonb_build_object(
    'period', p_period,
    'employees_run', v_run,
    'employees_skipped', v_skipped
  );
end;
$$;

revoke all on function public.run_payroll(date) from public, anon;
grant execute on function public.run_payroll(date) to authenticated;
