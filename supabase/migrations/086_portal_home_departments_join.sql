-- Rebuild portal_home after the 085 departments migration.
--
-- Identical to the migration-063 definition, with one change: department
-- names are now resolved through the employee_departments →
-- company_departments join (the legacy text columns were dropped in 085).
-- The JSON response shape is preserved exactly — `department` is the
-- primary department name, `departments` is the full list — so the portal
-- frontend continues to work unchanged.

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
  period date;
  period_end date;
  is_current_period boolean;
  emp_departments text[];
  emp_primary_dept text;
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

  -- Department names, primary first then alphabetical, for both display and
  -- the legacy single-`department` field consumers rely on.
  select coalesce(
    array_agg(d.name order by ed.is_primary desc, d.name asc),
    array[]::text[]
  )
  into emp_departments
  from public.employee_departments ed
  join public.company_departments d on d.id = ed.department_id
  where ed.employee_id = emp.id;

  select d.name
  into emp_primary_dept
  from public.employee_departments ed
  join public.company_departments d on d.id = ed.department_id
  where ed.employee_id = emp.id and ed.is_primary
  limit 1;

  -- Contract selection: see migration 063 for the rule.
  select c.* into active_contract from public.contracts c
  where c.employee_id = emp.id and c.status = 'active'
    and (c.start_date is null or c.start_date <= period_end)
    and (
      not exists (
        select 1 from public.contract_signatures cs
        where cs.contract_id = c.id
          and cs.version_number = c.current_version
          and cs.signer_role = 'employer'
      )
      or
      (
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
      'logo_url', org.logo_url,
      'credits_divisor', org.credits_divisor
    ),
    'contract', case
      when active_contract.id is null then null
      else jsonb_build_object(
        'base_wage_idr', active_contract.base_wage_idr,
        'allowance_idr', active_contract.allowance_idr,
        'hours_per_day', active_contract.hours_per_day,
        'days_per_week', active_contract.days_per_week
      )
    end,
    'period_month', period,
    'is_current_period', is_current_period,
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
