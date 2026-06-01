-- Extend admin_rewards_roster for the Performance "recognition cockpit" redesign.
--
-- Two additions, both backward compatible with the existing no-arg call:
--   1. An optional target_period_month parameter so the Performance page can
--      page through past months. Defaults to the current period when omitted.
--   2. Per-row bonus totals (bonus_idr) and a bonus frozen flag, mirroring the
--      existing credits_net / credits_frozen aggregation. Bonuses were already
--      awardable per-employee from the compensation view but were never exposed
--      on the rewards roster.
--
-- The previous definition (088) was a zero-arg function. A defaulted parameter
-- would create a second overload that makes the no-arg PostgREST call ambiguous,
-- so we drop the old signature first and replace it with the parameterised one.

drop function if exists public.admin_rewards_roster();

create or replace function public.admin_rewards_roster(target_period_month date default null)
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
  bonus_per_employee as (
    select
      ba.employee_id,
      sum(ba.amount_idr)::integer as bonus_idr,
      bool_or(ba.paid_out_at is not null) as frozen
    from public.bonus_adjustments ba
    where ba.org_id = caller_org
      and ba.period_month = period
    group by ba.employee_id
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
  departments_per_employee as (
    select
      ed.employee_id,
      coalesce(
        jsonb_agg(d.name order by ed.is_primary desc, d.name asc),
        '[]'::jsonb
      ) as departments
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
      coalesce(n.credits_net, 0) as credits_net,
      coalesce(n.frozen, false) as credits_frozen,
      coalesce(b.bonus_idr, 0) as bonus_idr,
      coalesce(b.frozen, false) as bonus_frozen,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements,
      coalesce(c.allowance_idr, 0) as allowance_idr
    from public.employees e
    left join net_per_employee n on n.employee_id = e.id
    left join bonus_per_employee b on b.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges tb on tb.employee_id = e.id
    left join active_contracts c on c.employee_id = e.id
    left join departments_per_employee dpe on dpe.employee_id = e.id
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

grant execute on function public.admin_rewards_roster(date) to authenticated;
