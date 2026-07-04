-- Attendance — locations setup + office-network presence signal.
--
-- Design (Thorne, 2026-07-02):
--   - Each location can now carry office IP ranges (office_cidrs). A clock-in
--     whose public IP falls inside any active location's ranges counts as
--     on-site — a GPS-independent second signal.
--   - attendance_events.on_office_network records that match per event:
--       null  = no office network configured anywhere in the org
--       false = network configured but the clock-in IP didn't match
--       true  = clock-in IP matched an office range
--   - Confirmed presence = inside a geofence OR on the office network. We still
--     RECORD-AND-FLAG: an event is only flagged when a signal WAS configured
--     (a geofence exists OR office ranges exist) but none confirmed.
--   - Owner/admin CRUD for locations via SECURITY DEFINER RPCs (generated
--     database.ts doesn't know these tables — accessed through the rpc-shim).

-- ─── 1. Office network ranges per location; on_office_network per event ──────
alter table public.attendance_locations
  add column if not exists office_cidrs cidr[] not null default '{}';
alter table public.attendance_events
  add column if not exists on_office_network boolean;  -- null = no office network configured

-- ─── RPC: portal_record_attendance (anon, token-authed) ─────────────────────
-- Identical to migration 196 except: v_ip is computed before the presence
-- checks, the office-network signal is folded into presence/status, and the
-- insert also sets on_office_network.
create or replace function public.portal_record_attendance(
  emp_slug text,
  emp_token text,
  p_event_type text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric,
  p_selfie_path text,
  p_client_timestamp timestamptz,
  p_ip_address text default null,
  p_user_agent text default null
) returns public.attendance_events
language plpgsql security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
  v_identity jsonb;
  v_loc_id uuid;
  v_loc_radius int;
  v_dist double precision;
  v_within boolean;  -- null = no geofence configured / not evaluated
  v_status text := 'recorded';
  v_skew int;
  v_ip inet;
  v_has_net boolean;   -- any active location has office ranges configured
  v_on_net boolean;    -- this clock-in's IP matched an office range
  v_confirmed boolean; -- inside a geofence OR on the office network
  v_signals boolean;   -- a geofence OR office ranges were configured
  new_row public.attendance_events%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  if not coalesce((select attendance_enabled from public.organizations where id = emp.org_id), false) then
    raise exception 'Attendance is not enabled for this organisation';
  end if;

  if p_event_type not in ('clock_in','clock_out') then
    raise exception 'Invalid event_type';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Coordinates required';
  end if;
  if p_selfie_path is null or length(p_selfie_path) = 0 then
    raise exception 'Selfie required';
  end if;

  v_identity := jsonb_build_object(
    'name', emp.name,
    'employee_code', emp.employee_code,
    'job_position', emp.job_position,
    'department', (
      select d.name from public.employee_departments ed
      join public.company_departments d on d.id = ed.department_id
      where ed.employee_id = emp.id
      order by ed.is_primary desc, d.name asc
      limit 1
    )
  );

  -- IP is best-effort metadata; a malformed value must never block a clock-in.
  begin
    v_ip := nullif(p_ip_address, '')::inet;
  exception when others then
    v_ip := null;
  end;

  -- nearest active geofence for the org
  select l.id, l.radius_meters,
         public.haversine_meters(p_latitude, p_longitude, l.latitude, l.longitude)
    into v_loc_id, v_loc_radius, v_dist
  from public.attendance_locations l
  where l.org_id = emp.org_id and l.is_active and l.deleted_at is null
  order by public.haversine_meters(p_latitude, p_longitude, l.latitude, l.longitude) asc
  limit 1;

  if v_loc_id is not null then
    v_within := v_dist <= v_loc_radius;
  end if;

  -- office-network signal across the org's active locations
  select
    bool_or(coalesce(array_length(l.office_cidrs, 1), 0) > 0),
    bool_or(v_ip is not null and exists (
      select 1 from unnest(l.office_cidrs) c where v_ip <<= c))
  into v_has_net, v_on_net
  from public.attendance_locations l
  where l.org_id = emp.org_id and l.is_active and l.deleted_at is null;

  -- confirmed presence = inside a geofence OR on the office network;
  -- flag only when a signal WAS configured but none confirmed.
  v_confirmed := (v_within is true)
    or (coalesce(v_has_net, false) and coalesce(v_on_net, false));
  v_signals := (v_loc_id is not null) or coalesce(v_has_net, false);
  if v_confirmed then
    v_status := 'recorded';
  elsif v_signals then
    v_status := 'flagged';
  else
    v_status := 'recorded';
  end if;

  if p_client_timestamp is not null then
    v_skew := round(extract(epoch from (now() - p_client_timestamp)))::int;
  end if;

  insert into public.attendance_events (
    org_id, employee_id, event_type, selfie_path,
    latitude, longitude, accuracy_meters,
    location_id, distance_meters, within_geofence,
    client_timestamp, clock_skew_seconds, ip_address, user_agent,
    identity, status, on_office_network
  ) values (
    emp.org_id, emp.id, p_event_type, p_selfie_path,
    p_latitude, p_longitude, p_accuracy_meters,
    v_loc_id, v_dist, v_within,
    p_client_timestamp, v_skew, v_ip, p_user_agent,
    v_identity, v_status,
    case when coalesce(v_has_net, false) then coalesce(v_on_net, false) else null end
  ) returning * into new_row;

  return new_row;
end $$;

revoke execute on function public.portal_record_attendance(text, text, text, numeric, numeric, numeric, text, timestamptz, text, text) from public;
grant execute on function public.portal_record_attendance(text, text, text, numeric, numeric, numeric, text, timestamptz, text, text) to anon, authenticated;

-- ─── RPC: attendance_dashboard_list (authenticated, role-gated) ─────────────
-- Identical to migration 196 plus two jsonb keys: on_office_network and
-- geofence_radius_meters.
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

-- ─── RPC: attendance_locations_list (authenticated, owner/admin) ─────────────
create or replace function public.attendance_locations_list()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text; v jsonb;
begin
  select org_id, role into v_org, v_role from public.users where id = auth.uid();
  if v_org is null or v_role not in ('owner','admin') then raise exception 'Not authorised'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', l.name, 'latitude', l.latitude, 'longitude', l.longitude,
    'radius_meters', l.radius_meters, 'is_active', l.is_active,
    'office_cidrs', coalesce((select array_agg(c::text) from unnest(l.office_cidrs) c), array[]::text[])
  ) order by l.created_at asc), '[]'::jsonb)
  into v from public.attendance_locations l
  where l.org_id = v_org and l.deleted_at is null;
  return v;
