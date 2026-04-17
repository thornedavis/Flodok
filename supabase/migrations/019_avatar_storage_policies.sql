-- Tighten storage policies for the 'avatars' bucket.
--
-- Before: any authenticated user could upload/update/delete any object in the
-- bucket (see 005_avatars_bucket.sql). That meant users could potentially
-- overwrite other users' avatars, other orgs' logos, or other orgs' employee
-- photos just by knowing the target UUID.
--
-- After: writes are scoped by path:
--   avatars/user/<user_id>.<ext>   — only when <user_id> = auth.uid()
--   avatars/org/<org_id>.<ext>     — only for admin/owner of that org
--   avatars/<employee_id>.<ext>    — only for members of the employee's org
--
-- SELECT stays public (bucket is public; <img> tags load without auth).

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
drop policy if exists "Authenticated users can update avatars" on storage.objects;
drop policy if exists "Authenticated users can delete avatars" on storage.objects;

-- Predicate reused across insert / update / delete. Expressed inline below
-- because Postgres storage policies don't support a shared helper function
-- without also widening the function's search_path.

create policy "Scoped avatar inserts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      -- Own user avatar
      (name like 'user/%'
        and split_part(split_part(name, '/', 2), '.', 1) = auth.uid()::text)
      -- Own org logo, admin/owner only
      or (name like 'org/%'
        and split_part(split_part(name, '/', 2), '.', 1) = public.get_user_org_id()::text
        and public.get_user_role() in ('owner', 'admin'))
      -- Employee photo in caller's org
      or (position('/' in name) = 0
        and exists (
          select 1 from public.employees e
          where e.id::text = split_part(name, '.', 1)
            and e.org_id = public.get_user_org_id()
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
        and exists (
          select 1 from public.employees e
          where e.id::text = split_part(name, '.', 1)
            and e.org_id = public.get_user_org_id()
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
        and exists (
          select 1 from public.employees e
          where e.id::text = split_part(name, '.', 1)
            and e.org_id = public.get_user_org_id()
        ))
    )
  );
