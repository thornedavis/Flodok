-- Payroll summary — gross bonus/deduction totals.
--
-- The payroll page header used to surface count cards (settled/open/no-contract).
-- It now shows a money breakdown that reconciles to the headline total:
--   Fixed pay (base + allowances) + Bonuses − Deductions = Total payout
--
-- Fixed pay is derivable client-side from the per-row base+allowance, but the
-- bonus/deduction split is NOT: the roster only carries the *net* adjustment per
-- employee (adjustment_net_idr), so an employee with both overtime (+) and
-- unpaid leave (−) in one month would hide one side. This recreates
-- preview_payroll to also return the org-wide gross positive and gross negative
-- adjustment sums for the period. Everything else (rows, total_payout, counts)
-- is unchanged — counts still drive the run/download gating in the UI.
--
-- Gross split is summed from pay_adjustments (signed amount_idr) scoped to the
-- caller's org + period. These rows persist after a freeze (paid_out_at is set,
-- not deleted), so the totals stay correct for settled and open employees alike.

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
  ) r;

  -- Gross adjustment split for the org/period (signed: bonuses ≥ 0, deductions ≤ 0).
  select
    coalesce(sum(amount_idr) filter (where amount_idr > 0), 0),
    coalesce(sum(amount_idr) filter (where amount_idr < 0), 0)
  into v_bonus, v_deduction
  from public.pay_adjustments
  where org_id = caller_org and period_month = p_period;

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
