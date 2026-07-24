-- 215: Reference work hours for attendance — expected start/end per employee.
--
-- Design (Thorne, 2026-07-24):
--   The attendance feature deliberately does NOT compute lateness, does not
--   flag on time, and never touches pay (see 196/203 — status='flagged' means
--   off-site, and the pay engine in 158 reads only contract + pay_adjustments).
--   That stays true here.
--
--   What was missing is the *reference*: HR/finance could see "clocked in
--   09:01" but nothing said the employee was due at 09:00, so the log couldn't
--   be judged without outside knowledge. This migration stores that reference
--   and hands it to the reader — the human decides what, if anything, it means.
--
--   Deliberately NOT built: minutes_late, grace windows, auto-flagging on time,
--   rounding, and any pay consequence. A monetary outcome, if ever wanted, goes
--   through the existing manual pay_adjustments reward/penalise path.
--
--   Hours live on EMPLOYEES, not on contracts. 168's tg_lock_signed_live locks
--   signed contract rows to status-only changes, so contract-held hours would be
--   immutable after signing and a schedule change would mean re-issuing and
--   re-signing (which then trips 169's auto-supersede). The contract text
--   remains the legal record of jam kerja; this column is the operational one.
--
--   Nullable throughout: employee null → fall back to the org default; org
--   default null → no reference configured, and the UI shows a dash. Overnight
--   shifts (22:00 → 06:00) are legal, so end is NOT constrained to be after
--   start.

-- ─── Org-level default ──────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists default_work_start_time time,
  add column if not exists default_work_end_time   time;

-- ─── Per-employee override (null = inherit the org default) ─────────────────
alter table public.employees
  add column if not exists work_start_time time,
  add column if not exists work_end_time   time;

comment on column public.employees.work_start_time is
  'Reference shift start. Null = inherit organizations.default_work_start_time. Informational only — never used to compute lateness or pay.';
comment on column public.employees.work_end_time is
  'Reference shift end. Null = inherit organizations.default_work_end_time. Informational only — never used to compute lateness or pay.';

-- ─── Dashboard read: carry the effective expected hours ─────────────────────
-- Re-created from migration 203 plus two jsonb keys (expected_start,
-- expected_end) and the organizations join that resolves them. The role gate,
-- the other joins, the 90-day window and the grants are unchanged.
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
    'expected_start', to_char(coalesce(emp.work_start_time, org.default_work_start_time), 'HH24:MI'),
    'expected_end',   to_char(coalesce(emp.work_end_time,   org.default_work_end_time),   'HH24:MI'),
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

-- ─── Portal read: show an employee their own expected hours ─────────────────
-- Re-created from migration 196 plus expected_start / expected_end. Token auth,
-- the 30-day window and the grants are unchanged.
create or replace function public.portal_list_attendance(emp_slug text, emp_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare emp public.employees%rowtype; v_start text; v_end text; v jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select to_char(coalesce(emp.work_start_time, o.default_work_start_time), 'HH24:MI'),
         to_char(coalesce(emp.work_end_time,   o.default_work_end_time),   'HH24:MI')
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
