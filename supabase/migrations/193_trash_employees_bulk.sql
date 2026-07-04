-- Atomic bulk employee trash.
--
-- The delete modal's bulk path looped `trash_employee` once per id from the
-- client (await in a for-loop). A failure partway — an auth error, a DB error on
-- the 3rd of 5 — left the earlier ones trashed and the rest not, with no clean
-- rollback and a half-applied selection.
--
-- Wrap the loop in one SECURITY DEFINER function so the whole batch is a single
-- transaction: any real error aborts and rolls back every trash in the call.
-- Rows already gone (concurrently trashed / bad id) are skipped, not errored, so
-- a stale selection doesn't nuke the batch; per-employee authorization still runs
-- inside trash_employee, so a cross-org id aborts the whole call.

create or replace function public.trash_employees(
  p_employee_ids uuid[],
  p_cascade_docs boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count int := 0;
begin
  foreach v_id in array coalesce(p_employee_ids, '{}') loop
    -- Skip anything already gone; trash live rows. trash_employee enforces
    -- caller authorization per employee, and any error it raises aborts the
    -- whole (single-transaction) batch.
    if exists (select 1 from public.employees where id = v_id and deleted_at is null) then
      perform public.trash_employee(v_id, p_cascade_docs);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.trash_employees(uuid[], boolean) from public, anon;
grant execute on function public.trash_employees(uuid[], boolean) to authenticated;
