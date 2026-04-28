-- Add trigger_rule to portal_badges output so the portal can group badges
-- by category (tenure / compensation / leaderboard / manual) the same way
-- the manager-side settings page does. trigger_rule already exists on
-- achievement_definitions; this just exposes it through the RPC.

create or replace function public.portal_badges(
  emp_slug text,
  emp_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp_id uuid;
  v_org_id uuid;
  v_result jsonb;
begin
  select id, org_id into v_emp_id, v_org_id
  from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if v_emp_id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select jsonb_agg(badge order by sort_unlocked desc, sort_featured desc, sort_name asc)
  into v_result
  from (
    select
      (count(u.id) > 0) as sort_unlocked,
      d.is_featured as sort_featured,
      d.name as sort_name,
      jsonb_build_object(
        'definition_id', d.id,
        'name', d.name,
        'description', d.description,
        'icon', d.icon,
        'is_featured', d.is_featured,
        'trigger_type', d.trigger_type,
        'trigger_rule', d.trigger_rule,
        'unlocked', count(u.id) > 0,
        'unlock_count', count(u.id)::int,
        'unlock_id', (array_agg(u.id order by u.unlocked_at desc))[1],
        'unlocked_at', max(u.unlocked_at),
        'reason', (array_agg(u.reason order by u.unlocked_at desc) filter (where u.reason is not null))[1]
      ) as badge
    from public.achievement_definitions d
    left join public.achievement_unlocks u
      on u.achievement_id = d.id and u.employee_id = v_emp_id
    where d.org_id = v_org_id
      and d.is_active = true
    group by d.id, d.name, d.description, d.icon, d.is_featured, d.trigger_type, d.trigger_rule
  ) sorted;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

grant execute on function public.portal_badges(text, text) to anon, authenticated;
