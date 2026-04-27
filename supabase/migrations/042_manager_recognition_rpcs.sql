-- RPCs powering the manager-side Recognition Moments widget on the Overview
-- dashboard. Two functions:
--
--   upcoming_milestones(p_days_ahead)
--     Forecasts tenure milestones every active employee will cross in the
--     next N days. Used to populate "next 7 days" / "next 30 days" sections
--     before the daily cron actually awards them.
--
--   recent_unlocks(p_days_back)
--     Returns achievement unlocks from the last N days for the caller's org.
--     `p_days_back = 0` means "since start of today in the org's timezone"
--     (i.e. today's unlocks only).
--
-- Both are SECURITY DEFINER, scoped by public.get_user_org_id(), and grant
-- execute to authenticated only — they're for the manager dashboard, not the
-- public portal.


create or replace function public.upcoming_milestones(p_days_ahead int)
returns table (
  employee_id uuid,
  employee_name text,
  employee_photo text,
  achievement_id uuid,
  achievement_name text,
  achievement_description text,
  achievement_icon text,
  milestone_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  v_org_id := public.get_user_org_id();
  if v_org_id is null then
    raise exception 'No organization context';
  end if;

  return query
  with first_signatures as (
    select
      e.id as employee_id,
      e.name as employee_name,
      e.photo_url as employee_photo,
      min(cs.signed_at) as first_signed_at
    from public.employees e
    join public.contract_signatures cs on cs.employee_id = e.id
    where e.org_id = v_org_id
      and e.status in ('trial', 'active')
    group by e.id
  ),
  forecasts as (
    select
      fs.employee_id,
      fs.employee_name,
      fs.employee_photo,
      ad.id as achievement_id,
      ad.name as achievement_name,
      ad.description as achievement_description,
      ad.icon as achievement_icon,
      fs.first_signed_at
        + ((ad.trigger_rule->>'amount') || ' ' || (ad.trigger_rule->>'unit'))::interval
        as milestone_at
    from first_signatures fs
    cross join public.achievement_definitions ad
    where ad.org_id = v_org_id
      and ad.is_active = true
      and ad.trigger_type = 'auto'
      and ad.trigger_rule->>'type' = 'tenure_calendar'
  )
  select
    f.employee_id,
    f.employee_name,
    f.employee_photo,
    f.achievement_id,
    f.achievement_name,
    f.achievement_description,
    f.achievement_icon,
    f.milestone_at
  from forecasts f
  where f.milestone_at > now()
    and f.milestone_at <= now() + (p_days_ahead || ' days')::interval
    and not exists (
      select 1
      from public.achievement_unlocks au
      where au.employee_id = f.employee_id
        and au.achievement_id = f.achievement_id
        and au.awarded_by is null
    )
  order by f.milestone_at asc;
end;
$$;


create or replace function public.recent_unlocks(p_days_back int)
returns table (
  unlock_id uuid,
  unlocked_at timestamptz,
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

  -- Start-of-today in org-local time, shifted back by p_days_back days,
  -- converted back to a UTC timestamptz for the comparison.
  v_cutoff := (
    date_trunc('day', (now() at time zone v_org_tz))
      - (p_days_back || ' days')::interval
  ) at time zone v_org_tz;

  return query
  select
    au.id,
    au.unlocked_at,
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
  from public.achievement_unlocks au
  join public.achievement_definitions ad on ad.id = au.achievement_id
  join public.employees e on e.id = au.employee_id
  where ad.org_id = v_org_id
    and au.unlocked_at >= v_cutoff
  order by au.unlocked_at desc;
end;
$$;


revoke all on function public.upcoming_milestones(int) from public;
revoke all on function public.recent_unlocks(int) from public;

grant execute on function public.upcoming_milestones(int) to authenticated;
grant execute on function public.recent_unlocks(int) to authenticated;
