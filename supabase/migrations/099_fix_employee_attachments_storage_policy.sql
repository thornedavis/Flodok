-- Fix RLS policies on `storage.objects` for the `employee_attachments`
-- bucket. The original 098 policies had an unqualified `name` reference
-- inside an EXISTS subquery against `public.employees` — and because
-- `employees.name` exists as a column, Postgres binds the unqualified
-- `name` to the inner scope (the employee's name) instead of to
-- `storage.objects.name` (the file path). That makes the EXISTS check
-- always false and every upload gets rejected with
-- "new row violates row-level security policy".
--
-- The fix: pull the path-prefix extraction out into the outer WITH CHECK
-- expression — where `name` unambiguously refers to `storage.objects.name`
-- — and pass the resolved UUID into a subquery that only references
-- `employees`. No ambiguity, no surprise binding.
--
-- The table-level policies on `public.employee_attachments` itself are
-- unaffected (they qualify everything) and remain the real org gate.

drop policy if exists "Org members can insert employee attachments" on storage.objects;
drop policy if exists "Org members can update employee attachments" on storage.objects;
drop policy if exists "Org members can delete employee attachments" on storage.objects;

create policy "Org members can insert employee attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'employee_attachments'
    and split_part(name, '/', 1)::uuid in (
      select id from public.employees
      where org_id = public.get_user_org_id()
    )
  );

create policy "Org members can update employee attachments"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'employee_attachments'
    and split_part(name, '/', 1)::uuid in (
      select id from public.employees
      where org_id = public.get_user_org_id()
    )
  );

create policy "Org members can delete employee attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'employee_attachments'
    and split_part(name, '/', 1)::uuid in (
      select id from public.employees
      where org_id = public.get_user_org_id()
    )
  );
