-- Per-employee payroll line breakdown for the Payroll page row-expand.
--
-- Returns the itemised lines (base + allowance components + period adjustments)
-- for one employee-period. For a SETTLED period it returns the frozen
-- pay_period_settlement_lines (falling back to synthesised lines from the
-- totals for pre-line settlements). For an OPEN period it computes the same
-- breakdown live from the active contract + this period's pay_adjustments —
-- mirroring _settle_pay_period's line logic without writing. owner/admin only.

create or replace function public.admin_payroll_lines(p_employee_id uuid, p_period date)
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
  v_contract  uuid;
  v_base      integer;
  v_allow     integer;
  v_lines     jsonb;
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

  -- ── Settled → frozen lines ──
  select * into v_settle
  from public.pay_period_settlements
  where employee_id = p_employee_id and period_month = p_period;

  if v_settle.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'line_type', line_type, 'name', name, 'kind', kind, 'is_fixed', is_fixed, 'amount_idr', amount_idr
    ) order by display_order), '[]'::jsonb)
    into v_lines
    from public.pay_period_settlement_lines
    where settlement_id = v_settle.id;

    -- Pre-line settlement (settled before lines existed) → synthesise from totals.
    if v_lines = '[]'::jsonb then
      v_lines := jsonb_build_array(
        jsonb_build_object('line_type', 'base', 'name', 'Gaji Pokok', 'kind', 'earning', 'is_fixed', true, 'amount_idr', v_settle.base_idr)
      );
      if coalesce(v_settle.allowance_idr, 0) <> 0 then
        v_lines := v_lines || jsonb_build_object('line_type', 'allowance', 'name', 'Tunjangan', 'kind', 'earning', 'is_fixed', false, 'amount_idr', v_settle.allowance_idr);
      end if;
      if coalesce(v_settle.adjustment_net_idr, 0) <> 0 then
        v_lines := v_lines || jsonb_build_object('line_type', 'adjustment', 'name', 'Penyesuaian',
          'kind', case when v_settle.adjustment_net_idr >= 0 then 'earning' else 'deduction' end,
          'is_fixed', false, 'amount_idr', v_settle.adjustment_net_idr);
      end if;
    end if;

    return v_lines;
  end if;

  -- ── Open → compute live ──
  select id, coalesce(base_wage_idr, 0), coalesce(allowance_idr, 0)
    into v_contract, v_base, v_allow
  from public.contracts
  where employee_id = p_employee_id and status = 'active'
  order by updated_at desc limit 1;
  v_base := coalesce(v_base, 0);
  v_allow := coalesce(v_allow, 0);

  v_lines := jsonb_build_array(
    jsonb_build_object('line_type', 'base', 'name', 'Gaji Pokok', 'kind', 'earning', 'is_fixed', true, 'amount_idr', v_base)
  );

  if v_contract is not null then
    v_lines := v_lines || coalesce((
      select jsonb_agg(jsonb_build_object('line_type', 'allowance', 'name', name, 'kind', 'earning', 'is_fixed', is_fixed, 'amount_idr', amount_idr) order by display_order)
      from public.contract_compensation_components
      where contract_id = v_contract and kind = 'earning'
    ), '[]'::jsonb);
    -- Fallback: allowance total with no itemised components.
    if not exists (select 1 from public.contract_compensation_components where contract_id = v_contract and kind = 'earning') and v_allow > 0 then
      v_lines := v_lines || jsonb_build_object('line_type', 'allowance', 'name', 'Tunjangan', 'kind', 'earning', 'is_fixed', false, 'amount_idr', v_allow);
    end if;
  end if;

  v_lines := v_lines || coalesce((
    select jsonb_agg(jsonb_build_object('line_type', 'adjustment', 'name', reason,
      'kind', case when amount_idr >= 0 then 'earning' else 'deduction' end,
      'is_fixed', false, 'amount_idr', amount_idr) order by created_at)
    from public.pay_adjustments
    where employee_id = p_employee_id and period_month = p_period
  ), '[]'::jsonb);

  return v_lines;
end;
$$;

revoke all on function public.admin_payroll_lines(uuid, date) from public, anon;
grant execute on function public.admin_payroll_lines(uuid, date) to authenticated;
