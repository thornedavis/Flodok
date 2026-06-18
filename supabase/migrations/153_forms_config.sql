-- Forms Phase 4 — per-org form configuration ("configurable superset").
--
-- Config lives as a JSONB blob on organizations (no new table — Settings
-- already edits the org row, and the shape is small). The curated forms stay
-- code-defined; config can only SUBTRACT (disable leave types), RENAME (later),
-- or REQUIRE (toggle reason required) — never add fields or change logic.
--
-- Shape:
--   {
--     "leave_request":    { "enabled_leave_types": ["annual","unpaid",...], "require_reason": false },
--     "overtime_request": { "enabled_work_statuses": ["permanent","contract","daily","piecework"] }
--   }
-- A missing key means "default" (all options enabled, reason optional).

alter table public.organizations
  add column if not exists forms_config jsonb not null default '{}'::jsonb;

-- Portal (token-authed) read of the org's form config so the employee forms
-- render only the enabled options.
create or replace function public.portal_forms_config(emp_slug text, emp_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  return coalesce((select forms_config from public.organizations where id = emp.org_id), '{}'::jsonb);
end;
$$;

revoke execute on function public.portal_forms_config(text, text) from public;
grant  execute on function public.portal_forms_config(text, text) to anon, authenticated;
