-- Rebuild portal_leaderboard after the 085 departments migration.
--
-- Identical to migration-029, with the `departments` array now resolved
-- through the employee_departments → company_departments join. The JSON
-- response shape is preserved so the portal frontend continues to work.

create or replace function public.portal_leaderboard(
  emp_slug text,
  emp_token text,
  period_kind text default 'month'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer public.employees%rowtype;
  org_row public.organizations%rowtype;
  period_start date;
  period_label text;
  result jsonb;
begin
  if period_kind not in ('month', 'quarter', 'all-time') then
    raise exception 'Invalid period_kind: %', period_kind;
  end if;

  select * into viewer from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if viewer.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org_row from public.organizations where id = viewer.org_id;

  if period_kind = 'month' then
    period_start := public.current_period_month();
    period_label := to_char(period_start, 'YYYY-MM');
  elsif period_kind = 'quarter' then
    period_start := date_trunc(
      'quarter',
      (now() at time zone 'Asia/Jakarta')::date
    )::date;
    period_label := to_char(period_start, 'YYYY-"Q"Q');
  else
    period_start := null;
    period_label := 'all-time';
  end if;

  with net_per_employee as (
    select
      ca.employee_id,
      sum(ca.amount)::integer as net_credits
    from public.credit_adjustments ca
    where ca.org_id = viewer.org_id
      and (period_start is null or ca.period_month >= period_start)
    group by ca.employee_id
  ),
  achievement_counts as (
    select
      u.employee_id,
      count(*)::integer as achievements_count
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_id
    where d.org_id = viewer.org_id
    group by u.employee_id
  ),
  top_badges_per_employee as (
    select
      employee_id,
      jsonb_agg(
        jsonb_build_object(
          'name', name,
          'icon', icon,
          'unlocked_at', unlocked_at,
          'is_featured', is_featured
        )
        order by rn asc
      ) as top_achievements
    from (
      select
        u.employee_id,
        d.name,
        d.icon,
        d.is_featured,
        u.unlocked_at,
        row_number() over (
          partition by u.employee_id
          order by d.is_featured desc, u.unlocked_at desc
        ) as rn
      from public.achievement_unlocks u
      join public.achievement_definitions d on d.id = u.achievement_id
      where d.org_id = viewer.org_id
    ) ranked
    where rn <= 3
    group by employee_id
  ),
  departments_per_employee as (
    -- Primary first, then alphabetical, matching portal_home's ordering.
    select
      ed.employee_id,
      coalesce(
        jsonb_agg(d.name order by ed.is_primary desc, d.name asc),
        '[]'::jsonb
      ) as departments
    from public.employee_departments ed
    join public.company_departments d on d.id = ed.department_id
    group by ed.employee_id
  ),
  candidates as (
    select e.id as employee_id
    from public.employees e
    join net_per_employee n on n.employee_id = e.id
    where e.org_id = viewer.org_id
    union
    select viewer.id
  ),
  rows as (
    select
      e.id as employee_id,
      e.name,
      e.photo_url,
      coalesce(dpe.departments, '[]'::jsonb) as departments,
      coalesce(n.net_credits, 0) as net_credits,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements
    from candidates c
    join public.employees e on e.id = c.employee_id
    left join net_per_employee n on n.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges_per_employee tb on tb.employee_id = e.id
    left join departments_per_employee dpe on dpe.employee_id = e.id
    order by
      coalesce(n.net_credits, 0) desc,
      coalesce(ac.achievements_count, 0) desc,
      e.name asc
  )
  select jsonb_build_object(
    'period_kind', period_kind,
    'period_label', period_label,
    'viewer_employee_id', viewer.id,
    'org', jsonb_build_object(
      'id', org_row.id,
      'name', org_row.name,
      'credits_divisor', org_row.credits_divisor
    ),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.net_credits desc, rows.achievements_count desc, rows.name asc)
      from rows
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_leaderboard(text, text, text) to anon, authenticated;
