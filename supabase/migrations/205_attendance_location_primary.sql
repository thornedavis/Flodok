-- Attendance — primary/default location.
--
-- Design (Thorne, 2026-07-04):
--   - Location management is consolidating into Settings → Attendance, and each
--     org now has a single primary/default location (a marker for V1: badge in
--     the manager + the overview map centres on it). Geofence logic stays
--     "nearest active location" — primary does NOT change presence evaluation
--     (future: could prefer/weight the primary).
--   - attendance_locations.is_primary marks that row. Exactly one primary per
--     org is maintained by the attendance_location_set_primary RPC, NOT a
--     partial-unique index — a single UPDATE flipping every row's is_primary
--     would trip a unique index mid-statement.
--   - First location an org creates is auto-primary (see the upsert INSERT
--     branch); the update branch never touches is_primary.

-- ─── 1. Primary marker column ───────────────────────────────────────────────
alter table public.attendance_locations
  add column if not exists is_primary boolean not null default false;

-- ─── RPC: attendance_locations_list (authenticated, owner/admin) ─────────────
-- Copied from migration 198 verbatim, plus the is_primary key.
create or replace function public.attendance_locations_list()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text; v jsonb;
begin
  select org_id, role into v_org, v_role from public.users where id = auth.uid();
  if v_org is null or v_role not in ('owner','admin') then raise exception 'Not authorised'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', l.name, 'latitude', l.latitude, 'longitude', l.longitude,
    'radius_meters', l.radius_meters, 'is_active', l.is_active,
    'office_cidrs', coalesce((select array_agg(c::text) from unnest(l.office_cidrs) c), array[]::text[]),
    'is_primary', l.is_primary
  ) order by l.created_at asc), '[]'::jsonb)
  into v from public.attendance_locations l
  where l.org_id = v_org and l.deleted_at is null;
  return v;
end $$;
revoke execute on function public.attendance_locations_list() from public;
grant execute on function public.attendance_locations_list() to authenticated;

-- ─── RPC: attendance_location_upsert (authenticated, owner/admin) ────────────
-- Copied from migration 198 verbatim, plus: INSERT auto-sets is_primary when
-- the org has no other non-deleted location (first location → primary); the
-- UPDATE branch leaves is_primary untouched; both returned rows carry is_primary.
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
    insert into public.attendance_locations (org_id, name, latitude, longitude, radius_meters, is_active, office_cidrs, is_primary)
    values (v_org, trim(p_name), p_latitude, p_longitude, coalesce(p_radius_meters,150), coalesce(p_is_active,true), v_cidrs,
      (not exists (select 1 from public.attendance_locations x where x.org_id = v_org and x.deleted_at is null)))
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
    'office_cidrs', coalesce((select array_agg(c::text) from unnest(row.office_cidrs) c), array[]::text[]),
    'is_primary', row.is_primary);
end $$;
revoke execute on function public.attendance_location_upsert(uuid, text, numeric, numeric, int, boolean, text[]) from public;
grant execute on function public.attendance_location_upsert(uuid, text, numeric, numeric, int, boolean, text[]) to authenticated;

-- ─── RPC: attendance_location_set_primary (authenticated, owner/admin) ───────
-- Flips is_primary so exactly one non-deleted location per org is primary.
create or replace function public.attendance_location_set_primary(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role text;
begin
  select org_id, role into v_org, v_role from public.users where id = auth.uid();
  if v_org is null or v_role not in ('owner','admin') then raise exception 'Not authorised'; end if;
  if not exists (select 1 from public.attendance_locations where id = p_id and org_id = v_org and deleted_at is null) then
    raise exception 'Location not found';
  end if;
  update public.attendance_locations
    set is_primary = (id = p_id)
    where org_id = v_org and deleted_at is null;
end $$;
revoke execute on function public.attendance_location_set_primary(uuid) from public;
grant execute on function public.attendance_location_set_primary(uuid) to authenticated;
