-- Audience-aware read RPCs (Phase 2).
--
-- 1. sop_resolved_audience(sop_id) expands rows in sop_audience into a
--    distinct set of employee ids, walking the membership shape of each
--    target type:
--      everyone        → every active employee in the SOP's org
--      employee        → that employee (when in the SOP's org)
--      department      → employees joined via employee_departments
--      branch          → employees.branch_name = company_branches.name
--      job_position    → employees.job_position = ref value name
--      job_level       → employees.job_level   = ref value name
--      employee_class  → employees.class       = ref value name
--    DISTINCT, excludes deleted/inactive employees, scoped to the SOP's org.
--
-- 2. portal_documents is rewritten to surface every active SOP the calling
--    employee is in the audience of (replacing the old direct
--    sops.employee_id = me filter). Existing function signature is
--    preserved so the front-end doesn't need to change yet.
--
-- 3. sop_signature_progress(sop_id) returns required vs signed counts and
--    per-employee detail for admin/HR users in the SOP's org.

-- ─── sop_resolved_audience ───────────────────────────────────

create or replace function public.sop_resolved_audience(p_sop_id uuid)
returns table (employee_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  with sop_org as (
    select org_id from public.sops where id = p_sop_id
  )
  select distinct e.id as employee_id
  from public.employees e
  join sop_org so on so.org_id = e.org_id
  where e.deleted_at is null
    and exists (
      select 1
      from public.sop_audience sa
      where sa.sop_id = p_sop_id
        and (
          sa.target_type = 'everyone'
          or (sa.target_type = 'employee' and sa.employee_id = e.id)
          or (sa.target_type = 'department' and exists (
                select 1 from public.employee_departments ed
                where ed.employee_id = e.id and ed.department_id = sa.department_id
              ))
          or (sa.target_type = 'branch' and exists (
                select 1 from public.company_branches cb
                where cb.id = sa.branch_id
                  and cb.org_id = e.org_id
                  and trim(cb.name) = trim(coalesce(e.branch_name, ''))
                  and trim(cb.name) <> ''
              ))
          or (sa.target_type in ('job_position','job_level','employee_class') and exists (
                select 1 from public.company_reference_values crv
                where crv.id = sa.reference_id
                  and crv.org_id = e.org_id
                  and crv.kind = sa.target_type
                  and trim(crv.name) = trim(coalesce(
                        case sa.target_type
                          when 'job_position'    then e.job_position
                          when 'job_level'       then e.job_level
                          when 'employee_class'  then e.class
                        end, ''))
                  and trim(crv.name) <> ''
              ))
        )
    );
$$;

revoke execute on function public.sop_resolved_audience(uuid) from public;
grant execute on function public.sop_resolved_audience(uuid) to anon, authenticated;

-- ─── portal_documents (audience-aware) ───────────────────────

create or replace function public.portal_documents(
  emp_slug text,
  emp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  org public.organizations%rowtype;
  result jsonb;
begin
  select * into emp
  from public.employees
  where slug = emp_slug
    and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org
  from public.organizations
  where id = emp.org_id;

  select jsonb_build_object(
    'org', to_jsonb(org),
    'sops', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at asc)
      from public.sops s
      where s.org_id = emp.org_id
        and s.status = 'active'
        and s.deleted_at is null
        and emp.id in (select employee_id from public.sop_resolved_audience(s.id))
    ), '[]'::jsonb),
    'contracts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at asc)
      from public.contracts c
      where c.employee_id = emp.id
        and c.status = 'active'
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.portal_documents(text, text) to anon, authenticated;

-- ─── sop_signature_progress (admin/HR) ───────────────────────

create or replace function public.sop_signature_progress(p_sop_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  sop public.sops%rowtype;
  caller_org uuid;
  caller_role text;
  result jsonb;
begin
  -- Caller must be an authenticated user in the same org as the SOP.
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select org_id, role into caller_org, caller_role
  from public.users where id = auth.uid();

  select * into sop from public.sops where id = p_sop_id;
  if sop.id is null then
    raise exception 'SOP not found' using errcode = 'P0002';
  end if;

  if caller_org is null or caller_org <> sop.org_id then
    raise exception 'SOP belongs to another organisation';
  end if;

  with required as (
    select e.id, e.name, e.job_position
    from public.sop_resolved_audience(p_sop_id) ra
    join public.employees e on e.id = ra.employee_id
  ),
  signed as (
    select ss.employee_id, ss.signed_at, ss.typed_name, ss.required_via, ss.version_number
    from public.sop_signatures ss
    where ss.sop_id = p_sop_id
      and ss.version_number = sop.current_version
  )
  select jsonb_build_object(
    'sop_id', sop.id,
    'current_version', sop.current_version,
    'required_count', (select count(*) from required),
    'signed_count', (select count(*) from signed where employee_id in (select id from required)),
    'employees', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'employee_id', r.id,
                 'name', r.name,
                 'job_position', r.job_position,
                 'signed_at', s.signed_at,
                 'typed_name', s.typed_name,
                 'required_via', s.required_via
               )
               order by (s.signed_at is null) desc, r.name asc
             )
      from required r
      left join signed s on s.employee_id = r.id
    ), '[]'::jsonb),
    'extra_signatures', coalesce((
      -- Signatures from employees no longer in the audience (e.g. moved
      -- departments since signing). Surfaced so admins keep historical
      -- visibility without inflating signed_count.
      select jsonb_agg(jsonb_build_object(
               'employee_id', s.employee_id,
               'signed_at', s.signed_at,
               'typed_name', s.typed_name,
               'required_via', s.required_via,
               'version_number', s.version_number
             ))
      from public.sop_signatures s
      where s.sop_id = p_sop_id
        and s.employee_id not in (select id from required)
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.sop_signature_progress(uuid) from public;
grant execute on function public.sop_signature_progress(uuid) to authenticated;
