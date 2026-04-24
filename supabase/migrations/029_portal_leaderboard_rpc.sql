-- Leaderboard RPC for the employee portal.
--
-- Ranks employees in the viewer's organization by net Credits over a chosen
-- period. Net (not positive-only) is intentional — dynamism is the point:
-- an employee who earns and then loses Credits should reflect both in real
-- time. Governance (reason, actor, role-gating) happens at the adjustment
-- layer, not the leaderboard layer.
--
-- Period options:
--   'month'    — current period month (Asia/Jakarta)
--   'quarter'  — start of current quarter (Asia/Jakarta) through now
--   'all-time' — no lower bound
--
-- Rows returned include anyone with credit activity in the period. The
-- viewer is always included, even with zero, so self-position is visible.

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
      to_jsonb(coalesce(e.departments, array[]::text[])) as departments,
      coalesce(n.net_credits, 0) as net_credits,
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements
    from candidates c
    join public.employees e on e.id = c.employee_id
    left join net_per_employee n on n.employee_id = e.id
    left join achievement_counts ac on ac.employee_id = e.id
    left join top_badges_per_employee tb on tb.employee_id = e.id
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
