-- Payslip read RPC — Phase 7.
--
-- Returns the frozen settlement + its itemised lines + the employee/org details
-- needed to render a payslip, for a single settled employee-period. owner/admin
-- in the owning org only. NULL when the period isn't settled (payslips exist
-- only for frozen months). Read-only.

create or replace function public.admin_payslip(p_employee_id uuid, p_period date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
  emp_org     uuid;
  v_settle    public.pay_period_settlements;
  v_result    jsonb;
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

  select * into v_settle
  from public.pay_period_settlements
  where employee_id = p_employee_id and period_month = p_period;
  if v_settle.id is null then
    return null;  -- not settled → no payslip yet
  end if;

  select jsonb_build_object(
    'period', p_period,
    'settled_at', v_settle.settled_at,
    'org', (select jsonb_build_object('name', name) from public.organizations where id = caller_org),
    'employee', (
      select jsonb_build_object(
        'name', name,
        'job_position', job_position,
        'ktp_nik', ktp_nik,
        'npwp', npwp,
        'bank_name', bank_name,
        'bank_account_number', bank_account_number,
        'bank_account_holder', bank_account_holder
      )
      from public.employees where id = p_employee_id
    ),
    'totals', jsonb_build_object(
      'base_idr', v_settle.base_idr,
      'allowance_idr', v_settle.allowance_idr,
      'adjustment_net_idr', v_settle.adjustment_net_idr,
      'payout_idr', v_settle.payout_idr
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_type', line_type,
        'name', name,
        'kind', kind,
        'is_fixed', is_fixed,
        'amount_idr', amount_idr
      ) order by display_order)
      from public.pay_period_settlement_lines
      where settlement_id = v_settle.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_payslip(uuid, date) from public, anon;
grant execute on function public.admin_payslip(uuid, date) to authenticated;
