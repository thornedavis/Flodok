-- Fix: recent_unlocks should filter by announcement time, not milestone time.
--
-- Tenure achievements have backdated unlocked_at (the historical milestone
-- date), so a "today" filter against unlocked_at hides freshly-announced
-- achievements whose milestones happened weeks/months ago. The manager's
-- "Recognition Moments — Today" needs to mean "what the system announced
-- today" so the morning-meeting use case works for both backfill and
-- steady-state.
--
-- Same source as the portal bell uses: feed_events.created_at.
-- Drop first because the return shape changes (added announced_at column).

drop function if exists public.recent_unlocks(int);

create or replace function public.recent_unlocks(p_days_back int)
returns table (
  unlock_id uuid,
  unlocked_at timestamptz,
  announced_at timestamptz,
  awarded_by uuid,
  reason text,
  employee_id uuid,
  employee_name text,
  employee_photo text,
  achievement_id uuid,
  achievement_name text,
  achievement_description text,
  achievement_icon text,
  is_manual boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_tz text;
  v_cutoff timestamptz;
begin
  v_org_id := public.get_user_org_id();
  if v_org_id is null then
    raise exception 'No organization context';
  end if;

  select timezone into v_org_tz from public.organizations where id = v_org_id;
  v_org_tz := coalesce(v_org_tz, 'Asia/Jakarta');

  v_cutoff := (
    date_trunc('day', (now() at time zone v_org_tz))
      - (p_days_back || ' days')::interval
  ) at time zone v_org_tz;

  return query
  select
    au.id,
    au.unlocked_at,
    fe.created_at,
    au.awarded_by,
    au.reason,
    e.id,
    e.name,
    e.photo_url,
    ad.id,
    ad.name,
    ad.description,
    ad.icon,
    au.awarded_by is not null
  from public.feed_events fe
  join public.achievement_unlocks au on au.id::text = fe.metadata->>'unlock_id'
  join public.achievement_definitions ad on ad.id = au.achievement_id
  join public.employees e on e.id = au.employee_id
  where fe.event_type = 'achievement_unlocked'
    and fe.org_id = v_org_id
    and fe.created_at >= v_cutoff
  order by fe.created_at desc;
end;
$$;

revoke all on function public.recent_unlocks(int) from public;
grant execute on function public.recent_unlocks(int) to authenticated;
