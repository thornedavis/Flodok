-- Portal-side data access for the employee home tab.
--
-- The employee portal is token-authenticated (employees.slug + access_token),
-- not Supabase-auth, so RLS policies using auth.uid() do not apply. We expose
-- the minimum data the portal needs through SECURITY DEFINER RPCs that
-- validate (slug, token) internally before returning anything.
--
-- portal_home returns a single jsonb blob with everything the home tab needs:
--   - employee profile (name, photo, departments, tenure)
--   - org (name, logo, credits_divisor)
--   - active contract wage amounts
--   - current period allowance adjustments + running sum
--   - current period credit adjustments + net + frozen flag
--   - achievement unlocks (all time, featured first)

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
    'allowance_adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_idr', amount_idr,
          'reason', reason,
          'created_at', created_at
        )
        order by created_at desc
      )
      from public.allowance_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'allowance_sum', coalesce((
      select sum(amount_idr)::integer
      from public.allowance_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
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
