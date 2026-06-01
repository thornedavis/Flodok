-- Add an all-time mode to admin_rewards_roster for the Performance roster's
-- "All time" period toggle: when all_time = true, the net adjustment is summed
-- across every period instead of a single month. Achievements are already
-- lifetime. period_month comes back null in all-time mode.
--
-- A defaulted second parameter would create an ambiguous overload with the
-- existing single-arg version, so we drop that first (same pattern as 124).

drop function if exists public.admin_rewards_roster(date);

create or replace function public.admin_rewards_roster(
  target_period_month date default null,
  all_time boolean default false
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
  period date;
  result jsonb;
begin
  caller_id := auth.uid();

  select role, org_id into caller_role, caller_org
  from public.users where id = caller_id;

  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;

  period := coalesce(target_period_month, public.current_period_month());

  with adj_per_employee as (
    select
      pa.employee_id,
      sum(pa.amount_idr)::integer as adjustment_idr,
      bool_or(pa.paid_out_at is not null) as frozen
    from public.pay_adjustments pa
    where pa.org_id = caller_org
      and (all_time or pa.period_month = period)
    group by pa.employee_id
  ),
  achievement_counts as (
    select
      u.employee_id,
      count(*)::integer as achievements_count
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_id
    where d.org_id = caller_org
    group by u.employee_id
  ),
  top_badges as (
    select
      employee_id,
      jsonb_agg(
        jsonb_build_object('name', name, 'icon', icon, 'unlocked_at', unlocked_at)
        order by rn asc
      ) as top_achievements
    from (
      select
        u.employee_id, d.name, d.icon, u.unlocked_at,
        row_number() over (
          partition by u.employee_id
          order by d.is_featured desc, u.unlocked_at desc
        ) as rn
      from public.achievement_unlocks u
      join public.achievement_definitions d on d.id = u.achievement_id
      where d.org_id = caller_org
    ) ranked
    where rn <= 3
    group by employee_id
  ),
  departments_per_employee as (
    select
      ed.employee_id,
      coalesce(jsonb_agg(d.name order by ed.is_primary desc, d.name asc), '[]'::jsonb) as departments
    from public.employee_departments ed
    join public.company_departments d on d.id = ed.department_id
    join public.employees e on e.id = ed.employee_id
    where e.org_id = caller_org
    group by ed.employee_id
  ),
  rows as (
    select
      e.id as employee_id,
      e.name,
      e.photo_url,
      coalesce(dpe.departments, '[]'::jsonb) as departments,
      coalesce(a.adjustment_idr, 0) as adjustment_idr,
      coalesce(a.frozen, false) as adjustment_frozen,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements
    from public.employees e
    left join adj_per_employee a on a.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges tb on tb.employee_id = e.id
    left join departments_per_employee dpe on dpe.employee_id = e.id
    where e.org_id = caller_org
  )
  select jsonb_build_object(
    'period_month', case when all_time then null else period end,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.name asc)
      from rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_rewards_roster(date, boolean) to authenticated;
