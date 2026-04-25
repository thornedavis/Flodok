-- Single-query roster for the admin rewards workbench.
--
-- Returns every employee in the caller's org along with:
--   - current period net Credits and frozen flag
--   - active-contract allowance (needed to render the cascade preview and
--     validate whether a Credits deduction would have somewhere to spill to)
--   - achievement unlock count and a short "top badges" list for the row
--
-- Shaped as a single jsonb payload so the client can paint the whole list
-- from one roundtrip. This is admin-only (auth.uid() must resolve to an
-- owner or admin in the same org).

create or replace function public.admin_rewards_roster()
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

  period := public.current_period_month();

  with net_per_employee as (
    select
      ca.employee_id,
      sum(ca.amount)::integer as credits_net,
      bool_or(ca.paid_out_at is not null) as frozen
    from public.credit_adjustments ca
    where ca.org_id = caller_org
      and ca.period_month = period
    group by ca.employee_id
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
        jsonb_build_object(
          'name', name,
          'icon', icon,
          'unlocked_at', unlocked_at
        )
        order by rn asc
      ) as top_achievements
    from (
      select
        u.employee_id,
        d.name,
        d.icon,
        u.unlocked_at,
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
  active_contracts as (
    select distinct on (employee_id)
      employee_id,
      allowance_idr
    from public.contracts
    where org_id = caller_org and status = 'active'
    order by employee_id, updated_at desc
  ),
  rows as (
    select
      e.id as employee_id,
      e.name,
      e.photo_url,
      to_jsonb(coalesce(e.departments, array[]::text[])) as departments,
      coalesce(n.credits_net, 0) as credits_net,
      coalesce(n.frozen, false) as credits_frozen,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements,
      coalesce(c.allowance_idr, 0) as allowance_idr
    from public.employees e
    left join net_per_employee n on n.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges tb on tb.employee_id = e.id
    left join active_contracts c on c.employee_id = e.id
    where e.org_id = caller_org
  )
  select jsonb_build_object(
    'period_month', period,
    'credits_divisor', (select credits_divisor from public.organizations where id = caller_org),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.name asc)
      from rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_rewards_roster() to authenticated;
