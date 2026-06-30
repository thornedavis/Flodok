-- Payroll analytics — monthly trend for the payroll page.
--
-- Feeds the "vs last month" summary tile and the expandable analytics panel
-- (total-payout trend + bonuses/deductions diverging bars). Returns a compact
-- ordered array (oldest → newest) of per-month totals for the last p_months
-- ending at p_period — one round-trip, no per-employee rows.
--
-- Payout per month uses the SAME blend as preview_payroll: the frozen
-- settlement when one exists for (employee, month), otherwise the live
-- contract + that month's adjustments. Bonus/deduction are the gross signed
-- splits of pay_adjustments for the org/month (period-stamped, so accurate
-- historically). Owner/admin only.

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
    group by mo.m
  ),
  adj_split as (
    select pa.period_month as period,
      coalesce(sum(amount_idr) filter (where amount_idr > 0), 0) as total_bonus,
      coalesce(sum(amount_idr) filter (where amount_idr < 0), 0) as total_deduction
    from public.pay_adjustments pa
    where pa.org_id = caller_org
      and pa.period_month in (select m from months)
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
