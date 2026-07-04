-- Attendance — employee clock-in/out with selfie + GPS geofence (V1: capture + log).
--
-- Design (Thorne, 2026-07-02):
--   - One immutable row per clock event (clock_in / clock_out).
--   - Selfie captured live in-browser; stored in the private 'attendance_photos'
--     bucket at {org_id}/{employee_id}/{uuid}. The row stores only the path.
--   - server_timestamp (default now()) is authoritative; client_timestamp kept
--     for skew detection only.
--   - Geofence computed server-side vs attendance_locations (haversine). We
--     RECORD-AND-FLAG: off-site events are stored with status='flagged', never
--     rejected. If the org has no location configured we don't flag.
--   - Opt-in per org via organizations.attendance_enabled (default false).

alter table public.organizations
  add column if not exists attendance_enabled boolean not null default false;

-- ─── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.attendance_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  radius_meters int not null default 150,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);
create index if not exists idx_attendance_locations_org
  on public.attendance_locations (org_id) where deleted_at is null;

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  event_type text not null check (event_type in ('clock_in','clock_out')),
  selfie_path text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_meters numeric(8,1),
  location_id uuid references public.attendance_locations(id) on delete set null,
  distance_meters numeric(10,1),
  within_geofence boolean,  -- null = no geofence configured / not evaluated
  client_timestamp timestamptz,
  server_timestamp timestamptz not null default now(),
  clock_skew_seconds int,
  ip_address inet,
  user_agent text,
  identity jsonb not null default '{}'::jsonb,
  status text not null default 'recorded' check (status in ('recorded','flagged','excused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);
create index if not exists idx_attendance_events_lookup
  on public.attendance_events (org_id, employee_id, server_timestamp desc) where deleted_at is null;
create index if not exists idx_attendance_events_status
  on public.attendance_events (org_id, status) where deleted_at is null;

-- ─── updated_at touch trigger ───────────────────────────────────────────────
create or replace function public.tg_attendance_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_attendance_events_touch on public.attendance_events;
create trigger trg_attendance_events_touch before update on public.attendance_events
  for each row execute function public.tg_attendance_touch();

drop trigger if exists trg_attendance_locations_touch on public.attendance_locations;
create trigger trg_attendance_locations_touch before update on public.attendance_locations
  for each row execute function public.tg_attendance_touch();

-- ─── Geofence helper (haversine, metres) ────────────────────────────────────
create or replace function public.haversine_meters(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.attendance_locations enable row level security;
alter table public.attendance_events enable row level security;

drop policy if exists "Attendance locations visible in org" on public.attendance_locations;
create policy "Attendance locations visible in org"
  on public.attendance_locations for select to authenticated
  using (org_id = public.get_user_org_id() and deleted_at is null);

drop policy if exists "Attendance locations managed by admins" on public.attendance_locations;
create policy "Attendance locations managed by admins"
  on public.attendance_locations for all to authenticated
  using (org_id = public.get_user_org_id() and public.get_user_role() in ('owner','admin'))
  with check (org_id = public.get_user_org_id() and public.get_user_role() in ('owner','admin'));

drop policy if exists "Attendance events visible to authorised viewers" on public.attendance_events;
create policy "Attendance events visible to authorised viewers"
  on public.attendance_events for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and (
      public.get_user_role() in ('owner','admin','hr')
      or employee_id in (
        select u.employee_id from public.users u
        where u.id = auth.uid() and u.employee_id is not null
      )
    )
  );

-- ─── Storage bucket + policies ──────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance_photos','attendance_photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Org members can view attendance photos" on storage.objects;
create policy "Org members can view attendance photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance_photos'
    and split_part(name, '/', 1) = public.get_user_org_id()::text
    and public.get_user_role() in ('owner','admin','hr')
  );

drop policy if exists "Service role can insert attendance photos" on storage.objects;
create policy "Service role can insert attendance photos"
  on storage.objects for insert to service_role
  with check (bucket_id = 'attendance_photos');

-- ─── RPC: portal_record_attendance (anon, token-authed) ─────────────────────
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
    if not v_within then v_status := 'flagged'; end if;  -- record-and-flag
  end if;

  if p_client_timestamp is not null then
    v_skew := round(extract(epoch from (now() - p_client_timestamp)))::int;
  end if;

  -- IP is best-effort metadata; a malformed value must never block a clock-in.
  begin
    v_ip := nullif(p_ip_address, '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.attendance_events (
    org_id, employee_id, event_type, selfie_path,
    latitude, longitude, accuracy_meters,
    location_id, distance_meters, within_geofence,
    client_timestamp, clock_skew_seconds, ip_address, user_agent,
    identity, status
  ) values (
    emp.org_id, emp.id, p_event_type, p_selfie_path,
    p_latitude, p_longitude, p_accuracy_meters,
    v_loc_id, v_dist, v_within,
    p_client_timestamp, v_skew, v_ip, p_user_agent,
    v_identity, v_status
  ) returning * into new_row;

  return new_row;
end $$;

revoke execute on function public.portal_record_attendance(text, text, text, numeric, numeric, numeric, text, timestamptz, text, text) from public;
grant execute on function public.portal_record_attendance(text, text, text, numeric, numeric, numeric, text, timestamptz, text, text) to anon, authenticated;

-- ─── RPC: portal_list_attendance (anon, token-authed) ───────────────────────
create or replace function public.portal_list_attendance(emp_slug text, emp_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare emp public.employees%rowtype; v jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'event_type', e.event_type, 'server_timestamp', e.server_timestamp,
    'within_geofence', e.within_geofence, 'status', e.status
  ) order by e.server_timestamp desc), '[]'::jsonb)
  into v
  from public.attendance_events e
  where e.employee_id = emp.id and e.deleted_at is null
    and e.server_timestamp > now() - interval '30 days';
  return v;
end $$;
revoke execute on function public.portal_list_attendance(text, text) from public;
grant execute on function public.portal_list_attendance(text, text) to anon, authenticated;

-- ─── RPC: attendance_dashboard_list (authenticated, role-gated) ─────────────
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
