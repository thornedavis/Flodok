-- Helper for the employee-delete modal (Phase 5).
--
-- Returns counts the UI needs to decide whether to surface the
-- cascade-delete option and what to say to the user:
--
--   sole_audience_sops   — SOPs where this employee is the only
--                          audience row, i.e. trashing the employee
--                          would orphan the SOP (cascade eligible).
--
--   shared_audience_sops — SOPs where this employee appears as one
--                          of several audience targets. These SOPs
--                          stay alive; the employee just stops
--                          showing up as a required signer.
--
-- Both numbers ignore already-trashed SOPs (deleted_at is null).

create or replace function public.employee_audience_impact(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  emp_org uuid;
  sole_count int;
  shared_count int;
begin
  select org_id into emp_org from public.employees where id = p_employee_id;
  if emp_org is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  perform public._trash_assert_caller_authorized(emp_org);

  with audience_for_emp as (
    select distinct sop_id
    from public.sop_audience
    where employee_id = p_employee_id
  ),
  rolled_up as (
    select
      a.sop_id,
      bool_and(a.target_type = 'employee' and a.employee_id = p_employee_id) as is_sole
    from public.sop_audience a
    where a.sop_id in (select sop_id from audience_for_emp)
    group by a.sop_id
  ),
  filtered as (
    select r.sop_id, r.is_sole
    from rolled_up r
    join public.sops s on s.id = r.sop_id and s.deleted_at is null
  )
  select
    count(*) filter (where is_sole),
    count(*) filter (where not is_sole)
  into sole_count, shared_count
  from filtered;

  return jsonb_build_object(
    'sole_audience_sops', coalesce(sole_count, 0),
    'shared_audience_sops', coalesce(shared_count, 0)
  );
end;
$$;

revoke execute on function public.employee_audience_impact(uuid) from public, anon;
grant execute on function public.employee_audience_impact(uuid) to authenticated;
