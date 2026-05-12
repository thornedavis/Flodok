-- Rebuild remaining functions that referenced the dropped department columns.
--
-- - admin_rewards_roster (last defined in 032) — returns a departments array
--   on each roster row.
-- - spotlight_target_employee_ids (last defined in 052) — matches a post's
--   target_departments[] against each employee's department membership.
-- - portal_spotlight_posts (last defined in 059) — same matching logic, for
--   the portal-side visibility check.
--
-- The on-disk shapes (spotlight_posts.target_departments text[], the names
-- inside it) are unchanged: targeting still happens by department NAME, not
-- by department id. That keeps existing spotlight rows valid and avoids a
-- second data migration on top of 085.

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
      coalesce(ac.achievements_count, 0) as achievements_count,
      coalesce(tb.top_achievements, '[]'::jsonb) as top_achievements,
      coalesce(c.allowance_idr, 0) as allowance_idr
    from public.employees e
    left join net_per_employee n on n.employee_id = e.id
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

grant execute on function public.admin_rewards_roster() to authenticated;

-- ─── Spotlight: department matching helper ──────────────────────────────────

-- Returns true if the given employee is a member of any of the named
-- departments. Encapsulates the join logic so spotlight functions don't
-- have to inline it twice.
create or replace function public.employee_in_departments(
  p_employee_id uuid,
  p_department_names text[]
)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.employee_departments ed
    join public.company_departments d on d.id = ed.department_id
    where ed.employee_id = p_employee_id
      and d.name = any(p_department_names)
  )
$$;

grant execute on function public.employee_in_departments(uuid, text[]) to anon, authenticated;

-- ─── Spotlight: rebuild the two visibility functions ────────────────────────

create or replace function public.spotlight_target_employee_ids(p_post_id uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id
  from public.employees e
  join public.spotlight_posts p on p.id = p_post_id
  where e.org_id = p.org_id
    and e.status = 'active'
    and (
      p.visibility_scope = 'org_wide'
      or (
        p.visibility_scope = 'departments'
        and public.employee_in_departments(e.id, p.target_departments)
      )
      or (
        p.visibility_scope = 'specific_employees'
        and e.id = any(p.target_employee_ids)
      )
    )
$$;

drop function if exists public.portal_spotlight_posts(text, text);

create or replace function public.portal_spotlight_posts(
  emp_slug text,
  emp_token text
)
returns table (
  id uuid,
  title text,
  author_name text,
  what_happened text,
  what_to_do_instead text,
  who_applies_note text,
  image_url text,
  link_url text,
  link_label text,
  priority text,
  display_mode text,
  requires_acknowledgement boolean,
  effective_from timestamptz,
  effective_until timestamptz,
  published_at timestamptz,
  republish_count int,
  first_seen_at timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  return query
  select
    p.id,
    p.title,
    case
      when p.posted_as_kind = 'org' then coalesce(o.display_name, o.name, '')
      else coalesce(u.name, '')
    end as author_name,
    p.what_happened,
    p.what_to_do_instead,
    p.who_applies_note,
    p.image_url,
    p.link_url,
    p.link_label,
    p.priority,
    p.display_mode,
    p.requires_acknowledgement,
    p.effective_from,
    p.effective_until,
    p.published_at,
    p.republish_count,
    v.first_seen_at,
    v.acknowledged_at,
    v.dismissed_at
  from public.spotlight_posts p
  left join public.users u on u.id = p.created_by
  left join public.organizations o on o.id = p.org_id
  left join public.spotlight_post_views v
    on v.post_id = p.id and v.employee_id = emp.id
  where p.org_id = emp.org_id
    and p.status = 'published'
    and (p.effective_from is null or p.effective_from <= now())
    and (p.effective_until is null or p.effective_until > now())
    and (
      p.visibility_scope = 'org_wide'
      or (
        p.visibility_scope = 'departments'
        and public.employee_in_departments(emp.id, p.target_departments)
      )
      or (
        p.visibility_scope = 'specific_employees'
        and emp.id = any(p.target_employee_ids)
      )
    )
  order by p.published_at desc nulls last;
end;
$$;

grant execute on function public.portal_spotlight_posts(text, text) to anon, authenticated;
