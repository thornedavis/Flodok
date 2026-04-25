-- Cascade deduction: Credits → Allowance overflow
--
-- When an admin wants to dock an employee for an error or policy breach, the
-- intended behavior is:
--   1. First, consume the employee's current positive Credits balance for the
--      period (bringing it exactly to zero if the deduction is big enough).
--   2. Any remaining deduction that exceeds the Credits balance spills over
--      into an allowance deduction. The spillover is converted from Credits
--      units to IDR using `allowance_idr / credits_divisor`.
--   3. The existing allowance floor trigger enforces that this spillover
--      cannot push the effective tunjangan below zero — if it would, the
--      whole RPC fails atomically and nothing is written.
--
-- This mirrors the product rule that base wage is untouchable but allowance
-- is elastic, and that "losing credits you haven't earned yet" maps to a real
-- pay reduction on the only layer we're allowed to reduce.
--
-- Awards (positive Credits adjustments) do NOT go through this function —
-- they stay as a simple insert into credit_adjustments.

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
  credits_to_deduct integer;
  overflow_credits integer;
  overflow_idr integer;
  org_divisor integer;
  allowance integer;
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

  credits_to_deduct := least(greatest(current_net, 0), deduction_credits);
  overflow_credits := deduction_credits - credits_to_deduct;

  if credits_to_deduct > 0 then
    insert into public.credit_adjustments (
      org_id, employee_id, period_month, amount, reason, awarded_by
    ) values (
      caller_org, target_employee_id, period, -credits_to_deduct, reason, caller_id
    );
  end if;

  overflow_idr := 0;

  if overflow_credits > 0 then
    select credits_divisor into org_divisor
    from public.organizations where id = caller_org;

    select coalesce(allowance_idr, 0) into allowance
    from public.contracts
    where employee_id = target_employee_id and status = 'active'
    order by updated_at desc
    limit 1;

    if allowance is null or allowance = 0 or org_divisor is null or org_divisor = 0 then
      raise exception 'Cannot spill Credits deduction into allowance: no active contract with allowance set';
    end if;

    overflow_idr := round(overflow_credits::numeric * allowance / org_divisor)::integer;

    -- The existing allowance floor trigger will reject this insert if the
    -- resulting tunjangan would drop below zero, rolling back the whole
    -- transaction (including any credits insert above).
    insert into public.allowance_adjustments (
      org_id, employee_id, period_month, amount_idr, reason, awarded_by
    ) values (
      caller_org,
      target_employee_id,
      period,
      -overflow_idr,
      reason || ' (overflow from Credits deduction)',
      caller_id
    );
  end if;

  return jsonb_build_object(
    'credits_applied', credits_to_deduct,
    'overflow_credits', overflow_credits,
    'overflow_idr', overflow_idr
  );
end;
$$;

grant execute on function public.deduct_credits_cascade(uuid, integer, text) to authenticated;
