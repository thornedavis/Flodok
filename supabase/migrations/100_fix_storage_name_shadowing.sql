-- Fix `name`-shadowing bug across legacy storage.objects policies.
--
-- Several existing policies put an unqualified `name` reference inside an
-- EXISTS subquery against `public.employees`. Postgres binds the
-- unqualified reference to the innermost scope, and `employees.name` is
-- a real column — so `split_part(name, ...)` was operating on the
-- employee's full name rather than the storage object's path. The EXISTS
-- check was always false and every affected upload was rejected with
-- "new row violates row-level security policy".
--
-- Affected:
--   * 019_avatar_storage_policies — branch 3 (employee photo upload,
--     path shape `<employee_id>.<ext>`). User-avatar and org-logo branches
--     don't use a subquery so they were unaffected.
--   * 021_employee_documents_and_departments — KTP / Surat KK uploads.
--   * 098_employee_attachments — already fixed by 099.
--
-- Fix pattern: pull the path-extraction expression out into the outer
-- WITH CHECK / USING expression (where `name` unambiguously refers to
-- `storage.objects.name`) and feed the resolved UUID into a subquery
-- that only references `employees`. Same structural fix as 099.

-- ---------- avatars ----------------------------------------------------------

drop policy if exists "Scoped avatar inserts" on storage.objects;
drop policy if exists "Scoped avatar updates" on storage.objects;
drop policy if exists "Scoped avatar deletes" on storage.objects;

create policy "Scoped avatar inserts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      (name like 'user/%'
        and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text)
      or (name like 'org/%'
        and split_part(split_part(name, '/', 2), '.', 1) = public.get_user_org_id()::text
        and public.get_user_role() in ('owner', 'admin'))
      or (position('/' in name) = 0
        and split_part(name, '.', 1)::uuid in (
          select id from public.employees
          where org_id = public.get_user_org_id()
        ))
    )
  );

create policy "Scoped avatar updates"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (name like 'user/%'
        and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text)
      or (name like 'org/%'
        and split_part(split_part(name, '/', 2), '.', 1) = public.get_user_org_id()::text
        and public.get_user_role() in ('owner', 'admin'))
      or (position('/' in name) = 0
        and split_part(name, '.', 1)::uuid in (
          select id from public.employees
          where org_id = public.get_user_org_id()
        ))
    )
  );

create policy "Scoped avatar deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (name like 'user/%'
        and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text)
      or (name like 'org/%'
        and split_part(split_part(name, '/', 2), '.', 1) = public.get_user_org_id()::text
        and public.get_user_role() in ('owner', 'admin'))
      or (position('/' in name) = 0
        and split_part(name, '.', 1)::uuid in (
          select id from public.employees
          where org_id = public.get_user_org_id()
        ))
    )
  );

-- ---------- employee_docs ----------------------------------------------------

drop policy if exists "Org members can insert employee docs" on storage.objects;
drop policy if exists "Org members can update employee docs" on storage.objects;
drop policy if exists "Org members can delete employee docs" on storage.objects;

create policy "Org members can insert employee docs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'employee_docs'
    and split_part(name, '/', 1)::uuid in (
      select id from public.employees
      where org_id = public.get_user_org_id()
    )
  );

create policy "Org members can update employee docs"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'employee_docs'
    and split_part(name, '/', 1)::uuid in (
      select id from public.employees
      where org_id = public.get_user_org_id()
    )
  );

create policy "Org members can delete employee docs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'employee_docs'
    and split_part(name, '/', 1)::uuid in (
      select id from public.employees
      where org_id = public.get_user_org_id()
    )
  );
