-- Payroll page + explicit run — Phase 5.
--
-- Adds:
--   1. pay_period_settlement_lines — itemised breakdown frozen alongside a
--      pay_period_settlements row (base + each allowance component + each
--      period adjustment). Read-only audit/payslip/export detail; never feeds
--      the payout formula (the total already lives on the settlement row).
--   2. _settle_pay_period — EXTENDED to (re)build the itemised lines on every
--      close. Existing payout math is unchanged; this only adds the breakdown.
--   3. preview_payroll(period) — read-only roster for the payroll page (per
--      employee: base/allowance/adjustment-net/payout, settled flag, contract
--      flag). Uses the frozen settlement for closed employees, live contract +
--      adjustments for open ones.
--   4. run_payroll(period) — owner/admin bulk "Freeze & Run" over the whole org
--      for a period. Idempotent (skips already-frozen employees), mirrors the
--      close_period freeze + settle but caller-driven instead of the cron.
--
-- The silent auto_close_periods cron is removed separately (flodok-router). The
-- explicit run is the only close path going forward.

-- ─── 1. Itemised settlement lines ───────────────────────────────────────────
create table if not exists public.pay_period_settlement_lines (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.pay_period_settlements(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  line_type     text not null check (line_type in ('base', 'allowance', 'adjustment')),
  name          text not null,
  kind          text not null check (kind in ('earning', 'deduction', 'benefit')),
  is_fixed      boolean not null default false,
  amount_idr    integer not null,            -- signed: adjustments may be negative
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists pay_period_settlement_lines_settlement_idx
  on public.pay_period_settlement_lines (settlement_id, display_order);

alter table public.pay_period_settlement_lines enable row level security;

-- Read mirrors pay_period_settlements (144): owner/admin in the owning org.
-- Writes happen only through _settle_pay_period (SECURITY DEFINER) — no write policy.
create policy "Admins read settlement lines in own org"
  on public.pay_period_settlement_lines
  for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

comment on table public.pay_period_settlement_lines is
  'Itemised breakdown frozen with a pay_period_settlements row (base + allowance '
  'components + period adjustments). Audit/payslip/export only; never an input '
  'to the payout formula.';

-- ─── 2. _settle_pay_period: snapshot totals AND itemised lines ──────────────
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
  v_org        uuid;
  v_contract   uuid;
  v_base       integer;
  v_allow      integer;
  v_net        integer;
  v_settle     uuid;
  v_comp_count integer;
begin
  select org_id into v_org from public.employees where id = p_employee_id;
  if v_org is null then return; end if;

  select id, coalesce(base_wage_idr, 0), coalesce(allowance_idr, 0)
    into v_contract, v_base, v_allow
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
    settled_at         = now()
  returning id into v_settle;

  -- Rebuild the itemised breakdown for this settlement.
  delete from public.pay_period_settlement_lines where settlement_id = v_settle;

  -- Base wage.
  insert into public.pay_period_settlement_lines
    (settlement_id, org_id, line_type, name, kind, is_fixed, amount_idr, display_order)
  values (v_settle, v_org, 'base', 'Gaji Pokok', 'earning', true, v_base, 0);

  -- Allowance components from the active contract.
  v_comp_count := 0;
  if v_contract is not null then
    insert into public.pay_period_settlement_lines
      (settlement_id, org_id, line_type, name, kind, is_fixed, amount_idr, display_order)
    select v_settle, v_org, 'allowance', name, 'earning', is_fixed, amount_idr, 100 + display_order
    from public.contract_compensation_components
    where contract_id = v_contract and kind = 'earning';
    get diagnostics v_comp_count = row_count;
  end if;

  -- Fallback: contract carries an allowance total but no itemised components
  -- (e.g. seeded directly from a non-itemised template) — emit one line so the
  -- breakdown still sums to the allowance.
  if v_comp_count = 0 and v_allow > 0 then
    insert into public.pay_period_settlement_lines
      (settlement_id, org_id, line_type, name, kind, is_fixed, amount_idr, display_order)
    values (v_settle, v_org, 'allowance', 'Tunjangan', 'earning', false, v_allow, 100);
  end if;

  -- Period adjustments (bonuses/penalties/overtime/unpaid-leave), signed.
  insert into public.pay_period_settlement_lines
    (settlement_id, org_id, line_type, name, kind, is_fixed, amount_idr, display_order)
  select v_settle, v_org, 'adjustment', reason,
         case when amount_idr >= 0 then 'earning' else 'deduction' end,
         false, amount_idr,
         200 + (row_number() over (order by created_at))::int
  from public.pay_adjustments
  where employee_id = p_employee_id and period_month = p_period_month;
end;
$$;

revoke all on function public._settle_pay_period(uuid, date) from public, anon, authenticated;

-- ─── 3. preview_payroll: read-only roster for the payroll page ──────────────
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
  ) r;

  return jsonb_build_object(
    'period', p_period,
    'rows', v_rows,
    'total_payout_idr', v_total,
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

-- ─── 4. run_payroll: explicit owner/admin bulk Freeze & Run ─────────────────
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
    select id from public.employees where org_id = caller_org
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
