-- Exclude trashed contracts from the two remaining pay-path SECURITY DEFINER
-- active-contract reads flagged after 192: the pay-adjustment floor guard
-- (tg_pay_adjustments_freeze) and the portal home comp display (portal_home).
--
-- Same class as 192 — trashing a contract keeps status='active', so a contract
-- trashed while its employee stays live was still read as the live active
-- contract. Fix: add `deleted_at is null` to the active-contract lookup.
-- Reproduced verbatim from 144 (the latest definition of both) with only that
-- predicate added; every other line is byte-for-byte the original.

-- === tg_pay_adjustments_freeze (from 144) ===
create or replace function public.tg_pay_adjustments_freeze()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap     integer;
  v_pay     integer;  -- base + allowance of the current active contract
  v_running integer;
begin
  -- Frozen-period guard: a period is closed if any adjustment is paid out OR a
  -- settlement snapshot exists (covers zero-adjustment periods that auto_close
  -- still settled).
  if exists (
    select 1 from public.pay_adjustments
    where employee_id = new.employee_id
      and period_month = new.period_month
      and paid_out_at is not null
  ) or exists (
    select 1 from public.pay_period_settlements
    where employee_id = new.employee_id
      and period_month = new.period_month
  ) then
    raise exception 'Pay period % for employee % has been closed and is frozen',
      new.period_month, new.employee_id;
  end if;

  -- Per-adjustment cap (only when the org sets one).
  select max_bonus_idr into v_cap from public.organizations where id = new.org_id;
  if v_cap is not null and abs(new.amount_idr) > v_cap then
    raise exception 'Adjustment of % exceeds the per-adjustment cap of %',
      new.amount_idr, v_cap;
  end if;

  -- Floor: the cumulative net for the period may not fall below -(base+allowance)
  -- — i.e. penalties can erase the month's pay to Rp 0 but no further.
  select coalesce(base_wage_idr, 0) + coalesce(allowance_idr, 0) into v_pay
  from public.contracts
  where employee_id = new.employee_id and status = 'active' and deleted_at is null
  order by updated_at desc
  limit 1;
  v_pay := coalesce(v_pay, 0);

  select coalesce(sum(amount_idr), 0) into v_running
  from public.pay_adjustments
  where employee_id = new.employee_id and period_month = new.period_month;

  if (v_running + new.amount_idr) < -v_pay then
    raise exception 'Adjustment would drop the period net below the floor of -% (current net %, adjustment %)',
      v_pay, v_running, new.amount_idr;
  end if;

  return new;
end;
$$;

-- === portal_home (from 144) ===
create or replace function public.portal_home(
  emp_slug text,
  emp_token text,
  target_month date
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
  settlement public.pay_period_settlements%rowtype;
  period date;
  period_end date;
  is_current_period boolean;
  emp_departments text[];
  emp_primary_dept text;
  eff_base integer;
  eff_allow integer;
  has_pay boolean;
  result jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org from public.organizations where id = emp.org_id;

  period := coalesce(target_month, public.current_period_month());
  period_end := (period + interval '1 month - 1 day')::date;
  is_current_period := period = public.current_period_month();

  select coalesce(
    array_agg(d.name order by ed.is_primary desc, d.name asc),
    array[]::text[]
  )
  into emp_departments
  from public.employee_departments ed
  join public.company_departments d on d.id = ed.department_id
  where ed.employee_id = emp.id;

  select d.name into emp_primary_dept
  from public.employee_departments ed
  join public.company_departments d on d.id = ed.department_id
  where ed.employee_id = emp.id and ed.is_primary
  limit 1;

  select c.* into active_contract from public.contracts c
  where c.employee_id = emp.id and c.status = 'active' and c.deleted_at is null
    and (c.start_date is null or c.start_date <= period_end)
    and (
      not exists (
        select 1 from public.contract_signatures cs
        where cs.contract_id = c.id
          and cs.version_number = c.current_version
          and cs.signer_role = 'employer'
      )
      or (
        exists (
          select 1 from public.contract_signatures cs
          where cs.contract_id = c.id
            and cs.version_number = c.current_version
            and cs.signer_role = 'employer'
        )
        and exists (
          select 1 from public.contract_signatures cs
          where cs.contract_id = c.id
            and cs.version_number = c.current_version
            and cs.signer_role = 'employee'
        )
      )
    )
  order by c.updated_at desc
  limit 1;

  -- Frozen snapshot for a closed period, if any.
  select * into settlement from public.pay_period_settlements
  where employee_id = emp.id and period_month = period;

  if settlement.id is not null then
    eff_base := settlement.base_idr;
    eff_allow := settlement.allowance_idr;
    has_pay := true;
  elsif active_contract.id is not null then
    eff_base := active_contract.base_wage_idr;
    eff_allow := active_contract.allowance_idr;
    has_pay := true;
  else
    has_pay := false;
  end if;

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id', emp.id,
      'name', emp.name,
      'photo_url', emp.photo_url,
      'department', emp_primary_dept,
      'departments', to_jsonb(emp_departments),
      'created_at', emp.created_at
    ),
    'org', jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'logo_url', org.logo_url
    ),
    'contract', case
      when not has_pay then null
      else jsonb_build_object(
        'base_wage_idr', eff_base,
        'allowance_idr', eff_allow,
        'hours_per_day', active_contract.hours_per_day,
        'days_per_week', active_contract.days_per_week
      )
    end,
    'period_month', period,
    'is_current_period', is_current_period,
    'adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_idr', amount_idr,
          'reason', reason,
          'created_at', created_at,
          'paid_out_at', paid_out_at
        )
        order by created_at desc
      )
      from public.pay_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'adjustment_net', coalesce((
      select sum(amount_idr)::integer
      from public.pay_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'adjustment_frozen', exists (
      select 1 from public.pay_adjustments
      where employee_id = emp.id
        and period_month = period
        and paid_out_at is not null
    ),
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
        and (
          target_month is null
          or date_trunc('month', u.unlocked_at at time zone 'Asia/Jakarta')::date = target_month
        )
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_home(text, text, date) to anon, authenticated;
