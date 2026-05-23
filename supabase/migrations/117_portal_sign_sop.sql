-- Authenticated portal signing (Phase 2b).
--
-- Closes the gap left by the original migration 011 anon insert policy
-- on sop_signatures, which was "to anon with check (true)" — anyone
-- could POST a row for any (sop_id, employee_id). Under the audience
-- model that hole is bigger, because we now want signing to be valid
-- only if the employee is actually in the resolved audience.
--
-- New SECURITY DEFINER RPC: portal_sign_sop validates the portal
-- (slug + access_token) session, checks the calling employee is in the
-- SOP's resolved audience, resolves which audience target made them a
-- required signer (for the required_via audit column), and inserts the
-- signature. Returns the new row so the portal can update its local
-- "signed?" state without a refetch.
--
-- The old permissive policy is dropped — direct anon inserts no longer
-- work. Portal.tsx switches to the RPC in the same change.

create or replace function public.portal_sign_sop(
  emp_slug text,
  emp_token text,
  p_sop_id uuid,
  p_typed_name text,
  p_signature_font text default null
)
returns public.sop_signatures
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  sop public.sops%rowtype;
  matched_via text;
  new_row public.sop_signatures%rowtype;
begin
  -- 1. Portal auth: slug + access_token must match a non-trashed employee.
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  -- 2. SOP must exist, be active, in the same org, not trashed.
  select * into sop from public.sops where id = p_sop_id;
  if sop.id is null or sop.deleted_at is not null then
    raise exception 'SOP not found' using errcode = 'P0002';
  end if;
  if sop.org_id <> emp.org_id then
    raise exception 'SOP belongs to another organisation';
  end if;
  if sop.status <> 'active' then
    raise exception 'SOP is not active and cannot be signed';
  end if;

  -- 3. Audience check + required_via resolution in priority order.
  --    Pick the most specific reason this employee is in the audience:
  --    direct > department > branch > position > level > class > everyone.
  select target_type into matched_via from (
    select 'employee' as target_type, 1 as priority
    where exists (
      select 1 from public.sop_audience sa
      where sa.sop_id = p_sop_id
        and sa.target_type = 'employee'
        and sa.employee_id = emp.id
    )
    union all
    select 'department', 2
    where exists (
      select 1 from public.sop_audience sa
      join public.employee_departments ed on ed.department_id = sa.department_id
      where sa.sop_id = p_sop_id
        and sa.target_type = 'department'
        and ed.employee_id = emp.id
    )
    union all
    select 'branch', 3
    where exists (
      select 1 from public.sop_audience sa
      join public.company_branches cb on cb.id = sa.branch_id
      where sa.sop_id = p_sop_id
        and sa.target_type = 'branch'
        and trim(cb.name) = trim(coalesce(emp.branch_name, ''))
        and trim(cb.name) <> ''
    )
    union all
    select 'job_position', 4
    where exists (
      select 1 from public.sop_audience sa
      join public.company_reference_values crv on crv.id = sa.reference_id
      where sa.sop_id = p_sop_id
        and sa.target_type = 'job_position'
        and crv.kind = 'job_position'
        and trim(crv.name) = trim(coalesce(emp.job_position, ''))
        and trim(crv.name) <> ''
    )
    union all
    select 'job_level', 5
    where exists (
      select 1 from public.sop_audience sa
      join public.company_reference_values crv on crv.id = sa.reference_id
      where sa.sop_id = p_sop_id
        and sa.target_type = 'job_level'
        and crv.kind = 'job_level'
        and trim(crv.name) = trim(coalesce(emp.job_level, ''))
        and trim(crv.name) <> ''
    )
    union all
    select 'employee_class', 6
    where exists (
      select 1 from public.sop_audience sa
      join public.company_reference_values crv on crv.id = sa.reference_id
      where sa.sop_id = p_sop_id
        and sa.target_type = 'employee_class'
        and crv.kind = 'employee_class'
        and trim(crv.name) = trim(coalesce(emp.class, ''))
        and trim(crv.name) <> ''
    )
    union all
    select 'everyone', 7
    where exists (
      select 1 from public.sop_audience sa
      where sa.sop_id = p_sop_id and sa.target_type = 'everyone'
    )
  ) candidates
  order by priority
  limit 1;

  if matched_via is null then
    raise exception 'You are not in the audience for this SOP' using errcode = '42501';
  end if;

  -- 4. Insert. The unique(sop_id, employee_id, version_number) index
  --    will reject duplicate signs for the same version with 23505,
  --    which the client surfaces as "already signed".
  insert into public.sop_signatures
    (sop_id, employee_id, version_number, typed_name, signature_font, required_via)
  values
    (p_sop_id, emp.id, sop.current_version, p_typed_name, p_signature_font, matched_via)
  returning * into new_row;

  return new_row;
end;
$$;

revoke execute on function public.portal_sign_sop(text, text, uuid, text, text) from public;
grant execute on function public.portal_sign_sop(text, text, uuid, text, text) to anon, authenticated;

-- ─── Drop the permissive anon insert policy from migration 011 ────

drop policy if exists "Public can insert signatures" on public.sop_signatures;
