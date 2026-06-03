-- Read helper for the manager app: the frozen settlement for one employee-period.
--
-- CompensationOverview (and PerformanceDetail, which renders it) shows pay for a
-- selected month. For a closed period it must show the frozen snapshot (144)
-- rather than recomputing from the current contract. This returns the
-- settlement row as jsonb (null if the period isn't settled). owner/admin in the
-- owning org only — the pay_period_settlements RLS already enforces that, but
-- this also avoids exposing the table shape directly to the client.

create or replace function public.admin_pay_settlement(
  p_employee_id  uuid,
  p_period_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
  emp_org     uuid;
  result      jsonb;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  select org_id into emp_org from public.employees where id = p_employee_id;
  if emp_org is null or emp_org <> caller_org then
    raise exception 'Employee not found in your organization';
  end if;

  select jsonb_build_object(
    'base_idr', base_idr,
    'allowance_idr', allowance_idr,
    'adjustment_net_idr', adjustment_net_idr,
    'payout_idr', payout_idr
  ) into result
  from public.pay_period_settlements
  where employee_id = p_employee_id and period_month = p_period_month;

  return result;  -- null when the period has not been settled
end;
$$;

revoke execute on function public.admin_pay_settlement(uuid, date) from public, anon;
grant execute on function public.admin_pay_settlement(uuid, date) to authenticated;
