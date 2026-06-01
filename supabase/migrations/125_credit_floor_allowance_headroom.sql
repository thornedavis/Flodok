-- Fix: align the credit floor trigger with the post-034 compensation model.
--
-- Migration 034 ("compensation simplification") made credit deductions write a
-- single negative credit_adjustments row, allowing credit_net to fall as low as
-- -credits_divisor (the point at which the employee's allowance would be fully
-- eaten at the current rate — base wage is never touched). The negative portion
-- renders client-side as a shrinking allowance arc, and deduct_credits_cascade
-- enforces exactly that floor (`resulting_net < -org_divisor`).
--
-- However, 034 left the BEFORE-INSERT trigger from 027
-- (tg_credit_adjustments_floor) untouched, and that trigger still rejects ANY
-- insert that drops the running net below zero. The result: every deduction
-- that would spill into allowance (i.e. net going negative) is blocked with
-- "Credit adjustment would drop net below zero", contradicting the RPC and the
-- product rule.
--
-- This migration replaces the trigger function so the floor sits at
-- -credits_divisor, matching deduct_credits_cascade. The frozen-period guard is
-- preserved unchanged. Positive award inserts are unaffected.

create or replace function public.tg_credit_adjustments_floor()
returns trigger
language plpgsql
as $$
declare
  running_net integer;
  frozen boolean;
  divisor integer;
begin
  select exists (
    select 1 from public.credit_adjustments
    where employee_id = new.employee_id
      and period_month = new.period_month
      and paid_out_at is not null
  ) into frozen;

  if frozen then
    raise exception 'Credit period % for employee % has been cashed out and is frozen',
      new.period_month, new.employee_id;
  end if;

  select coalesce(sum(amount), 0) into running_net
  from public.credit_adjustments
  where employee_id = new.employee_id
    and period_month = new.period_month;

  select coalesce(credits_divisor, 0) into divisor
  from public.organizations where id = new.org_id;

  -- Floor at -divisor: the negative portion of credit_net represents the
  -- employee's allowance being eaten down to zero at the current rate. Base
  -- wage is never reduced. Mirrors the check in deduct_credits_cascade (034).
  if (running_net + new.amount) < -divisor then
    raise exception 'Credit adjustment would drop net below the allowance floor (current net: %, adjustment: %, floor: -%)',
      running_net, new.amount, divisor;
  end if;

  return new;
end;
$$;
