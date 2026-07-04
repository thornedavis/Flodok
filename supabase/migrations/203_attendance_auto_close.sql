-- 203: Attendance auto-close — close forgotten clock-ins after a per-org cap.
--
-- A browser can't track presence in the background, so we can't know the exact
-- moment someone leaves. Instead an hourly pg_cron sweep closes any clock-in
-- left open past the org's cap. The synthetic clock_out is SYSTEM-GENERATED
-- (is_auto=true): no selfie, no GPS, stamped at clock_in + cap hours
-- (deterministic), so it never poses as a real clock-out. Payroll/HR should
-- treat is_auto events as estimates.

-- Per-org cap (hours). >0 = auto-close on; default 16.
alter table public.organizations
  add column if not exists attendance_auto_close_hours int not null default 16;

-- System clock_outs carry no capture data.
alter table public.attendance_events alter column selfie_path drop not null;
alter table public.attendance_events alter column latitude   drop not null;
alter table public.attendance_events alter column longitude  drop not null;
alter table public.attendance_events
  add column if not exists is_auto boolean not null default false;

-- ─── System sweep (called by pg_cron; no auth context) ──────────────────────
create or replace function public.attendance_auto_close()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with cfg as (
    select id as org_id, attendance_auto_close_hours as cap
    from public.organizations
    where attendance_enabled = true and coalesce(attendance_auto_close_hours, 0) > 0
  ),
  open_clocks as (
    select a.org_id, a.employee_id, a.identity,
           a.server_timestamp + make_interval(hours => c.cap) as close_at
    from public.attendance_events a
    join cfg c on c.org_id = a.org_id
    join public.employees e on e.id = a.employee_id and e.deleted_at is null
    where a.event_type = 'clock_in'
      and a.deleted_at is null
      and now() - a.server_timestamp > make_interval(hours => c.cap)
      and not exists (
        select 1 from public.attendance_events a2
        where a2.employee_id = a.employee_id
          and a2.event_type = 'clock_out'
          and a2.server_timestamp > a.server_timestamp
          and a2.deleted_at is null
      )
  )
  insert into public.attendance_events (
    org_id, employee_id, event_type, server_timestamp,
    within_geofence, identity, status, is_auto
  )
  select org_id, employee_id, 'clock_out', close_at,
         null, identity, 'recorded', true
  from open_clocks;
  get diagnostics v_count = row_count;
  return jsonb_build_object('auto_closed', v_count, 'ran_at', now());
end $$;

revoke all on function public.attendance_auto_close() from public, anon, authenticated;

-- Hourly schedule (pg_cron). cron.schedule upserts by jobname (see 105/109).
select cron.schedule('attendance-auto-close', '0 * * * *', $$ select public.attendance_auto_close(); $$);

-- ─── Extend the dashboard read to surface is_auto ───────────────────────────
-- Re-created identical to migration 198 plus one jsonb key: 'is_auto', e.is_auto.
-- Everything else (role gate, joins, 90-day window, grants) is byte-for-byte.
create or replace function public.attendance_dashboard_list()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text; v jsonb;
begin
  select org_id, role into v_org, v_role from public.users where id = auth.uid();
  if v_org is null or v_role not in ('owner','admin','hr') then
    raise exception 'Not authorised';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'employee_id', e.employee_id,
    'employee_name', emp.name,
    'event_type', e.event_type,
    'server_timestamp', e.server_timestamp,
    'client_timestamp', e.client_timestamp,
    'latitude', e.latitude,
    'longitude', e.longitude,
    'accuracy_meters', e.accuracy_meters,
    'within_geofence', e.within_geofence,
    'distance_meters', e.distance_meters,
    'on_office_network', e.on_office_network,
    'geofence_radius_meters', loc.radius_meters,
    'location_name', loc.name,
    'status', e.status,
    'selfie_path', e.selfie_path,
    'is_auto', e.is_auto,
    'identity', e.identity
  ) order by e.server_timestamp desc), '[]'::jsonb)
  into v
  from public.attendance_events e
  join public.employees emp on emp.id = e.employee_id
  left join public.attendance_locations loc on loc.id = e.location_id
  where e.org_id = v_org and e.deleted_at is null
    and e.server_timestamp > now() - interval '90 days';
  return v;
end $$;
revoke execute on function public.attendance_dashboard_list() from public;
grant execute on function public.attendance_dashboard_list() to authenticated;
