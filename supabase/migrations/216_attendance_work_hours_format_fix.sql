-- 216: Harden the expected-hours formatting added in 215.
--
-- 215 formatted the `time` columns with to_char(work_start_time, 'HH24:MI').
-- That leans on PostgreSQL resolving to_char(time, text) through an implicit
-- time → interval cast. It most likely does — but plpgsql only syntax-checks a
-- function body at CREATE time, so an overload that failed to resolve would
-- not surface until the RPC actually ran, and then it would raise for the whole
-- call: attendance_dashboard_list powers the entire attendance page, so the
-- dashboard would go blank rather than merely lose the new column. No other
-- migration in this repo formats a `time` this way, so there is no working
-- precedent to lean on either.
--
-- Casting to text is unconditionally defined: '09:00:00'::time::text is always
-- 'HH:MM:SS', so left(…, 5) yields 'HH:MM' with no overload resolution at all,
-- and NULL still passes straight through as NULL. Same output, no gamble.
--
-- Both functions are otherwise byte-for-byte identical to their 215 versions.

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
    'expected_start', left(coalesce(emp.work_start_time, org.default_work_start_time)::text, 5),
    'expected_end',   left(coalesce(emp.work_end_time,   org.default_work_end_time)::text,   5),
    'identity', e.identity
  ) order by e.server_timestamp desc), '[]'::jsonb)
  into v
  from public.attendance_events e
  join public.employees emp on emp.id = e.employee_id
  join public.organizations org on org.id = e.org_id
  left join public.attendance_locations loc on loc.id = e.location_id
  where e.org_id = v_org and e.deleted_at is null
    and e.server_timestamp > now() - interval '90 days';
  return v;
end $$;
revoke execute on function public.attendance_dashboard_list() from public;
grant execute on function public.attendance_dashboard_list() to authenticated;

create or replace function public.portal_list_attendance(emp_slug text, emp_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare emp public.employees%rowtype; v_start text; v_end text; v jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select left(coalesce(emp.work_start_time, o.default_work_start_time)::text, 5),
         left(coalesce(emp.work_end_time,   o.default_work_end_time)::text,   5)
    into v_start, v_end
  from public.organizations o where o.id = emp.org_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'event_type', e.event_type, 'server_timestamp', e.server_timestamp,
    'within_geofence', e.within_geofence, 'status', e.status,
    'expected_start', v_start, 'expected_end', v_end
  ) order by e.server_timestamp desc), '[]'::jsonb)
  into v
  from public.attendance_events e
  where e.employee_id = emp.id and e.deleted_at is null
    and e.server_timestamp > now() - interval '30 days';
  return v;
end $$;
revoke execute on function public.portal_list_attendance(text, text) from public;
grant execute on function public.portal_list_attendance(text, text) to anon, authenticated;
