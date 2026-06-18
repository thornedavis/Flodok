-- Annual-leave accrual (Indonesian Manpower Law practice).
--
-- Replaces the flat "entitlement = annual_leave_days" balance with accrual by
-- months of continuous service (employees.join_date):
--   - First year of service: accrue annual_leave_days/12 per completed month
--     (pro-rated), but NOT usable until the service gate is met.
--   - Once a full year of service is complete: the full annual entitlement is
--     available, resetting each leave year (no carry-over — Thorne 2026-06-18).
--   - Use-gate: leave is usable only after 12 months of service, unless the org
--     turns it off (organizations.forms_config.leave_request.require_service_year
--     = false). Default = gate on.
--
-- (The statutory 6-month rolling expiry is a future enhancement; we reset per
-- leave year for now.)

create or replace function public._leave_balance(p_employee_id uuid, p_org_id uuid, p_year int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_annual    int;
  v_join      date;
  v_ref       date := (now() at time zone 'Asia/Jakarta')::date;
  v_service_months int;
  v_monthly   numeric;
  v_accrued   numeric;
  v_gate_on   boolean;
  v_gate_months int;
  v_eligible  boolean;
  v_available numeric;
  v_used      numeric;
begin
  select annual_leave_days into v_annual
    from public.contracts where employee_id = p_employee_id and status = 'active'
    order by updated_at desc limit 1;
  v_annual := coalesce(v_annual, 12);

  select coalesce(join_date, created_at::date) into v_join
    from public.employees where id = p_employee_id;
  v_join := coalesce(v_join, v_ref);

  -- Completed whole months of continuous service.
  v_service_months := greatest(
    0,
    (extract(year from age(v_ref, v_join)) * 12 + extract(month from age(v_ref, v_join)))::int
  );

  -- Per-org use-gate: default ON (usable only after 12 months of service).
  v_gate_on := coalesce(
    (select forms_config->'leave_request'->>'require_service_year' from public.organizations where id = p_org_id),
    'true'
  ) <> 'false';
  v_gate_months := case when v_gate_on then 12 else 0 end;

  v_monthly := v_annual::numeric / 12.0;
  -- Full entitlement once a year of service is complete; pro-rated in the first year.
  v_accrued := case when v_service_months >= 12 then v_annual else round(v_monthly * v_service_months) end;
  v_eligible := v_service_months >= v_gate_months;
  v_available := case when v_eligible then v_accrued else 0 end;

  -- Days taken this leave year (annual_taken deltas are negative).
  select coalesce(-sum(delta_days), 0) into v_used
    from public.leave_ledger
    where employee_id = p_employee_id and leave_year = p_year and entry_type = 'annual_taken';

  return jsonb_build_object(
    'year', p_year,
    'entitlement', v_annual,
    'service_months', v_service_months,
    'accrued', v_accrued,
    'eligible', v_eligible,
    'gate_months', v_gate_months,
    'used', v_used,
    'remaining', greatest(0, v_available - v_used)
  );
end;
$$;