end $$;
revoke execute on function public.attendance_locations_list() from public;
grant execute on function public.attendance_locations_list() to authenticated;

-- ─── RPC: attendance_location_upsert (authenticated, owner/admin) ────────────
-- p_id null = insert; otherwise update the org's own row.
create or replace function public.attendance_location_upsert(
  p_id uuid, p_name text, p_latitude numeric, p_longitude numeric,
  p_radius_meters int, p_is_active boolean, p_office_cidrs text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text; v_cidrs cidr[]; row public.attendance_locations%rowtype;
begin
  select org_id, role into v_org, v_role from public.users where id = auth.uid();
  if v_org is null or v_role not in ('owner','admin') then raise exception 'Not authorised'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Name required'; end if;
  begin
    select coalesce(array_agg(c::cidr), '{}') into v_cidrs
    from unnest(coalesce(p_office_cidrs, array[]::text[])) c where length(trim(c)) > 0;
  exception when others then raise exception 'Invalid network range'; end;
  if p_id is null then
    insert into public.attendance_locations (org_id, name, latitude, longitude, radius_meters, is_active, office_cidrs)
    values (v_org, trim(p_name), p_latitude, p_longitude, coalesce(p_radius_meters,150), coalesce(p_is_active,true), v_cidrs)
    returning * into row;
  else
    update public.attendance_locations
      set name = trim(p_name), latitude = p_latitude, longitude = p_longitude,
          radius_meters = coalesce(p_radius_meters,150), is_active = coalesce(p_is_active,true),
          office_cidrs = v_cidrs
      where id = p_id and org_id = v_org and deleted_at is null
      returning * into row;
    if row.id is null then raise exception 'Location not found'; end if;
  end if;
  return jsonb_build_object(
    'id', row.id, 'name', row.name, 'latitude', row.latitude, 'longitude', row.longitude,
    'radius_meters', row.radius_meters, 'is_active', row.is_active,
    'office_cidrs', coalesce((select array_agg(c::text) from unnest(row.office_cidrs) c), array[]::text[]));
end $$;
revoke execute on function public.attendance_location_upsert(uuid, text, numeric, numeric, int, boolean, text[]) from public;
grant execute on function public.attendance_location_upsert(uuid, text, numeric, numeric, int, boolean, text[]) to authenticated;

-- ─── RPC: attendance_location_delete (authenticated, owner/admin) ────────────
create or replace function public.attendance_location_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text;
begin
  select org_id, role into v_org, v_role from public.users where id = auth.uid();
  if v_org is null or v_role not in ('owner','admin') then raise exception 'Not authorised'; end if;
  update public.attendance_locations set deleted_at = now(), deleted_by = auth.uid()
    where id = p_id and org_id = v_org and deleted_at is null;
end $$;
revoke execute on function public.attendance_location_delete(uuid) from public;
grant execute on function public.attendance_location_delete(uuid) to authenticated;
