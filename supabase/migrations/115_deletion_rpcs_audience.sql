-- Deletion semantics under the audience model (Phase 5).
--
-- Two behaviour changes land here:
--
-- 1. trash_employee no longer cascade-trashes every SOP linked via the
--    legacy sops.employee_id column. Under the new model an employee can
--    appear in many SOPs' audience without being the sole target, and
--    only the SOPs where they were the *sole remaining* audience row
--    should be considered orphaned by their removal. Their sop_audience
--    rows are dropped unconditionally — a trashed employee should never
--    resolve into an audience anywhere.
--
-- 2. New RPCs (delete_department / delete_branch / delete_reference_value)
--    detach the entity's sop_audience rows and delete the entity itself
--    in a single transaction, so the Company page can offer "Detach from
--    N SOPs and delete" without ever hitting the on-delete-restrict guard
--    set up in migration 110. Each returns counts so the UI can echo back
--    what was actually touched.

-- ─── trash_employee (audience-aware) ─────────────────────────

create or replace function public.trash_employee(
  p_employee_id uuid,
  p_cascade_docs boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_org uuid;
  now_ts timestamptz := now();
  actor uuid := auth.uid();
begin
  select org_id into emp_org from public.employees
  where id = p_employee_id and deleted_at is null;

  if emp_org is null then
    raise exception 'Employee not found or already trashed';
  end if;

  perform public._trash_assert_caller_authorized(emp_org);

  -- Mark the employee trashed first; downstream lookups (audience
  -- resolution, signature progress) filter on deleted_at so they stop
  -- counting this employee immediately.
  update public.employees
  set deleted_at = now_ts, deleted_by = actor
  where id = p_employee_id;

  -- Sole-target cascade: only trash SOPs where every audience row is
  -- this employee. Multi-target / group-targeted SOPs are NOT trashed
  -- — they remain useful for the rest of the audience and just lose
  -- this employee as an explicit target.
  if p_cascade_docs then
    update public.sops
    set deleted_at = now_ts,
        deleted_by = actor,
        trashed_with_parent_id = p_employee_id
    where deleted_at is null
      and id in (
        select sop_id
        from public.sop_audience
        where sop_id in (
          select sop_id from public.sop_audience where employee_id = p_employee_id
        )
        group by sop_id
        having bool_and(target_type = 'employee' and employee_id = p_employee_id)
      );

    -- Contracts are still 1:1 with employee_id today, so the original
    -- cascade rule applies unchanged.
    update public.contracts
    set deleted_at = now_ts,
        deleted_by = actor,
        trashed_with_parent_id = p_employee_id
    where employee_id = p_employee_id
      and deleted_at is null;
  end if;

  -- Always drop this employee's audience targeting — they shouldn't
  -- resolve into any SOP's audience once trashed, regardless of the
  -- cascade choice.
  delete from public.sop_audience where employee_id = p_employee_id;
end;
$$;

-- Grants are unchanged from migration 104; CREATE OR REPLACE preserves them,
-- but re-asserting keeps the file self-contained.
revoke execute on function public.trash_employee(uuid, boolean) from public, anon;
grant execute on function public.trash_employee(uuid, boolean) to authenticated;

-- ─── delete_department (detach audience + hard delete) ───────

create or replace function public.delete_department(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dept_org uuid;
  detached_audience int;
  detached_owner int;
begin
  select org_id into dept_org from public.company_departments where id = p_id;
  if dept_org is null then
    raise exception 'Department not found' using errcode = 'P0002';
  end if;

  perform public._trash_assert_caller_authorized(dept_org);

  -- 1. Remove the department as an audience target wherever it's used.
  with deleted as (
    delete from public.sop_audience where department_id = p_id returning sop_id
  )
  select count(*) into detached_audience from deleted;

  -- 2. The owner_department_id FK is ON DELETE SET NULL, so we don't
  --    have to do anything special — but we return the count so the UI
  --    can show "also unset as owner on N SOPs".
  select count(*) into detached_owner from public.sops where owner_department_id = p_id;

  -- 3. employee_departments has ON DELETE CASCADE, so the join rows
  --    disappear with the department row itself.
  delete from public.company_departments where id = p_id;

  return jsonb_build_object(
    'detached_audience_rows', detached_audience,
    'detached_owner_rows', detached_owner
  );
end;
$$;

revoke execute on function public.delete_department(uuid) from public, anon;
grant execute on function public.delete_department(uuid) to authenticated;

-- ─── delete_branch (detach audience + hard delete) ───────────

create or replace function public.delete_branch(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_org uuid;
  branch_name_str text;
  detached_audience int;
  cleared_employees int;
begin
  select org_id, name into branch_org, branch_name_str
  from public.company_branches where id = p_id;
  if branch_org is null then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;

  perform public._trash_assert_caller_authorized(branch_org);

  -- 1. Remove as an audience target.
  with deleted as (
    delete from public.sop_audience where branch_id = p_id returning sop_id
  )
  select count(*) into detached_audience from deleted;

  -- 2. Null the denormalised name on employees in this branch — same
  --    cleanup the previous client-side handler did.
  with cleared as (
    update public.employees set branch_name = null
    where org_id = branch_org and branch_name = branch_name_str
    returning id
  )
  select count(*) into cleared_employees from cleared;

  delete from public.company_branches where id = p_id;

  return jsonb_build_object(
    'detached_audience_rows', detached_audience,
    'cleared_employee_rows', cleared_employees
  );
end;
$$;

revoke execute on function public.delete_branch(uuid) from public, anon;
grant execute on function public.delete_branch(uuid) to authenticated;

-- ─── delete_reference_value (positions / levels / classes) ────

create or replace function public.delete_reference_value(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_org uuid;
  ref_name text;
  ref_kind text;
  detached_audience int;
  cleared_employees int;
begin
  select org_id, name, kind into ref_org, ref_name, ref_kind
  from public.company_reference_values where id = p_id;
  if ref_org is null then
    raise exception 'Reference value not found' using errcode = 'P0002';
  end if;

  perform public._trash_assert_caller_authorized(ref_org);

  -- 1. Remove as an audience target.
  with deleted as (
    delete from public.sop_audience where reference_id = p_id returning sop_id
  )
  select count(*) into detached_audience from deleted;

  -- 2. Null the denormalised text column on employees, picking the
  --    right column for this kind. Matches the previous client-side
  --    updateEmployeeValues() behaviour exactly.
  if ref_kind = 'job_position' then
    with cleared as (
      update public.employees set job_position = null
      where org_id = ref_org and job_position = ref_name
      returning id
    )
    select count(*) into cleared_employees from cleared;
  elsif ref_kind = 'job_level' then
    with cleared as (
      update public.employees set job_level = null
      where org_id = ref_org and job_level = ref_name
      returning id
    )
    select count(*) into cleared_employees from cleared;
  elsif ref_kind = 'employee_class' then
    with cleared as (
      update public.employees set class = null
      where org_id = ref_org and class = ref_name
      returning id
    )
    select count(*) into cleared_employees from cleared;
  else
    cleared_employees := 0;
  end if;

  delete from public.company_reference_values where id = p_id;

  return jsonb_build_object(
    'detached_audience_rows', detached_audience,
    'cleared_employee_rows', cleared_employees,
    'kind', ref_kind
  );
end;
$$;

revoke execute on function public.delete_reference_value(uuid) from public, anon;
grant execute on function public.delete_reference_value(uuid) to authenticated;
