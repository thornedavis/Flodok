-- Phase 2 of the compensation-model simplification.
--
-- The allowance_adjustments ledger is retired. Credits become the sole
-- in-period lever for admins: deductions can drive the credit_net negative,
-- and the UI renders the negative portion as a visual shrink of the
-- employee's allowance segment (capped at zero allowance — base wage is
-- never touched).
--
-- Changes:
--   1. Rebuild deduct_credits_cascade to insert a single negative
--      credit_adjustments row. The floor check is now expressed purely in
--      credit space: creditNet can't drop below -divisor (which would
--      represent "allowance fully eaten").
--   2. Drop allowance_adjustments table, freeze trigger, RLS.
--   3. Strip allowance_adjustments/allowance_sum from portal_home.
--   4. Rename close_credit_period → close_period (same signature) now that
--      it closes both credits and bonuses. The old name is dropped.
--
-- No historical data is preserved — per the product decision, the old
-- allowance adjustments from development are discarded.
--
-- This migration assumes 031 and 033 have already run.
-- ---------------------------------------------------------------------------

-- 1. Rebuild deduct_credits_cascade ------------------------------------------
-- The new implementation writes a single negative credit row. Floor:
-- resulting credit_net cannot fall below -credits_divisor (i.e. the point
-- at which the employee's allowance would have been fully eaten at the
-- current rate). The client renders this as a shrinking allowance arc.

create or replace function public.deduct_credits_cascade(
  target_employee_id uuid,
  deduction_credits integer,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid;
  caller_role text;
  caller_org uuid;
  target_org uuid;
  period date;
  current_net integer;
  resulting_net integer;
  org_divisor integer;
  allowance integer;
  overflow_credits integer;
  overflow_idr integer;
begin
  caller_id := auth.uid();

  if deduction_credits <= 0 then
    raise exception 'Deduction amount must be positive';
  end if;
  if length(coalesce(reason, '')) < 20 then
    raise exception 'Reason must be at least 20 characters';
  end if;

  select role, org_id into caller_role, caller_org
  from public.users where id = caller_id;

  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized to deduct Credits';
  end if;

  select org_id into target_org
  from public.employees where id = target_employee_id;

  if target_org is null or target_org != caller_org then
    raise exception 'Employee not found in your organization';
  end if;

  period := public.current_period_month();

  if exists (
    select 1 from public.credit_adjustments
    where employee_id = target_employee_id
      and period_month = period
      and paid_out_at is not null
  ) then
    raise exception 'Credit period % has been cashed out and is frozen', period;
  end if;

  select coalesce(sum(amount), 0)::integer into current_net
  from public.credit_adjustments
  where employee_id = target_employee_id
    and period_month = period;

  select credits_divisor into org_divisor
  from public.organizations where id = caller_org;

  select coalesce(allowance_idr, 0) into allowance
  from public.contracts
  where employee_id = target_employee_id and status = 'active'
  order by updated_at desc
  limit 1;

  if allowance is null or allowance = 0 or org_divisor is null or org_divisor = 0 then
    raise exception 'Cannot deduct Credits: no active contract with allowance set';
  end if;

  resulting_net := current_net - deduction_credits;

  -- Floor: the negative portion of credit_net, converted to IDR, cannot
  -- exceed the baseline allowance. In credit terms, resulting_net cannot
  -- drop below -org_divisor.
  if resulting_net < -org_divisor then
    raise exception 'Deduction exceeds available allowance headroom (floor at -% credits)', org_divisor;
  end if;

  insert into public.credit_adjustments (
    org_id, employee_id, period_month, amount, reason, awarded_by
  ) values (
    caller_org, target_employee_id, period, -deduction_credits, reason, caller_id
  );

  -- Report how the deduction split visually: the portion that canceled
  -- positive credits, vs the portion that will show as allowance shrink.
  if current_net > 0 then
    if deduction_credits <= current_net then
      overflow_credits := 0;
    else
      overflow_credits := deduction_credits - current_net;
    end if;
  else
    overflow_credits := deduction_credits;
  end if;

  overflow_idr := case
    when overflow_credits > 0
      then round(overflow_credits::numeric * allowance / org_divisor)::integer
    else 0
  end;

  return jsonb_build_object(
    'credits_applied', deduction_credits - overflow_credits,
    'overflow_credits', overflow_credits,
    'overflow_idr', overflow_idr
  );
end;
$$;

grant execute on function public.deduct_credits_cascade(uuid, integer, text) to authenticated;

-- 2. Drop allowance_adjustments ---------------------------------------------
-- Indexes, trigger, function, and table all go together. RLS policies are
-- removed implicitly with the table drop.

drop trigger if exists allowance_adjustments_floor on public.allowance_adjustments;
drop function if exists public.tg_allowance_adjustments_floor();
drop table if exists public.allowance_adjustments;

-- 3. Rebuild portal_home without allowance adjustments ----------------------

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

-- 4. Rename close_credit_period → close_period ------------------------------
-- Same signature. Bonus freeze logic carried over from migration 033.
-- Credit payout now clamps at zero per row (negative credit rows don't
-- owe the employee anything on pay day) but the IDR total passed back
-- to the caller can still be computed as net × rate since the floor
-- check in deduct_credits_cascade prevents negative overall payout.

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
  net_credits integer;
  org_divisor integer;
  allowance integer;
  credit_payout integer;
  bonus_payout integer;
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
    select 1 from public.credit_adjustments
    where employee_id = target_employee_id
      and period_month = target_period_month
      and paid_out_at is not null
  ) then
    raise exception 'Period has already been closed';
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

  -- Per-row snapshot. Positive rows pay out IDR; negative rows shrink the
  -- allowance at payout time (payout_idr stored as negative) so the final
  -- stamped IDR on the period matches what the employee saw in the ring.
  update public.credit_adjustments
  set payout_idr = case
        when org_divisor > 0 and allowance > 0
          then round(amount::numeric * allowance / org_divisor)::integer
        else 0
      end,
      paid_out_at = now()
  where employee_id = target_employee_id
    and period_month = target_period_month;

  credit_payout := case
    when net_credits <> 0 and org_divisor > 0 and allowance > 0
      then round(net_credits::numeric * allowance / org_divisor)::integer
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

  return greatest(credit_payout, -allowance) + bonus_payout;
end;
$$;

grant execute on function public.close_period(uuid, date) to authenticated;

drop function if exists public.close_credit_period(uuid, date);
