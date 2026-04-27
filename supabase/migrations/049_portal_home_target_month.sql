-- 049_portal_home_target_month.sql
--
-- Extend portal_home with an optional target_month parameter so the employee
-- portal can show snapshots of past months (credits, bonuses, achievements,
-- credit_frozen state). When the param is null or omitted, behavior matches
-- the current implementation (current_period_month()).
--
-- Achievements remain lifetime when target_month is null; when a specific
-- month is requested, achievements are scoped to that month's unlocks. This
-- mirrors how a "monthly snapshot" view should feel — only what happened in
-- that month is shown.
--
-- The 2-argument signature is preserved as a thin wrapper so existing client
-- calls (`supabase.rpc('portal_home', { emp_slug, emp_token })`) keep working
-- without modification.

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
  is_current_period boolean;
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

  period := coalesce(target_month, public.current_period_month());
  is_current_period := period = public.current_period_month();

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

-- Preserve the 2-arg call site by replacing the old function with a wrapper
-- that delegates to the 3-arg version with target_month => null.

create or replace function public.portal_home(
  emp_slug text,
  emp_token text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.portal_home(emp_slug, emp_token, null::date);
$$;

grant execute on function public.portal_home(text, text) to anon, authenticated;
