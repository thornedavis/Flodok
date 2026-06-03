-- Privatize employee_attachments (employee files — CVs, certificates, etc.).
--
-- Same fix as employee_docs (142): 098 created this bucket public=true with a
-- `to public` read policy, so any stored object URL was world-readable. Writes
-- were already authenticated + org-scoped, and the front end stores file_path,
-- so only the read side + the public flag change here — no data migration. The
-- attachment list now signs file_path on click (manager app only; no portal use).

update storage.buckets set public = false where id = 'employee_attachments';

drop policy if exists "Public can view employee attachments" on storage.objects;

create policy "Org members can view employee attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'employee_attachments'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );
